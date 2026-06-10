const express = require('express');
const { db, notify, addActivity, areConnected, publicUser } = require('../db');
const { auth, requireRole } = require('../authmw');

const router = express.Router();
router.use(auth);

const J = (s, d = []) => { try { return JSON.parse(s) ?? d; } catch { return d; } };

function tile(s, userId) {
  const upvotes = db.prepare('SELECT COUNT(*) c FROM upvotes WHERE startup_id=?').get(s.id).c;
  const recentViews = db.prepare("SELECT COUNT(*) c FROM startup_views WHERE startup_id=? AND created_at > datetime('now','-7 days')").get(s.id).c;
  const recentUpvotes = db.prepare("SELECT COUNT(*) c FROM upvotes WHERE startup_id=? AND created_at > datetime('now','-7 days')").get(s.id).c;
  return {
    id: s.id, name: s.name, logo: s.logo, sector: s.sector, subsector: s.subsector,
    stage: s.stage, city: s.city, arr: s.arr, mrr: s.mrr, verified: !!s.verified,
    raising_status: s.raising_status, one_liner: s.one_liner,
    upvotes, views: s.views,
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
  let tiles = rows.map(s => tile(s, req.user.id));
  if (sort === 'upvoted') tiles.sort((a, b) => b.upvotes - a.upvotes);
  else if (sort === 'viewed') {
    const v = Object.fromEntries(rows.map(s => [s.id, s.views]));
    tiles.sort((a, b) => v[b.id] - v[a.id]);
  } else tiles.sort((a, b) => b.id - a.id); // recent
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
    return res.json({ id: existing.id });
  }
  if (!data.name) return res.status(400).json({ error: 'Startup name is required' });
  const cols = Object.keys(data);
  const info = db.prepare(`INSERT INTO startups (founder_id, ${cols.join(',')}) VALUES (?, ${cols.map(() => '?').join(',')})`)
    .run(req.user.id, ...cols.map(k => data[k]));
  addActivity(info.lastInsertRowid, 'Round Opened',
    data.raising_status === 'Actively Raising' ? `${data.name} opened a round${data.raising_amount ? ' — raising ' + data.raising_amount : ''}` : `${data.name} joined Fundamental`);
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
    if (req.user.role === 'investor') notify(s.founder_id, 'Profile Viewed', `${req.user.name} viewed your startup profile`, `/startup/${s.id}`);
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
  res.json({
    startup: {
      ...s, revenue_series: J(s.revenue_series), video_chapters: J(s.video_chapters), use_of_funds: J(s.use_of_funds),
      upvotes: db.prepare('SELECT COUNT(*) c FROM upvotes WHERE startup_id=?').get(s.id).c,
      upvoted: !!db.prepare('SELECT 1 FROM upvotes WHERE user_id=? AND startup_id=?').get(req.user.id, s.id),
      saved: !!db.prepare('SELECT 1 FROM watchlist WHERE user_id=? AND startup_id=?').get(req.user.id, s.id),
    },
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
