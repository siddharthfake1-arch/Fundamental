const express = require('express');
const { db, publicUser, profileCompletion } = require('../db');
const { auth, requireRole } = require('../authmw');

const router = express.Router();
router.use(auth);
const J = (s, d = []) => { try { return JSON.parse(s) ?? d; } catch { return d; } };

// ---- Notifications ----
router.get('/notifications', (req, res) => {
  const { type } = req.query;
  let rows = db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id);
  if (type) rows = rows.filter(n => n.type === type);
  res.json({
    notifications: rows,
    unread: db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0').get(req.user.id).c,
  });
});
router.post('/notifications/read', (req, res) => {
  if (req.body.id) db.prepare('UPDATE notifications SET read=1 WHERE id=? AND user_id=?').run(req.body.id, req.user.id);
  else db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.user.id);
  res.json({ ok: true });
});
router.get('/badge-counts', (req, res) => {
  res.json({
    notifications: db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0').get(req.user.id).c,
    messages: db.prepare(`SELECT COUNT(*) c FROM messages m JOIN conversations c2 ON c2.id=m.conversation_id
      WHERE (c2.a_id=? OR c2.b_id=?) AND m.sender_id != ? AND m.read=0`).get(req.user.id, req.user.id, req.user.id).c,
  });
});

// ---- Founder dashboard ----
router.get('/dashboard/founder', requireRole('founder'), (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE founder_id=?').get(req.user.id);
  const out = { completion: profileCompletion(req.user, s), startup: s ? { id: s.id, name: s.name, logo: s.logo, raising_status: s.raising_status, raising_amount: s.raising_amount } : null };
  if (s) {
    out.views = s.views;
    out.video_views = s.video_views;
    out.upvotes = db.prepare('SELECT COUNT(*) c FROM upvotes WHERE startup_id=?').get(s.id).c;
    out.collateral_requests = db.prepare(`SELECT COUNT(*) c FROM access_requests ar JOIN collateral c2 ON c2.id=ar.collateral_id WHERE c2.startup_id=?`).get(s.id).c;
    out.pending_access = db.prepare(`SELECT ar.*, c2.title, c2.type, u.name investor_name, u.id investor_id FROM access_requests ar
      JOIN collateral c2 ON c2.id=ar.collateral_id JOIN users u ON u.id=ar.investor_id
      WHERE c2.startup_id=? AND ar.status='pending' ORDER BY ar.id DESC`).all(s.id);
    out.views_trend = db.prepare(`SELECT date(created_at) d, COUNT(*) c FROM startup_views WHERE startup_id=? GROUP BY d ORDER BY d DESC LIMIT 14`).all(s.id).reverse();
    out.raise = { status: s.raising_status, amount: s.raising_amount, use_of_funds: J(s.use_of_funds) };
  }
  out.connection_requests = db.prepare(`SELECT c.id, u.id user_id, u.name, u.role, u.photo, u.headline FROM connections c
    JOIN users u ON u.id=c.requester_id WHERE c.recipient_id=? AND c.status='pending'`).all(req.user.id);
  res.json(out);
});

// ---- Founder analytics: who's looking, and at what ----
router.get('/dashboard/founder/analytics', requireRole('founder'), (req, res) => {
  const s = db.prepare('SELECT * FROM startups WHERE founder_id=?').get(req.user.id);
  if (!s) return res.json({ viewers: [], docs: [] });
  const viewers = db.prepare(`
    SELECT u.id, u.name, u.role, u.photo, u.headline, u.verified,
           COUNT(*) views, MAX(sv.created_at) last_view
    FROM startup_views sv JOIN users u ON u.id = sv.user_id
    WHERE sv.startup_id=? AND u.id != ? AND u.role='investor'
    GROUP BY u.id ORDER BY last_view DESC LIMIT 12`).all(s.id, req.user.id)
    .map(v => ({
      ...v,
      fund: (db.prepare('SELECT fund_name FROM investor_profiles WHERE user_id=?').get(v.id) || {}).fund_name || '',
      connected: db.prepare(`SELECT 1 FROM connections WHERE status='accepted' AND
        ((requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?))`).get(v.id, req.user.id, req.user.id, v.id) ? 1 : 0,
    }));
  const docs = db.prepare(`
    SELECT c.id, c.title, c.type, c.access_level, c.downloads,
      (SELECT COUNT(*) FROM access_requests ar WHERE ar.collateral_id=c.id) requests,
      (SELECT COUNT(*) FROM access_requests ar WHERE ar.collateral_id=c.id AND ar.status='approved') approved
    FROM collateral c WHERE c.startup_id=? ORDER BY c.downloads DESC`).all(s.id);
  res.json({ viewers, docs, video_views: s.video_views, total_views: s.views });
});

// ---- Investor dashboard ----
router.get('/dashboard/investor', requireRole('investor'), (req, res) => {
  const watchlist = db.prepare(`SELECT w.status w_status, w.created_at saved_at, s.* FROM watchlist w
    JOIN startups s ON s.id=w.startup_id WHERE w.user_id=? ORDER BY w.created_at DESC`).all(req.user.id);
  const requested = db.prepare(`SELECT ar.status, ar.created_at, c2.title, c2.type, s.id startup_id, s.name startup_name, s.logo
    FROM access_requests ar JOIN collateral c2 ON c2.id=ar.collateral_id JOIN startups s ON s.id=c2.startup_id
    WHERE ar.investor_id=? ORDER BY ar.id DESC`).all(req.user.id);
  const convos = db.prepare(`SELECT COUNT(*) c FROM conversations WHERE a_id=? OR b_id=?`).get(req.user.id, req.user.id).c;
  // Suggested: match investor sector/stage focus, exclude already-saved, must have video.
  const ip = db.prepare('SELECT * FROM investor_profiles WHERE user_id=?').get(req.user.id) || {};
  const sectors = J(ip.sector_focus), stages = J(ip.stage_focus);
  const savedIds = watchlist.map(w => w.id);
  let suggested = db.prepare("SELECT * FROM startups WHERE video_url != ''").all()
    .filter(s => !savedIds.includes(s.id))
    .map(s => ({ s, score: (sectors.includes(s.sector) ? 2 : 0) + (stages.includes(s.stage) ? 1 : 0) + (s.verified ? 0.5 : 0) }))
    .sort((a, b) => b.score - a.score).slice(0, 6)
    .map(({ s }) => ({ id: s.id, name: s.name, logo: s.logo, sector: s.sector, stage: s.stage, one_liner: s.one_liner, verified: !!s.verified }));
  res.json({
    watchlist: watchlist.map(s => ({ id: s.id, name: s.name, logo: s.logo, sector: s.sector, stage: s.stage, status: s.w_status, raising_status: s.raising_status, saved_at: s.saved_at })),
    requested, active_conversations: convos, suggested,
  });
});

// ---- Watchlist page (investor) ----
router.get('/watchlist', requireRole('investor'), (req, res) => {
  const rows = db.prepare(`SELECT w.status w_status, w.created_at saved_at, s.* FROM watchlist w
    JOIN startups s ON s.id=w.startup_id WHERE w.user_id=? ORDER BY w.created_at DESC`).all(req.user.id);
  res.json({
    watchlist: rows.map(s => ({
      id: s.id, name: s.name, logo: s.logo, sector: s.sector, stage: s.stage, city: s.city,
      raising_status: s.raising_status, one_liner: s.one_liner, status: s.w_status, saved_at: s.saved_at, verified: !!s.verified,
      notes: db.prepare('SELECT * FROM notes WHERE investor_id=? AND startup_id=? ORDER BY id DESC').all(req.user.id, s.id),
      recent_activity: db.prepare('SELECT * FROM activities WHERE startup_id=? ORDER BY id DESC LIMIT 3').all(s.id),
    })),
  });
});

// ---- Admin panel ----
router.use('/admin', requireRole('admin'));
router.get('/admin/overview', (req, res) => {
  const c = (sql) => db.prepare(sql).get().c;
  res.json({
    users: c('SELECT COUNT(*) c FROM users'),
    founders: c("SELECT COUNT(*) c FROM users WHERE role='founder'"),
    investors: c("SELECT COUNT(*) c FROM users WHERE role='investor'"),
    startups: c('SELECT COUNT(*) c FROM startups'),
    posts: c('SELECT COUNT(*) c FROM posts WHERE removed=0'),
    messages: c('SELECT COUNT(*) c FROM messages'),
    connections: c("SELECT COUNT(*) c FROM connections WHERE status='accepted'"),
    upvotes: c('SELECT COUNT(*) c FROM upvotes'),
    open_reports: c("SELECT COUNT(*) c FROM reports WHERE status='open'"),
    signups_trend: db.prepare("SELECT date(created_at) d, COUNT(*) c FROM users GROUP BY d ORDER BY d DESC LIMIT 14").all().reverse(),
  });
});
router.get('/admin/users', (req, res) => {
  res.json({ users: db.prepare("SELECT id, name, email, role, city, verified, flagged, created_at FROM users WHERE role!='admin' ORDER BY id DESC").all() });
});
router.get('/admin/startups', (req, res) => {
  res.json({ startups: db.prepare('SELECT id, name, sector, stage, verified, video_url, views FROM startups ORDER BY id DESC').all() });
});
router.post('/admin/verify-user/:id', (req, res) => {
  db.prepare('UPDATE users SET verified = 1 - verified WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
router.post('/admin/flag-user/:id', (req, res) => {
  db.prepare('UPDATE users SET flagged = 1 - flagged WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
router.post('/admin/verify-startup/:id', (req, res) => {
  db.prepare('UPDATE startups SET verified = 1 - verified WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
router.get('/admin/reports', (req, res) => {
  const rows = db.prepare(`SELECT r.*, u.name reporter_name FROM reports r JOIN users u ON u.id=r.reporter_id ORDER BY r.id DESC`).all();
  res.json({ reports: rows });
});
router.post('/admin/reports/:id/:action', (req, res) => {
  const map = { resolve: 'resolved', dismiss: 'dismissed' };
  if (!map[req.params.action]) return res.status(400).json({ error: 'Invalid action' });
  db.prepare('UPDATE reports SET status=? WHERE id=?').run(map[req.params.action], req.params.id);
  res.json({ ok: true });
});
router.get('/admin/posts', (req, res) => {
  res.json({ posts: db.prepare(`SELECT p.*, u.name author FROM posts p JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 100`).all() });
});
router.post('/admin/posts/:id/remove', (req, res) => {
  db.prepare('UPDATE posts SET removed = 1 - removed WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
