const express = require('express');
const { db, notify, addActivity, areConnected, publicUser, fundamentalScore, thesisFit } = require('../db');
const { auth, requireRole } = require('../authmw');

const router = express.Router();
router.use(auth);

const J = (s, d = []) => { try { return JSON.parse(s) ?? d; } catch { return d; } };

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
    stage: s.stage, city: s.city, arr: s.arr, mrr: s.mrr, verified: !!s.verified,
    raising_status: s.raising_status, one_liner: s.one_liner,
    upvotes, views: s.views,
    score: score.total, fit,
    momentum: Math.min(100, Math.round(recentUpvotes * 18 + recentViews * 3 + upvotes * 4 + (s.raising_status === 'Actively Raising' ? 10 : 0))),
    has_video: !!s.video_url,
    has_collateral: !!db.prepare('SELECT 1 FROM collateral WHERE startup_id=?').get(s.id),
    saved: !!db.prepare('SELECT 1 FROM watchlist WHERE user_id=? AND startup_id=?').get(userId, s.id),
    upvoted: !!db.prepare('SELECT 1 FROM upvotes WHERE user_id=? AND startup_id=?').get(userId, s.id),
  };
}

// ---- Discover (marketplace). Mandatory video: unlisted until pitch uploaded. ----
router.get('/', (req, res) => {
  const { sector, subsector, stage, revenue, geography, raising, verified, sort, q } = req.query;
  let rows = db.prepare("SELECT * FROM startups WHERE video_url != ''").all();
  if (q) rows = rows.filter(s => (s.name + ' ' + s.one_liner + ' ' + s.sector).toLowerCase().includes(q.toLowerCase()));
  if (sector) rows = rows.filter(s => s.sector === sector);
  if (subsector) rows = rows.filter(s => s.subsector === subsector);
  if (stage) rows = rows.filter(s => s.stage === stage);
  if (geography) rows = rows.filter(s => s.city.toLowerCase().includes(geography.toLowerCase()));
  if (raising) rows = rows.filter(s => s.raising_status === raising);
  if (verified === 'true') rows = rows.filter(s => s.verified);
  if (revenue) {
    const bands = { '0-100k': [0, 1e5], '100k-1m': [1e5, 1e6], '1m-10m': [1e6, 1e7], '10m+': [1e7, Infinity] };
    const [lo, hi] = bands[revenue] || [0, Infinity];
    rows = rows.filter(s => { const r = s.arr || s.mrr * 12; return r >= lo && r < hi; });
  }
  const ip = investorProfileOf(req.user);
  let tiles = rows.map(s => tile(s, req.user.id, ip));
  if (sort === 'upvoted') tiles.sort((a, b) => b.upvotes - a.upvotes);
  else if (sort === 'viewed') {
    const v = Object.fromEntries(rows.map(s => [s.id, s.views]));
    tiles.sort((a, b) => v[b.id] - v[a.id]);
  } else if (sort === 'score') tiles.sort((a, b) => b.score - a.score);
  else if (sort === 'fit') tiles.sort((a, b) => (b.fit || 0) - (a.fit || 0));
  else tiles.sort((a, b) => b.id - a.id); // recent
  res.json({ startups: tiles, total: tiles.length });
});

router.get('/facets', (req, res) => {
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
  if (!name) return res.status(400).json({ error: 'Name your search' });
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
    notify(row.user_id, 'Deal Alert', `New match for "${row.name}": ${s.name} (${s.sector} · ${s.stage}) just listed`, `/startup/${s.id}`);
  }
}

// ---- Create / update own startup (founder onboarding + settings) ----
const FIELDS = ['name','sector','subsector','stage','city','founded_year','raising_status','raising_amount',
  'one_liner','problem','solution','business_model','market_size','competitive_advantage','round_details',
  'arr','mrr','growth','gross_margin','burn','runway','cac','ltv','deployment_timeline','strategic_objectives','logo','video_url'];

router.post('/mine', requireRole('founder'), (req, res) => {
  const existing = db.prepare('SELECT * FROM startups WHERE founder_id=?').get(req.user.id);
  const b = req.body;
  const data = {};
  for (const f of FIELDS) if (b[f] !== undefined) data[f] = b[f];
  for (const jf of ['revenue_series', 'video_chapters', 'use_of_funds']) {
    if (b[jf] !== undefined) data[jf] = JSON.stringify(b[jf]);
  }
  if (existing) {
    const keys = Object.keys(data);
    if (keys.length) {
      db.prepare(`UPDATE startups SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`)
        .run(...keys.map(k => data[k]), existing.id);
    }
    // Newly listed (video just added) → fire deal alerts for matching saved searches
    if (!existing.video_url && data.video_url) {
      fireDealAlerts(db.prepare('SELECT * FROM startups WHERE id=?').get(existing.id));
    }
    return res.json({ id: existing.id });
  }
  if (!data.name) return res.status(400).json({ error: 'Startup name is required' });
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

// ---- Full startup profile ----
router.get('/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Startup not found' });
  const isOwner = s.founder_id === req.user.id;
  if (!isOwner) {
    db.prepare('UPDATE startups SET views = views + 1 WHERE id=?').run(s.id);
    db.prepare('INSERT INTO startup_views (user_id, startup_id) VALUES (?,?)').run(req.user.id, s.id);
    if (req.user.role === 'investor') {
      // De-duplicate: at most one view notification per viewer per day
      const txt = `${req.user.name} viewed your startup profile`;
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
    return { ...c, can_view: !!can, my_request: myReq ? myReq.status : null };
  });
  const conn = db.prepare(
    'SELECT * FROM connections WHERE (requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?)'
  ).get(req.user.id, s.founder_id, s.founder_id, req.user.id);
  const score = fundamentalScore(s);
  res.json({
    startup: {
      ...s, revenue_series: J(s.revenue_series), video_chapters: J(s.video_chapters), use_of_funds: J(s.use_of_funds),
      upvotes: db.prepare('SELECT COUNT(*) c FROM upvotes WHERE startup_id=?').get(s.id).c,
      upvoted: !!db.prepare('SELECT 1 FROM upvotes WHERE user_id=? AND startup_id=?').get(req.user.id, s.id),
      saved: !!db.prepare('SELECT 1 FROM watchlist WHERE user_id=? AND startup_id=?').get(req.user.id, s.id),
    },
    score,
    fit: thesisFit(s, investorProfileOf(req.user)),
    updates: db.prepare('SELECT * FROM founder_updates WHERE startup_id=? ORDER BY id DESC LIMIT 12').all(s.id),
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

router.post('/:id/video-view', (req, res) => {
  db.prepare('UPDATE startups SET video_views = video_views + 1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// One upvote per investor per startup.
router.post('/:id/upvote', requireRole('investor'), (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Startup not found' });
  const existing = db.prepare('SELECT 1 FROM upvotes WHERE user_id=? AND startup_id=?').get(req.user.id, s.id);
  if (existing) {
    db.prepare('DELETE FROM upvotes WHERE user_id=? AND startup_id=?').run(req.user.id, s.id);
  } else {
    db.prepare('INSERT INTO upvotes (user_id, startup_id) VALUES (?,?)').run(req.user.id, s.id);
    notify(s.founder_id, 'Upvote Received', `${req.user.name} upvoted ${s.name}`, `/startup/${s.id}`);
  }
  res.json({ upvoted: !existing, upvotes: db.prepare('SELECT COUNT(*) c FROM upvotes WHERE startup_id=?').get(s.id).c });
});

router.post('/:id/save', (req, res) => {
  const exists = db.prepare('SELECT 1 FROM watchlist WHERE user_id=? AND startup_id=?').get(req.user.id, req.params.id);
  if (exists) db.prepare('DELETE FROM watchlist WHERE user_id=? AND startup_id=?').run(req.user.id, req.params.id);
  else db.prepare('INSERT INTO watchlist (user_id, startup_id) VALUES (?,?)').run(req.user.id, req.params.id);
  res.json({ saved: !exists });
});

router.post('/:id/watchlist-status', requireRole('investor'), (req, res) => {
  db.prepare('UPDATE watchlist SET status=? WHERE user_id=? AND startup_id=?')
    .run(req.body.status || 'Tracking', req.user.id, req.params.id);
  res.json({ ok: true });
});

// Private notes — visible only to the creating investor.
router.post('/:id/notes', requireRole('investor'), (req, res) => {
  const { text, collateral_id } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Note text required' });
  db.prepare('INSERT INTO notes (investor_id, startup_id, collateral_id, text) VALUES (?,?,?,?)')
    .run(req.user.id, req.params.id, collateral_id || null, text.trim());
  res.json({ notes: db.prepare('SELECT * FROM notes WHERE investor_id=? AND startup_id=? ORDER BY id DESC').all(req.user.id, req.params.id) });
});
router.delete('/notes/:noteId', requireRole('investor'), (req, res) => {
  db.prepare('DELETE FROM notes WHERE id=? AND investor_id=?').run(req.params.noteId, req.user.id);
  res.json({ ok: true });
});

// ---- AI Investment Memo (structured-data synthesis engine) ----
router.get('/:id/memo', requireRole('investor', 'admin'), (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Startup not found' });
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
  if (!s) return res.status(403).json({ error: 'Not your startup' });
  const { title, type, access_level, file_url } = req.body;
  const TYPES = ['Deck', 'IM', 'Financial Model', 'Industry Overview', 'Product Demo', 'Cap Table'];
  if (!title || !TYPES.includes(type)) return res.status(400).json({ error: 'Title and a valid document type are required' });
  db.prepare('INSERT INTO collateral (startup_id, title, type, access_level, file_url) VALUES (?,?,?,?,?)')
    .run(s.id, title, type, access_level || 'Public', file_url || '');
  addActivity(s.id, 'Collateral Uploaded', `New ${type} added: ${title}`);
  res.json({ ok: true });
});
router.put('/collateral/:cid', requireRole('founder'), (req, res) => {
  const c = db.prepare('SELECT c.*, s.founder_id FROM collateral c JOIN startups s ON s.id=c.startup_id WHERE c.id=?').get(req.params.cid);
  if (!c || c.founder_id !== req.user.id) return res.status(403).json({ error: 'Not your document' });
  const { title, access_level } = req.body;
  db.prepare('UPDATE collateral SET title=COALESCE(?,title), access_level=COALESCE(?,access_level) WHERE id=?')
    .run(title || null, access_level || null, c.id);
  res.json({ ok: true });
});
router.delete('/collateral/:cid', requireRole('founder'), (req, res) => {
  const c = db.prepare('SELECT c.*, s.founder_id FROM collateral c JOIN startups s ON s.id=c.startup_id WHERE c.id=?').get(req.params.cid);
  if (!c || c.founder_id !== req.user.id) return res.status(403).json({ error: 'Not your document' });
  db.prepare('DELETE FROM collateral WHERE id=?').run(c.id);
  res.json({ ok: true });
});

router.post('/collateral/:cid/request', requireRole('investor'), (req, res) => {
  const c = db.prepare('SELECT c.*, s.founder_id, s.name sname FROM collateral c JOIN startups s ON s.id=c.startup_id WHERE c.id=?').get(req.params.cid);
  if (!c) return res.status(404).json({ error: 'Document not found' });
  db.prepare(`INSERT INTO access_requests (collateral_id, investor_id) VALUES (?,?)
    ON CONFLICT(collateral_id, investor_id) DO UPDATE SET status='pending', created_at=datetime('now')`).run(c.id, req.user.id);
  notify(c.founder_id, 'Collateral Request', `${req.user.name} requested access to "${c.title}" (${c.sname})`, `/dashboard`);
  res.json({ ok: true, status: 'pending' });
});

router.post('/access-requests/:rid/:action', requireRole('founder'), (req, res) => {
  const r = db.prepare(`SELECT ar.*, c.title, c.startup_id, s.founder_id, s.name sname FROM access_requests ar
    JOIN collateral c ON c.id=ar.collateral_id JOIN startups s ON s.id=c.startup_id WHERE ar.id=?`).get(req.params.rid);
  if (!r || r.founder_id !== req.user.id) return res.status(403).json({ error: 'Not your request to manage' });
  const map = { approve: 'approved', reject: 'rejected', revoke: 'revoked' };
  const status = map[req.params.action];
  if (!status) return res.status(400).json({ error: 'Invalid action' });
  db.prepare('UPDATE access_requests SET status=? WHERE id=?').run(status, r.id);
  if (status === 'approved') notify(r.investor_id, 'Access Approved', `Access approved for "${r.title}" (${r.sname})`, `/startup/${r.startup_id}`);
  res.json({ ok: true });
});

router.get('/:id/access-requests', requireRole('founder'), (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=? AND founder_id=?').get(req.params.id, req.user.id);
  if (!s) return res.status(403).json({ error: 'Not your startup' });
  const rows = db.prepare(`SELECT ar.*, c.title, c.type, u.name investor_name, u.id investor_id FROM access_requests ar
    JOIN collateral c ON c.id=ar.collateral_id JOIN users u ON u.id=ar.investor_id
    WHERE c.startup_id=? ORDER BY ar.id DESC`).all(s.id);
  res.json({ requests: rows });
});

router.post('/collateral/:cid/download', (req, res) => {
  db.prepare('UPDATE collateral SET downloads = downloads + 1 WHERE id=?').run(req.params.cid);
  res.json({ ok: true });
});

// Founder Updates — structured investor updates that keep watchers coming back.
router.post('/:id/updates', requireRole('founder'), (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE id=? AND founder_id=?').get(req.params.id, req.user.id);
  if (!s) return res.status(403).json({ error: 'Not your startup' });
  const { headline, body, arr, mrr, growth } = req.body;
  if (!headline || !headline.trim()) return res.status(400).json({ error: 'Headline is required' });
  if (!body || !body.trim()) return res.status(400).json({ error: 'Update body is required' });
  if (body.trim().length > 400) return res.status(400).json({ error: 'Updates are capped at 400 characters — keep it sharp.' });
  db.prepare('INSERT INTO founder_updates (startup_id, headline, body, arr, mrr, growth) VALUES (?,?,?,?,?,?)')
    .run(s.id, headline.trim().slice(0, 120), body.trim(), arr ?? null, mrr ?? null, growth ?? null);
  // Refresh headline metrics on the startup when provided
  if (arr != null || mrr != null || growth != null) {
    db.prepare('UPDATE startups SET arr=COALESCE(?,arr), mrr=COALESCE(?,mrr), growth=COALESCE(?,growth) WHERE id=?')
      .run(arr ?? null, mrr ?? null, growth ?? null, s.id);
  }
  addActivity(s.id, 'Milestone Achieved', `Investor update: ${headline.trim()}`);
  const watchers = db.prepare('SELECT user_id FROM watchlist WHERE startup_id=?').all(s.id);
  for (const w of watchers) {
    notify(w.user_id, 'New Message', `${s.name} posted an investor update: "${headline.trim()}"`, `/startup/${s.id}`);
  }
  res.json({ ok: true });
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
