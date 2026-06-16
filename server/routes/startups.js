const express = require('express');
const { db, notify, audit, logCollateralAccess, canViewStartup, isListed, addActivity, areConnected, publicUser, fundamentalScore, thesisFit, FUNDING_LADDER, startupSubscribers } = require('../db');
const { auth, requireRole, requireApprovedInvestor } = require('../authmw');
const { validateUrlFields, validateNumericFields, clampStrings } = require('../security');
const { streamPrivate, deletePrivate, privateExists } = require('../storage');
const { J, qstr, qint } = require('../util');

const WATCHLIST_STATUSES = ['Tracking', 'Intro Call Done', 'Due Diligence', 'Term Sheet', 'Passed'];

const REACTION_EMOJI = ['👏', '🔥', '🎉', '🚀'];

// Attach reaction counts (and the caller's own reaction) to a founder-update row.
function withReactions(u, userId) {
  const counts = {};
  for (const r of db.prepare('SELECT emoji, COUNT(*) c FROM update_reactions WHERE update_id=? GROUP BY emoji').all(u.id)) {
    counts[r.emoji] = r.c;
  }
  const mine = db.prepare('SELECT emoji FROM update_reactions WHERE update_id=? AND user_id=?').get(u.id, userId);
  return { ...u, reactions: counts, my_reaction: mine ? mine.emoji : null };
}

const router = express.Router();
router.use(auth);

function investorProfileOf(user) {
  return user.role === 'investor'
    ? db.prepare('SELECT * FROM investor_profiles WHERE user_id=?').get(user.id)
    : null;
}

function tile(s, userId, ip = null) {
  const upvotes = db.prepare('SELECT COUNT(*) c FROM upvotes WHERE startup_id=?').get(s.id).c;
  const score = fundamentalScore(s);
  const fit = ip ? thesisFit(s, ip) : null;
  const recentViews = db.prepare("SELECT COUNT(*) c FROM startup_views WHERE startup_id=? AND created_at > datetime('now','-7 days')").get(s.id).c;
  const recentUpvotes = db.prepare("SELECT COUNT(*) c FROM upvotes WHERE startup_id=? AND created_at > datetime('now','-7 days')").get(s.id).c;
  return {
    id: s.id, name: s.name, logo: s.logo, sector: s.sector, subsector: s.subsector,
    stage: s.stage, city: s.city, arr: s.arr, mrr: s.mrr, verified: s.verified,
    raising_status: s.raising_status, one_liner: s.one_liner,
    upvotes, views: s.views,
    score: score.total, fit,
    spark: J(s.revenue_series).map(p => p.revenue),
    growth: s.growth,
    momentum: Math.min(100, Math.round(recentUpvotes * 18 + recentViews * 3 + upvotes * 4 + (s.raising_status === 'Actively Raising' ? 10 : 0))),
    has_video: !!s.video_url,
    has_collateral: !!db.prepare('SELECT 1 FROM collateral WHERE startup_id=?').get(s.id),
    saved: !!db.prepare('SELECT 1 FROM watchlist WHERE user_id=? AND startup_id=?').get(userId, s.id),
    upvoted: !!db.prepare('SELECT 1 FROM upvotes WHERE user_id=? AND startup_id=?').get(userId, s.id),
    followers: db.prepare('SELECT COUNT(*) c FROM startup_follows WHERE startup_id=?').get(s.id).c,
    following: !!db.prepare('SELECT 1 FROM startup_follows WHERE user_id=? AND startup_id=?').get(userId, s.id),
    interested: !!db.prepare('SELECT 1 FROM interests WHERE investor_id=? AND startup_id=?').get(userId, s.id),
  };
}

// Unapproved investors cannot browse private deal flow (P0-5). Founders & admins may.
function dealFlowGate(req, res, next) {
  if (req.user.role === 'investor' && !req.user.investor_approved) {
    return res.status(403).json({ error: 'Your investor account is pending approval. Deal flow opens once an administrator approves access.' });
  }
  next();
}

// ---- Discover (marketplace). Mandatory video: unlisted until pitch uploaded. ----
// Filters run in SQL (parameterized), results are paginated, and all query params
// are coerced to strings so hostile array/object inputs cannot crash the route.
router.get('/', dealFlowGate, (req, res) => {
  const sector = qstr(req.query.sector), subsector = qstr(req.query.subsector), stage = qstr(req.query.stage);
  const revenue = qstr(req.query.revenue), geography = qstr(req.query.geography), raising = qstr(req.query.raising);
  const verified = qstr(req.query.verified), sort = qstr(req.query.sort), q = qstr(req.query.q).trim();
  const limit = qint(req.query.limit, 30, 60), offset = qint(req.query.offset, 0);

  const where = ["video_url != ''", 'hidden = 0'];
  const params = [];
  if (q) { where.push('(LOWER(name) LIKE ? OR LOWER(one_liner) LIKE ? OR LOWER(sector) LIKE ?)'); const t = `%${q.toLowerCase()}%`; params.push(t, t, t); }
  if (sector) { where.push('sector = ?'); params.push(sector); }
  if (subsector) { where.push('subsector = ?'); params.push(subsector); }
  if (stage) { where.push('stage = ?'); params.push(stage); }
  if (geography) { where.push('LOWER(city) LIKE ?'); params.push(`%${geography.toLowerCase()}%`); }
  if (raising) { where.push('raising_status = ?'); params.push(raising); }
  if (verified === 'true') where.push('verified > 0');
  if (revenue) {
    const bands = { '0-100k': [0, 1e5], '100k-1m': [1e5, 1e6], '1m-10m': [1e6, 1e7], '10m+': [1e7, 1e15] };
    const [lo, hi] = bands[revenue] || [0, 1e15];
    where.push('(CASE WHEN arr > 0 THEN arr ELSE mrr * 12 END) >= ? AND (CASE WHEN arr > 0 THEN arr ELSE mrr * 12 END) < ?');
    params.push(lo, hi);
  }
  const rows = db.prepare(`SELECT * FROM startups WHERE ${where.join(' AND ')}`).all(...params);
  const ip = investorProfileOf(req.user);
  let tiles = rows.map(s => tile(s, req.user.id, ip));
  if (sort === 'upvoted') tiles.sort((a, b) => b.upvotes - a.upvotes);
  else if (sort === 'viewed') tiles.sort((a, b) => b.views - a.views);
  else if (sort === 'score') tiles.sort((a, b) => b.score - a.score);
  else if (sort === 'fit') tiles.sort((a, b) => (b.fit || 0) - (a.fit || 0));
  else tiles.sort((a, b) => b.id - a.id); // recent
  const total = tiles.length;
  res.json({ startups: tiles.slice(offset, offset + limit), total, limit, offset });
});

router.get('/facets', dealFlowGate, (req, res) => {
  const f = (col) => db.prepare(`SELECT DISTINCT ${col} v FROM startups WHERE ${col} != '' ORDER BY v`).all().map(r => r.v);
  res.json({ sectors: f('sector'), subsectors: f('subsector'), stages: f('stage'), cities: f('city') });
});

// ---- Saved searches ----
router.get('/saved-searches', (req, res) => {
  const rows = db.prepare('SELECT * FROM saved_searches WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  res.json({ searches: rows.map(r => ({ ...r, params: J(r.params, {}) })) });
});
router.post('/saved-searches', (req, res) => {
  const { name, params } = req.body;
  if (!name) return res.status(400).json({ error: 'Give your saved search a name.' });
  db.prepare('INSERT INTO saved_searches (user_id, name, params) VALUES (?,?,?)')
    .run(req.user.id, name, JSON.stringify(params || {}));
  res.json({ ok: true });
});
router.delete('/saved-searches/:id', (req, res) => {
  db.prepare('DELETE FROM saved_searches WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// Deal Alerts: when a startup becomes listed (gains its pitch video), notify every
// user whose saved search matches it.
function fireDealAlerts(s) {
  const bands = { '0-100k': [0, 1e5], '100k-1m': [1e5, 1e6], '1m-10m': [1e6, 1e7], '10m+': [1e7, Infinity] };
  const rows = db.prepare('SELECT * FROM saved_searches WHERE user_id != ?').all(s.founder_id);
  for (const row of rows) {
    let f = {};
    try { f = (JSON.parse(row.params) || {}).filters || {}; } catch { continue; }
    if (f.sector && f.sector !== s.sector) continue;
    if (f.subsector && f.subsector !== s.subsector) continue;
    if (f.stage && f.stage !== s.stage) continue;
    if (f.geography && !s.city.toLowerCase().includes(f.geography.toLowerCase())) continue;
    if (f.raising && f.raising !== s.raising_status) continue;
    if (f.verified && !s.verified) continue;
    if (f.q && !(s.name + ' ' + s.one_liner + ' ' + s.sector).toLowerCase().includes(f.q.toLowerCase())) continue;
    if (f.revenue) {
      const [lo, hi] = bands[f.revenue] || [0, Infinity];
      const rev = s.arr || (s.mrr || 0) * 12;
      if (!(rev >= lo && rev < hi)) continue;
    }
    notify(row.user_id, 'Deal Alert', `New match for your saved search "${row.name}": ${s.name} (${s.sector} · ${s.stage}) just listed.`, `/startup/${s.id}`);
  }
}

// ---- Create / update own startup (founder onboarding + settings) ----
const FIELDS = ['name','sector','subsector','stage','city','founded_year','raising_status','raising_amount',
  'one_liner','problem','solution','business_model','market_size','competitive_advantage','round_details',
  'arr','mrr','growth','gross_margin','burn','runway','cac','ltv','deployment_timeline','strategic_objectives','logo','cover','video_url','video_duration','public_share'];

const MAX_PITCH_SECONDS = 12 * 60; // mandatory 12-minute pitch ceiling (P0-8)

router.post('/mine', requireRole('founder'), (req, res) => {
  const existing = db.prepare('SELECT * FROM startups WHERE founder_id=?').get(req.user.id);
  const b = req.body;
  // URLs render as src/href in the client — reject javascript: and friends (stored XSS)
  const urlErr = validateUrlFields(b, ['logo', 'cover', 'video_url']);
  if (urlErr) return res.status(400).json({ error: urlErr });
  const numErr = validateNumericFields(b, ['arr', 'mrr', 'growth', 'gross_margin', 'burn', 'runway', 'cac', 'ltv', 'founded_year', 'video_duration']);
  if (numErr) return res.status(400).json({ error: numErr });
  // F-003: pitch-video policy is enforced ENTIRELY server-side. When the video
  // changes we re-probe the duration from the uploaded file ourselves and ignore
  // any client-reported value; external URLs are not accepted for the required
  // pitch because their length cannot be verified safely. Verified duration is
  // re-derived on every change, so a replacement can never inherit an old value.
  const existingVideo = existing ? existing.video_url : '';
  const changingVideo = b.video_url !== undefined && b.video_url !== '' && b.video_url !== existingVideo;
  if (changingVideo) {
    if (!/^\/uploads\//.test(String(b.video_url))) {
      return res.status(400).json({ error: 'Upload your pitch video here so we can verify it is 12 minutes or less. External video links are not accepted for the pitch.' });
    }
    const filePath = require('path').join(__dirname, '..', 'uploads', require('path').basename(String(b.video_url)));
    const probed = require('../videometa').probeVideoDuration(filePath);
    if (probed == null) {
      return res.status(400).json({ error: 'We could not read that video. Please re-upload an MP4/MOV pitch.' });
    }
    if (probed > MAX_PITCH_SECONDS) {
      return res.status(400).json({ error: `Your pitch is ${Math.round(probed / 60)} minutes. The maximum is 12 minutes — please trim it.` });
    }
    b.video_duration = Math.round(probed); // authoritative; overwrite any client value
  }
  clampStrings(b, ['name', 'sector', 'subsector', 'stage', 'city', 'raising_status', 'raising_amount', 'one_liner'], 200);
  clampStrings(b, ['problem', 'solution', 'business_model', 'market_size', 'competitive_advantage', 'round_details', 'deployment_timeline', 'strategic_objectives'], 5000);
  const data = {};
  for (const f of FIELDS) if (b[f] !== undefined) data[f] = b[f];
  if (data.public_share !== undefined) data.public_share = data.public_share ? 1 : 0; // boolean column
  for (const jf of ['revenue_series', 'video_chapters', 'use_of_funds']) {
    if (b[jf] !== undefined) data[jf] = JSON.stringify(b[jf]);
  }
  if (existing) {
    const keys = Object.keys(data);
    if (keys.length) {
      db.prepare(`UPDATE startups SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`)
        .run(...keys.map(k => data[k]), existing.id);
    }
    // F-005: audit-log public-sharing enable/disable transitions.
    if (data.public_share !== undefined && data.public_share !== existing.public_share) {
      audit(req.user.id, data.public_share ? 'enable-public-share' : 'disable-public-share', { targetType: 'startup', targetId: existing.id, ip: req.ip });
    }
    // Newly listed (video just added) → fire deal alerts for matching saved searches
    if (!existing.video_url && data.video_url) {
      fireDealAlerts(db.prepare('SELECT * FROM startups WHERE id=?').get(existing.id));
    }
    return res.json({ id: existing.id });
  }
  if (!data.name) return res.status(400).json({ error: 'Enter your startup name to continue.' });
  const cols = Object.keys(data);
  const info = db.prepare(`INSERT INTO startups (founder_id, ${cols.join(',')}) VALUES (?, ${cols.map(() => '?').join(',')})`)
    .run(req.user.id, ...cols.map(k => data[k]));
  addActivity(info.lastInsertRowid, 'Round Opened',
    data.raising_status === 'Actively Raising' ? `${data.name} opened a round${data.raising_amount ? ' — raising ' + data.raising_amount : ''}` : `${data.name} joined Fundamental`);
  if (data.video_url) fireDealAlerts(db.prepare('SELECT * FROM startups WHERE id=?').get(info.lastInsertRowid));
  res.json({ id: info.lastInsertRowid });
});

router.get('/mine', requireRole('founder'), (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE founder_id=?').get(req.user.id);
  if (!s) return res.json({ startup: null });
  res.json({ startup: { ...s, revenue_series: J(s.revenue_series), video_chapters: J(s.video_chapters), use_of_funds: J(s.use_of_funds) } });
});

// Deals co-investors have shared with me. Declared before "/:id" so the literal
// path is not swallowed by the dynamic route.
router.get('/shared-with-me', requireApprovedInvestor, (req, res) => {
  const rows = db.prepare(`SELECT ds.id, ds.note, ds.created_at, u.id from_id, u.name from_name, u.photo from_photo,
      s.id startup_id, s.name, s.logo, s.sector, s.stage, s.one_liner, s.verified
    FROM deal_shares ds JOIN users u ON u.id=ds.from_id JOIN startups s ON s.id=ds.startup_id
    WHERE ds.to_id=? ORDER BY ds.id DESC`).all(req.user.id);
  res.json({ shared: rows });
});

// ---- Full startup profile ----
router.get('/:id', dealFlowGate, (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'We could not find this startup.' });
  // Draft/unlisted startups are visible only to their owner and admins (P0-4).
  if (!canViewStartup(s, req.user)) return res.status(404).json({ error: 'We could not find this startup.' });
  const isOwner = s.founder_id === req.user.id;
  if (!isOwner) {
    // De-duplicate views: at most one counted view per viewer per 6 hours (P2-10).
    const recentView = db.prepare("SELECT 1 FROM startup_views WHERE user_id=? AND startup_id=? AND created_at > datetime('now','-6 hours')").get(req.user.id, s.id);
    if (!recentView) {
      db.prepare('UPDATE startups SET views = views + 1 WHERE id=?').run(s.id);
      db.prepare('INSERT INTO startup_views (user_id, startup_id) VALUES (?,?)').run(req.user.id, s.id);
    }
    if (req.user.role === 'investor') {
      const txt = `${req.user.name} viewed your startup profile.`;
      const dup = db.prepare("SELECT 1 FROM notifications WHERE user_id=? AND type='Profile Viewed' AND text=? AND created_at > datetime('now','-1 day')").get(s.founder_id, txt);
      if (!dup) notify(s.founder_id, 'Profile Viewed', txt, `/startup/${s.id}`);
    }
  }
  const founder = publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(s.founder_id));
  const connected = areConnected(req.user.id, s.founder_id);
  const collateral = db.prepare('SELECT * FROM collateral WHERE startup_id=? ORDER BY id DESC').all(s.id).map(c => {
    const myReq = db.prepare('SELECT status FROM access_requests WHERE collateral_id=? AND investor_id=?').get(c.id, req.user.id);
    const can = isOwner || c.access_level === 'Public' ||
      (c.access_level === 'Connected Only' && connected) ||
      (myReq && myReq.status === 'approved');
    const out = { ...c, can_view: !!can, my_request: myReq ? myReq.status : null, has_file: !!(c.file_key || c.file_url) };
    // Never expose the private storage key, and never expose the external file URL
    // to viewers without access — the data room must be permissioned (P0-3).
    delete out.file_key;
    if (!can) out.file_url = '';
    return out;
  });
  const conn = db.prepare(
    'SELECT * FROM connections WHERE (requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?)'
  ).get(req.user.id, s.founder_id, s.founder_id, req.user.id);
  const score = fundamentalScore(s);
  const stageIndex = FUNDING_LADDER.indexOf(s.stage);
  res.json({
    startup: {
      ...s, revenue_series: J(s.revenue_series), video_chapters: J(s.video_chapters), use_of_funds: J(s.use_of_funds),
      upvotes: db.prepare('SELECT COUNT(*) c FROM upvotes WHERE startup_id=?').get(s.id).c,
      upvoted: !!db.prepare('SELECT 1 FROM upvotes WHERE user_id=? AND startup_id=?').get(req.user.id, s.id),
      saved: !!db.prepare('SELECT 1 FROM watchlist WHERE user_id=? AND startup_id=?').get(req.user.id, s.id),
      followers: db.prepare('SELECT COUNT(*) c FROM startup_follows WHERE startup_id=?').get(s.id).c,
      following: !!db.prepare('SELECT 1 FROM startup_follows WHERE user_id=? AND startup_id=?').get(req.user.id, s.id),
      interest_count: db.prepare('SELECT COUNT(*) c FROM interests WHERE startup_id=?').get(s.id).c,
      interested: !!db.prepare('SELECT 1 FROM interests WHERE investor_id=? AND startup_id=?').get(req.user.id, s.id),
    },
    score,
    journey: { ladder: FUNDING_LADDER, current: stageIndex, stage: s.stage, reached_at: s.stage_reached_at },
    fit: thesisFit(s, investorProfileOf(req.user)),
    updates: db.prepare('SELECT * FROM founder_updates WHERE startup_id=? ORDER BY id DESC LIMIT 12').all(s.id).map(u => withReactions(u, req.user.id)),
    founder, connected, is_owner: isOwner,
    connection_status: conn ? conn.status : null,
    connection_direction: conn ? (conn.requester_id === req.user.id ? 'outgoing' : 'incoming') : null,
    collateral,
    activity: db.prepare('SELECT * FROM activities WHERE startup_id=? ORDER BY id DESC LIMIT 25').all(s.id),
    notes: req.user.role === 'investor'
      ? db.prepare('SELECT * FROM notes WHERE investor_id=? AND startup_id=? ORDER BY id DESC').all(req.user.id, s.id) : [],
    upvote_trend: db.prepare(
      "SELECT date(created_at) d, COUNT(*) c FROM upvotes WHERE startup_id=? GROUP BY d ORDER BY d DESC LIMIT 14"
    ).all(s.id).reverse(),
  });
});

router.post('/:id/video-view', dealFlowGate, (req, res) => {
  db.prepare('UPDATE startups SET video_views = video_views + 1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// One upvote per investor per startup.
router.post('/:id/upvote', requireApprovedInvestor, (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=?').get(req.params.id);
  if (!s || !canViewStartup(s, req.user)) return res.status(404).json({ error: 'We could not find this startup.' });
  const existing = db.prepare('SELECT 1 FROM upvotes WHERE user_id=? AND startup_id=?').get(req.user.id, s.id);
  if (existing) {
    db.prepare('DELETE FROM upvotes WHERE user_id=? AND startup_id=?').run(req.user.id, s.id);
  } else {
    db.prepare('INSERT INTO upvotes (user_id, startup_id) VALUES (?,?)').run(req.user.id, s.id);
    notify(s.founder_id, 'Upvote Received', `${req.user.name} upvoted ${s.name}.`, `/startup/${s.id}`);
  }
  res.json({ upvoted: !existing, upvotes: db.prepare('SELECT COUNT(*) c FROM upvotes WHERE startup_id=?').get(s.id).c });
});

router.post('/:id/save', dealFlowGate, (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=?').get(req.params.id);
  if (!s || !canViewStartup(s, req.user)) return res.status(404).json({ error: 'We could not find this startup.' });
  const exists = db.prepare('SELECT 1 FROM watchlist WHERE user_id=? AND startup_id=?').get(req.user.id, s.id);
  if (exists) db.prepare('DELETE FROM watchlist WHERE user_id=? AND startup_id=?').run(req.user.id, s.id);
  else db.prepare('INSERT INTO watchlist (user_id, startup_id) VALUES (?,?)').run(req.user.id, s.id);
  res.json({ saved: !exists });
});

router.post('/:id/watchlist-status', requireApprovedInvestor, (req, res) => {
  const status = req.body.status || 'Tracking';
  if (!WATCHLIST_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid pipeline stage.' });
  const exists = db.prepare('SELECT 1 FROM watchlist WHERE user_id=? AND startup_id=?').get(req.user.id, req.params.id);
  if (!exists) return res.status(404).json({ error: 'Save this startup to your pipeline first.' });
  db.prepare('UPDATE watchlist SET status=? WHERE user_id=? AND startup_id=?').run(status, req.user.id, req.params.id);
  res.json({ ok: true });
});

// Private notes — visible only to the creating investor.
router.post('/:id/notes', requireApprovedInvestor, (req, res) => {
  const { text, collateral_id } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Write a note before saving.' });
  // A note "on a document" must reference collateral that belongs to this startup (P2-6).
  if (collateral_id != null) {
    const owns = db.prepare('SELECT 1 FROM collateral WHERE id=? AND startup_id=?').get(collateral_id, req.params.id);
    if (!owns) return res.status(400).json({ error: 'That document does not belong to this startup.' });
  }
  db.prepare('INSERT INTO notes (investor_id, startup_id, collateral_id, text) VALUES (?,?,?,?)')
    .run(req.user.id, req.params.id, collateral_id || null, text.trim().slice(0, 5000));
  res.json({ notes: db.prepare('SELECT * FROM notes WHERE investor_id=? AND startup_id=? ORDER BY id DESC').all(req.user.id, req.params.id) });
});
router.delete('/notes/:noteId', requireRole('investor'), (req, res) => {
  db.prepare('DELETE FROM notes WHERE id=? AND investor_id=?').run(req.params.noteId, req.user.id);
  res.json({ ok: true });
});

// ---- AI Investment Memo (structured-data synthesis engine) ----
router.get('/:id/memo', requireApprovedInvestor, (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=?').get(req.params.id);
  if (!s || !canViewStartup(s, req.user)) return res.status(404).json({ error: 'We could not find this startup.' });
  const score = fundamentalScore(s);
  const fit = thesisFit(s, investorProfileOf(req.user));
  const founder = db.prepare('SELECT name, headline, education, experience, verified FROM users WHERE id=?').get(s.founder_id);
  const collateral = db.prepare('SELECT title, type, access_level FROM collateral WHERE startup_id=?').all(s.id);
  const updates = db.prepare('SELECT * FROM founder_updates WHERE startup_id=? ORDER BY id DESC LIMIT 6').all(s.id);
  const upvotes = db.prepare('SELECT COUNT(*) c FROM upvotes WHERE startup_id=?').get(s.id).c;

  const money = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`;
  const rev = s.arr || (s.mrr || 0) * 12;
  const ltvCac = s.cac > 0 && s.ltv > 0 ? +(s.ltv / s.cac).toFixed(1) : null;
  const burnRatio = s.burn > 0 && s.mrr > 0 ? +(s.burn / s.mrr).toFixed(1) : null;
  const freshUpdate = updates[0] && (Date.now() - new Date(updates[0].created_at + 'Z')) < 45 * 864e5;

  const strengths = [];
  if (s.verified) strengths.push('Platform-verified profile and founder identity.');
  if (s.growth >= 15) strengths.push(`Growth of ${s.growth}% MoM is top-decile for ${s.stage} companies.`);
  if (s.gross_margin >= 60) strengths.push(`Gross margin of ${s.gross_margin}% supports venture-scale economics.`);
  if (ltvCac && ltvCac >= 3) strengths.push(`LTV/CAC of ${ltvCac}x clears the 3x efficiency benchmark.`);
  if (rev >= 1e6) strengths.push(`Revenue scale (${money(rev)} annualised) de-risks product-market fit.`);
  if (freshUpdate) strengths.push('Founder publishes regular investor updates — strong communication signal.');
  if (founder?.experience) strengths.push(`Founder background: ${founder.experience}.`);

  const risks = [];
  if (s.runway > 0 && s.runway < 12) risks.push(`Runway of ${s.runway} months is below the 12-month diligence threshold — confirm bridge plan.`);
  if (!rev) risks.push('Pre-revenue: thesis rests entirely on team and market timing.');
  if (rev && s.growth < 5) risks.push(`Growth of ${s.growth}% MoM is below venture pace — probe pipeline and churn.`);
  if (s.gross_margin > 0 && s.gross_margin < 40) risks.push(`Gross margin of ${s.gross_margin}% — interrogate the path to software-grade margins.`);
  if (ltvCac && ltvCac < 2) risks.push(`LTV/CAC of ${ltvCac}x is below 2x — unit economics not yet proven.`);
  if (burnRatio && burnRatio > 1.5) risks.push(`Burning ${burnRatio}x monthly revenue — efficiency needs a clear inflection story.`);
  if (!s.verified) risks.push('Not yet platform-verified — request verification before term sheet.');
  if (!freshUpdate) risks.push('No investor update in 45+ days — ask why before progressing.');

  const diligence = [];
  const docTypes = collateral.map(c => c.type);
  if (!docTypes.includes('Cap Table')) diligence.push('Request cap table (not in data room).');
  if (!docTypes.includes('Financial Model')) diligence.push('Request 3-year financial model (not in data room).');
  diligence.push('Validate revenue claims against bank/payment-provider statements.');
  if (s.cac > 0) diligence.push('Request CAC cohort breakdown by channel.');
  diligence.push(`Reference checks: 2–3 customers plus former colleagues of ${founder?.name || 'the founder'}.`);

  res.json({
    title: `Investment Memo — ${s.name}`,
    generated_at: new Date().toISOString(),
    disclaimer: 'Auto-generated from structured platform data. Not investment advice — verify all figures in diligence.',
    sections: [
      { h: 'Snapshot', body: [`${s.name} · ${s.sector}${s.subsector ? ' / ' + s.subsector : ''} · ${s.stage} · ${s.city} · Founded ${s.founded_year || '—'}`, `Round: ${s.raising_status}${s.raising_amount ? ' — ' + s.raising_amount : ''}`, `Fundamental Score: ${score.total}/100 (completeness ${score.breakdown.completeness}/40 · traction ${score.breakdown.traction}/30 · engagement ${score.breakdown.engagement}/20 · trust ${score.breakdown.trust}/10)`, fit != null ? `Thesis fit with your mandate: ${fit}%` : null, `Investor conviction on platform: ${upvotes} upvotes`].filter(Boolean) },
      { h: 'Positioning', body: [s.one_liner, s.problem && `Problem — ${s.problem}`, s.solution && `Solution — ${s.solution}`].filter(Boolean) },
      { h: 'Market & Model', body: [s.market_size && `Market — ${s.market_size}`, s.business_model && `Model — ${s.business_model}`, s.competitive_advantage && `Moat — ${s.competitive_advantage}`].filter(Boolean) },
      { h: 'Traction & Unit Economics', body: [rev ? `Revenue: ${money(rev)} annualised${s.mrr ? ` (${money(s.mrr)} MRR)` : ''}, growing ${s.growth}% MoM` : 'Pre-revenue.', s.gross_margin > 0 && `Gross margin: ${s.gross_margin}%`, ltvCac && `LTV/CAC: ${ltvCac}x (${money(s.ltv)} / ${money(s.cac)})`, s.burn > 0 && `Burn: ${money(s.burn)}/mo${burnRatio ? ` (${burnRatio}x MRR)` : ''} · Runway: ${s.runway} months`].filter(Boolean) },
      { h: 'The Round', body: [s.round_details || 'No round details provided.', s.deployment_timeline && s.deployment_timeline !== '—' && `Deployment — ${s.deployment_timeline}`, s.strategic_objectives && `Objectives — ${s.strategic_objectives}`].filter(Boolean) },
      { h: 'Team', body: [`${founder?.name}${founder?.verified ? ' (verified)' : ''} — ${founder?.headline || 'Founder'}`, founder?.education && `Education: ${founder.education}`, founder?.experience && `Experience: ${founder.experience}`].filter(Boolean) },
      { h: 'Strengths', body: strengths.length ? strengths : ['Insufficient data — request a complete profile.'] },
      { h: 'Risks & Open Questions', body: risks.length ? risks : ['No automated flags raised — proceed to standard diligence.'] },
      { h: 'Suggested Diligence', body: diligence },
      { h: 'Recent Founder Updates', body: updates.length ? updates.map(u => `${u.headline} — ${u.body}`) : ['None published yet.'] },
    ],
  });
});

// ---- Collateral (structured data room) ----
router.post('/:id/collateral', requireRole('founder'), (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=? AND founder_id=?').get(req.params.id, req.user.id);
  if (!s) return res.status(403).json({ error: 'You can only manage your own startup.' });
  const { title, type, access_level, file_url, file_key } = req.body;
  const TYPES = ['Deck', 'IM', 'Financial Model', 'Industry Overview', 'Product Demo', 'Cap Table'];
  const LEVELS = ['Public', 'Request Access', 'Connected Only'];
  if (!title || !TYPES.includes(type)) return res.status(400).json({ error: 'Add a title and choose a valid document type.' });
  if (access_level && !LEVELS.includes(access_level)) return res.status(400).json({ error: 'Choose a valid access level.' });
  // file_url is an external link (validated); file_key is a private upload reference.
  const urlErr = validateUrlFields(req.body, ['file_url']);
  if (urlErr) return res.status(400).json({ error: urlErr });
  let key = '';
  if (file_key) {
    key = require('path').basename(String(file_key));
    if (!privateExists(key)) return res.status(400).json({ error: 'Re-upload the document and try again.' });
  }
  // F-009: confidential data-room documents default to Request Access, never Public.
  db.prepare('INSERT INTO collateral (startup_id, title, type, access_level, file_url, file_key) VALUES (?,?,?,?,?,?)')
    .run(s.id, String(title).slice(0, 200), type, access_level || 'Request Access', file_url || '', key);
  addActivity(s.id, 'Collateral Uploaded', `New ${type} added: ${title}`);
  res.json({ ok: true });
});
router.put('/collateral/:cid', requireRole('founder'), (req, res) => {
  const c = db.prepare('SELECT c.*, s.founder_id FROM collateral c JOIN startups s ON s.id=c.startup_id WHERE c.id=?').get(req.params.cid);
  if (!c || c.founder_id !== req.user.id) return res.status(403).json({ error: 'You can only manage documents in your own data room.' });
  const { title, access_level } = req.body;
  if (access_level && !['Public', 'Request Access', 'Connected Only'].includes(access_level)) {
    return res.status(400).json({ error: 'Choose a valid access level.' });
  }
  db.prepare('UPDATE collateral SET title=COALESCE(?,title), access_level=COALESCE(?,access_level) WHERE id=?')
    .run(title ? String(title).slice(0, 200) : null, access_level || null, c.id);
  res.json({ ok: true });
});
router.delete('/collateral/:cid', requireRole('founder'), (req, res) => {
  const c = db.prepare('SELECT c.*, s.founder_id FROM collateral c JOIN startups s ON s.id=c.startup_id WHERE c.id=?').get(req.params.cid);
  if (!c || c.founder_id !== req.user.id) return res.status(403).json({ error: 'You can only manage documents in your own data room.' });
  db.prepare('DELETE FROM collateral WHERE id=?').run(c.id);
  if (c.file_key) deletePrivate(c.file_key); // remove the underlying private file (P3-5)
  logCollateralAccess(c.id, c.startup_id, req.user.id, 'delete', req.ip);
  res.json({ ok: true });
});

router.post('/collateral/:cid/request', requireApprovedInvestor, (req, res) => {
  const c = db.prepare('SELECT c.*, s.founder_id, s.name sname FROM collateral c JOIN startups s ON s.id=c.startup_id WHERE c.id=?').get(req.params.cid);
  if (!c) return res.status(404).json({ error: 'We could not find this document.' });
  db.prepare(`INSERT INTO access_requests (collateral_id, investor_id) VALUES (?,?)
    ON CONFLICT(collateral_id, investor_id) DO UPDATE SET status='pending', created_at=datetime('now')`).run(c.id, req.user.id);
  logCollateralAccess(c.id, c.startup_id, req.user.id, 'request', req.ip);
  notify(c.founder_id, 'Collateral Request', `${req.user.name} requested access to "${c.title}" in your ${c.sname} data room.`, `/dashboard`);
  res.json({ ok: true, status: 'pending' });
});

router.post('/access-requests/:rid/:action', requireRole('founder'), (req, res) => {
  const r = db.prepare(`SELECT ar.*, c.title, c.startup_id, s.founder_id, s.name sname FROM access_requests ar
    JOIN collateral c ON c.id=ar.collateral_id JOIN startups s ON s.id=c.startup_id WHERE ar.id=?`).get(req.params.rid);
  if (!r || r.founder_id !== req.user.id) return res.status(403).json({ error: 'You can only manage access requests for your own data room.' });
  const map = { approve: 'approved', reject: 'rejected', revoke: 'revoked' };
  const status = map[req.params.action];
  if (!status) return res.status(400).json({ error: 'Choose a valid action.' });
  db.prepare('UPDATE access_requests SET status=? WHERE id=?').run(status, r.id);
  logCollateralAccess(r.collateral_id, r.startup_id, req.user.id, req.params.action, req.ip);
  if (status === 'approved') notify(r.investor_id, 'Access Approved', `Your access to "${r.title}" in the ${r.sname} data room was approved.`, `/startup/${r.startup_id}`);
  res.json({ ok: true });
});

router.get('/:id/access-requests', requireRole('founder'), (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=? AND founder_id=?').get(req.params.id, req.user.id);
  if (!s) return res.status(403).json({ error: 'You can only manage your own startup.' });
  const rows = db.prepare(`SELECT ar.*, c.title, c.type, u.name investor_name, u.id investor_id FROM access_requests ar
    JOIN collateral c ON c.id=ar.collateral_id JOIN users u ON u.id=ar.investor_id
    WHERE c.startup_id=? ORDER BY ar.id DESC`).all(s.id);
  res.json({ requests: rows });
});

// Authenticated download: re-checks access on EVERY request and streams the file
// from private storage. Revocation takes effect immediately (P0-3, P1-3).
function collateralAccessCheck(req, res, next) {
  const c = db.prepare('SELECT c.*, s.founder_id, s.video_url, s.hidden FROM collateral c JOIN startups s ON s.id=c.startup_id WHERE c.id=?').get(req.params.cid);
  if (!c) return res.status(404).json({ error: 'We could not find this document.' });
  const isOwner = c.founder_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  // F-002: startup-level visibility dominates document-level access. A "Public"
  // flag must never override a hidden/draft/unlisted startup. Owner/admin bypass.
  const startup = { founder_id: c.founder_id, video_url: c.video_url, hidden: c.hidden };
  if (!isOwner && !isAdmin && !canViewStartup(startup, req.user)) {
    return res.status(404).json({ error: 'We could not find this document.' });
  }
  // F-001: a non-owner investor must be an approved investor to reach any deal-flow document.
  if (!isOwner && !isAdmin && req.user.role === 'investor' && !req.user.investor_approved) {
    return res.status(403).json({ error: 'Your investor account is pending approval.' });
  }
  const approved = db.prepare("SELECT 1 FROM access_requests WHERE collateral_id=? AND investor_id=? AND status='approved'").get(c.id, req.user.id);
  const can = isOwner || isAdmin || c.access_level === 'Public' ||
    (c.access_level === 'Connected Only' && areConnected(req.user.id, c.founder_id)) || !!approved;
  if (!can) return res.status(403).json({ error: 'You do not have access to this document yet. Request access from the founder.' });
  req.collateral = c;
  next();
}

router.get('/collateral/:cid/download', collateralAccessCheck, (req, res) => {
  const c = req.collateral;
  db.prepare('UPDATE collateral SET downloads = downloads + 1 WHERE id=?').run(c.id);
  logCollateralAccess(c.id, c.startup_id, req.user.id, 'download', req.ip);
  if (c.file_key) {
    if (!streamPrivate(res, c.file_key, c.title)) return res.status(404).json({ error: 'The document file is no longer available.' });
    return; // streamed
  }
  if (c.file_url) return res.json({ ok: true, url: c.file_url }); // external link (client opens with noopener)
  res.status(404).json({ error: 'No file is attached to this document yet.' });
});

// Back-compat POST: counts + logs access, returns external URL if any (no file stream).
router.post('/collateral/:cid/download', collateralAccessCheck, (req, res) => {
  const c = req.collateral;
  db.prepare('UPDATE collateral SET downloads = downloads + 1 WHERE id=?').run(c.id);
  logCollateralAccess(c.id, c.startup_id, req.user.id, 'download', req.ip);
  res.json({ ok: true, url: c.file_key ? `/api/startups/collateral/${c.id}/download` : (c.file_url || '') });
});

// Founder Updates — structured investor updates that keep watchers coming back.
router.post('/:id/updates', requireRole('founder'), (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=? AND founder_id=?').get(req.params.id, req.user.id);
  if (!s) return res.status(403).json({ error: 'You can only post updates for your own startup.' });
  const numErr = validateNumericFields(req.body, ['arr', 'mrr', 'growth']);
  if (numErr) return res.status(400).json({ error: numErr });
  const { headline, body, arr, mrr, growth } = req.body;
  if (!headline || !headline.trim()) return res.status(400).json({ error: 'Add a headline for your update.' });
  if (!body || !body.trim()) return res.status(400).json({ error: 'Write the body of your update.' });
  if (body.trim().length > 400) return res.status(400).json({ error: 'Updates are limited to 400 characters. Keep it concise.' });
  db.prepare('INSERT INTO founder_updates (startup_id, headline, body, arr, mrr, growth) VALUES (?,?,?,?,?,?)')
    .run(s.id, headline.trim().slice(0, 120), body.trim(), arr ?? null, mrr ?? null, growth ?? null);
  // Refresh headline metrics on the startup when provided
  if (arr != null || mrr != null || growth != null) {
    db.prepare('UPDATE startups SET arr=COALESCE(?,arr), mrr=COALESCE(?,mrr), growth=COALESCE(?,growth) WHERE id=?')
      .run(arr ?? null, mrr ?? null, growth ?? null, s.id);
  }
  addActivity(s.id, 'Milestone Achieved', `Investor update: ${headline.trim()}`);
  for (const uid of startupSubscribers(s.id, req.user.id)) {
    notify(uid, 'New Message', `${s.name} posted an investor update: "${headline.trim()}".`, `/startup/${s.id}`);
  }
  res.json({ ok: true });
});

// React to a founder update (one quick reaction per user; tap again to remove,
// tap a different emoji to switch).
router.post('/updates/:uid/react', dealFlowGate, (req, res) => {
  const u = db.prepare('SELECT fu.*, s.founder_id, s.name sname FROM founder_updates fu JOIN startups s ON s.id=fu.startup_id WHERE fu.id=?').get(req.params.uid);
  if (!u) return res.status(404).json({ error: 'We could not find this update.' });
  const { emoji } = req.body;
  if (!REACTION_EMOJI.includes(emoji)) return res.status(400).json({ error: 'Choose a valid reaction.' });
  const existing = db.prepare('SELECT emoji FROM update_reactions WHERE user_id=? AND update_id=?').get(req.user.id, u.id);
  if (existing && existing.emoji === emoji) {
    db.prepare('DELETE FROM update_reactions WHERE user_id=? AND update_id=?').run(req.user.id, u.id);
  } else {
    db.prepare(`INSERT INTO update_reactions (user_id, update_id, emoji) VALUES (?,?,?)
      ON CONFLICT(user_id, update_id) DO UPDATE SET emoji=excluded.emoji`).run(req.user.id, u.id, emoji);
    if (!existing && u.founder_id !== req.user.id) {
      notify(u.founder_id, 'Upvote Received', `${req.user.name} reacted ${emoji} to your ${u.sname} update.`, `/startup/${u.startup_id}`);
    }
  }
  res.json(withReactions(db.prepare('SELECT * FROM founder_updates WHERE id=?').get(u.id), req.user.id));
});

// ---- Follow a company (anyone). Subscribes to its updates & milestones. ----
router.post('/:id/follow', dealFlowGate, (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Startup not found' });
  const exists = db.prepare('SELECT 1 FROM startup_follows WHERE user_id=? AND startup_id=?').get(req.user.id, s.id);
  if (exists) {
    db.prepare('DELETE FROM startup_follows WHERE user_id=? AND startup_id=?').run(req.user.id, s.id);
  } else {
    db.prepare('INSERT INTO startup_follows (user_id, startup_id) VALUES (?,?)').run(req.user.id, s.id);
    if (s.founder_id !== req.user.id) notify(s.founder_id, 'Profile Viewed', `${req.user.name} started following ${s.name}`, `/startup/${s.id}`);
  }
  res.json({ following: !exists, followers: db.prepare('SELECT COUNT(*) c FROM startup_follows WHERE startup_id=?').get(s.id).c });
});

// ---- Express Interest (investor → founder, one tap). ----
router.post('/:id/interest', requireApprovedInvestor, (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=?').get(req.params.id);
  if (!s || !canViewStartup(s, req.user)) return res.status(404).json({ error: 'We could not find this startup.' });
  const exists = db.prepare('SELECT 1 FROM interests WHERE investor_id=? AND startup_id=?').get(req.user.id, s.id);
  if (exists) {
    db.prepare('DELETE FROM interests WHERE investor_id=? AND startup_id=?').run(req.user.id, s.id);
  } else {
    db.prepare('INSERT INTO interests (investor_id, startup_id) VALUES (?,?)').run(req.user.id, s.id);
    const fund = (db.prepare('SELECT fund_name FROM investor_profiles WHERE user_id=?').get(req.user.id) || {}).fund_name;
    notify(s.founder_id, 'Connection Request', `${req.user.name}${fund ? ` (${fund})` : ''} expressed interest in ${s.name}`, `/startup/${s.id}`);
    addActivity(s.id, 'Milestone Achieved', `An investor expressed interest`);
  }
  res.json({ interested: !exists, interest_count: db.prepare('SELECT COUNT(*) c FROM interests WHERE startup_id=?').get(s.id).c });
});

// ---- Funding journey: advance to the next public stage (celebratory). ----
router.post('/:id/advance-stage', requireRole('founder'), (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=? AND founder_id=?').get(req.params.id, req.user.id);
  if (!s) return res.status(403).json({ error: 'Not your startup' });
  const { stage } = req.body;
  const idx = FUNDING_LADDER.indexOf(stage);
  if (idx < 0) return res.status(400).json({ error: 'Pick a valid funding stage' });
  if (stage === s.stage) return res.status(400).json({ error: 'Already at this stage' });
  db.prepare("UPDATE startups SET stage=?, stage_reached_at=datetime('now') WHERE id=?").run(stage, s.id);
  const advancing = idx > FUNDING_LADDER.indexOf(s.stage);
  addActivity(s.id, 'Milestone Achieved', advancing ? `🎉 ${s.name} reached ${stage}` : `${s.name} updated its stage to ${stage}`);
  if (advancing) {
    for (const uid of startupSubscribers(s.id, req.user.id)) {
      notify(uid, 'Milestone Achieved', `🎉 ${s.name} just reached ${stage}`, `/startup/${s.id}`);
    }
  }
  res.json({ ok: true, stage });
});

// ---- Share a deal with a connected co-investor. ----
router.post('/:id/share-deal', requireApprovedInvestor, (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=?').get(req.params.id);
  if (!s || !canViewStartup(s, req.user)) return res.status(404).json({ error: 'We could not find this startup.' });
  const toId = Number(req.body.to_id);
  if (!toId || toId === req.user.id) return res.status(400).json({ error: 'Pick a co-investor to share with' });
  const target = db.prepare('SELECT id, name, role FROM users WHERE id=?').get(toId);
  if (!target || target.role !== 'investor') return res.status(400).json({ error: 'You can only share deals with other investors' });
  if (!areConnected(req.user.id, toId)) return res.status(403).json({ error: 'Connect with this investor before sharing deals' });
  const note = String(req.body.note || '').slice(0, 500);
  db.prepare(`INSERT INTO deal_shares (from_id, to_id, startup_id, note) VALUES (?,?,?,?)
    ON CONFLICT(from_id, to_id, startup_id) DO UPDATE SET note=excluded.note, created_at=datetime('now')`)
    .run(req.user.id, toId, s.id, note);
  notify(toId, 'New Message', `${req.user.name} shared a deal with you: ${s.name}`, `/watchlist`);
  res.json({ ok: true });
});

// Set deal-flow tags on a pipeline (watchlist) entry.
router.post('/:id/watchlist-tags', requireApprovedInvestor, (req, res) => {
  const tags = Array.isArray(req.body.tags) ? req.body.tags : null;
  if (!tags) return res.status(400).json({ error: 'Tags must be a list' });
  const clean = [...new Set(tags.map(t => String(t).trim().slice(0, 24)).filter(Boolean))].slice(0, 8);
  const exists = db.prepare('SELECT 1 FROM watchlist WHERE user_id=? AND startup_id=?').get(req.user.id, req.params.id);
  if (!exists) return res.status(404).json({ error: 'Save this startup to your pipeline first' });
  db.prepare('UPDATE watchlist SET tags=? WHERE user_id=? AND startup_id=?').run(JSON.stringify(clean), req.user.id, req.params.id);
  res.json({ tags: clean });
});

// Founder posts a milestone / signal to their startup timeline
router.post('/:id/activity', requireRole('founder'), (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=? AND founder_id=?').get(req.params.id, req.user.id);
  if (!s) return res.status(403).json({ error: 'Not your startup' });
  const TYPES = ['Round Opened', 'Round Closed', 'Milestone Achieved', 'Hiring Announcement'];
  const { type, text } = req.body;
  if (!TYPES.includes(type) || !text) return res.status(400).json({ error: 'Valid signal type and text required' });
  addActivity(s.id, type, text);
  res.json({ ok: true });
});

module.exports = router;
