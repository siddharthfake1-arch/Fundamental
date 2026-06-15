const express = require('express');
const { db, publicUser, profileCompletion, notify, audit } = require('../db');
const { auth, requireRole } = require('../authmw');
const { J, qstr, qint } = require('../util');

const router = express.Router();
router.use(auth);

// ---- Notifications ----
router.get('/notifications', (req, res) => {
  const type = qstr(req.query.type);
  const limit = qint(req.query.limit, 50, 100), offset = qint(req.query.offset, 0);
  const rows = type
    ? db.prepare('SELECT * FROM notifications WHERE user_id=? AND type=? ORDER BY id DESC LIMIT ? OFFSET ?').all(req.user.id, type, limit, offset)
    : db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT ? OFFSET ?').all(req.user.id, limit, offset);
  res.json({
    notifications: rows,
    unread: db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0').get(req.user.id).c,
    limit, offset,
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
    out.followers = db.prepare('SELECT COUNT(*) c FROM startup_follows WHERE startup_id=?').get(s.id).c;
    out.interest_count = db.prepare('SELECT COUNT(*) c FROM interests WHERE startup_id=?').get(s.id).c;
    out.stage = s.stage;
    // Investors who've expressed interest — the warmest inbound signal a founder gets.
    out.interested_investors = db.prepare(`SELECT u.id, u.name, u.photo, u.headline, u.verified, i.created_at,
        (SELECT fund_name FROM investor_profiles WHERE user_id=u.id) fund
      FROM interests i JOIN users u ON u.id=i.investor_id WHERE i.startup_id=? ORDER BY i.created_at DESC LIMIT 10`).all(s.id);
  }
  out.connection_requests = db.prepare(`SELECT c.id, u.id user_id, u.name, u.role, u.photo, u.headline FROM connections c
    JOIN users u ON u.id=c.requester_id WHERE c.recipient_id=? AND c.status='pending'`).all(req.user.id);
  res.json(out);
});

// ---- Market Pulse: aggregate ecosystem intelligence. Never exposes startup-level
// confidential data — only platform-level aggregates. ----
router.get('/pulse', (req, res) => {
  const sectors = db.prepare(`SELECT sector, COUNT(*) startups,
      SUM(CASE WHEN raising_status='Actively Raising' THEN 1 ELSE 0 END) raising,
      ROUND(AVG(growth),1) avg_growth
    FROM startups WHERE video_url != '' AND sector != '' GROUP BY sector`).all()
    .map(row => ({
      ...row,
      upvotes_30d: db.prepare(`SELECT COUNT(*) c FROM upvotes u JOIN startups s ON s.id=u.startup_id
        WHERE s.sector=? AND u.created_at > datetime('now','-30 days')`).get(row.sector).c,
      views_7d: db.prepare(`SELECT COUNT(*) c FROM startup_views v JOIN startups s ON s.id=v.startup_id
        WHERE s.sector=? AND v.created_at > datetime('now','-7 days')`).get(row.sector).c,
      pipeline_adds_30d: db.prepare(`SELECT COUNT(*) c FROM watchlist w JOIN startups s ON s.id=w.startup_id
        WHERE s.sector=? AND w.created_at > datetime('now','-30 days')`).get(row.sector).c,
    }))
    .map(row => ({ ...row, heat: row.upvotes_30d * 3 + row.views_7d + row.pipeline_adds_30d * 4 + row.raising * 5 }))
    .sort((a, b) => b.heat - a.heat);
  const stages = db.prepare(`SELECT stage, COUNT(*) c FROM startups WHERE video_url != '' AND stage != '' GROUP BY stage ORDER BY c DESC`).all();
  const cities = db.prepare(`SELECT city, COUNT(*) c FROM startups WHERE video_url != '' AND city != '' GROUP BY city ORDER BY c DESC LIMIT 8`).all();
  res.json({
    totals: {
      startups: db.prepare("SELECT COUNT(*) c FROM startups WHERE video_url != ''").get().c,
      open_rounds: db.prepare("SELECT COUNT(*) c FROM startups WHERE video_url != '' AND raising_status='Actively Raising'").get().c,
      investors: db.prepare("SELECT COUNT(*) c FROM users WHERE role='investor' AND onboarded=1").get().c,
      connections_30d: db.prepare("SELECT COUNT(*) c FROM connections WHERE status='accepted' AND created_at > datetime('now','-30 days')").get().c,
      updates_30d: db.prepare("SELECT COUNT(*) c FROM founder_updates WHERE created_at > datetime('now','-30 days')").get().c,
    },
    sectors, stages, cities,
    emerging: [...sectors].filter(s => s.avg_growth > 0).sort((a, b) => b.avg_growth - a.avg_growth).slice(0, 4),
  });
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
    shared_count: db.prepare('SELECT COUNT(*) c FROM deal_shares WHERE to_id=?').get(req.user.id).c,
    interests_count: db.prepare('SELECT COUNT(*) c FROM interests WHERE investor_id=?').get(req.user.id).c,
  });
});

// ---- Watchlist page (investor) ----
router.get('/watchlist', requireRole('investor'), (req, res) => {
  const rows = db.prepare(`SELECT w.status w_status, w.created_at saved_at, w.tags w_tags, s.* FROM watchlist w
    JOIN startups s ON s.id=w.startup_id WHERE w.user_id=? ORDER BY w.created_at DESC`).all(req.user.id);
  res.json({
    watchlist: rows.map(s => ({
      id: s.id, name: s.name, logo: s.logo, sector: s.sector, stage: s.stage, city: s.city,
      raising_status: s.raising_status, one_liner: s.one_liner, status: s.w_status, saved_at: s.saved_at, verified: !!s.verified,
      tags: J(s.w_tags),
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
  res.json({ users: db.prepare("SELECT id, name, email, role, city, verified, flagged, status, investor_approved, created_at FROM users WHERE role!='admin' ORDER BY id DESC").all() });
});
router.get('/admin/startups', (req, res) => {
  res.json({ startups: db.prepare('SELECT id, name, sector, stage, verified, video_url, views, hidden FROM startups ORDER BY id DESC').all() });
});
// Verification tiers: 0 none → 1 Verified → 2 Enhanced → 3 Institution
router.post('/admin/verify-user/:id', (req, res) => {
  if (req.body && req.body.tier !== undefined) {
    const tier = Number(req.body.tier);
    if (!Number.isInteger(tier)) return res.status(400).json({ error: 'Verification tier must be a whole number from 0 to 3.' });
    db.prepare('UPDATE users SET verified=? WHERE id=?').run(Math.max(0, Math.min(3, tier)), req.params.id);
  } else {
    db.prepare('UPDATE users SET verified = (verified + 1) % 4 WHERE id=?').run(req.params.id);
  }
  const v = (db.prepare('SELECT verified FROM users WHERE id=?').get(req.params.id) || {}).verified;
  audit(req.user.id, 'verify-user', { targetType: 'user', targetId: Number(req.params.id), detail: `tier=${v}`, ip: req.ip });
  res.json({ ok: true });
});
router.post('/admin/flag-user/:id', (req, res) => {
  db.prepare('UPDATE users SET flagged = 1 - flagged WHERE id=?').run(req.params.id);
  const f = (db.prepare('SELECT flagged FROM users WHERE id=?').get(req.params.id) || {}).flagged;
  audit(req.user.id, f ? 'flag-user' : 'unflag-user', { targetType: 'user', targetId: Number(req.params.id), ip: req.ip });
  res.json({ ok: true });
});
// Suspend / reinstate an account. Suspension is enforced in auth middleware and
// invalidates the user's active sessions immediately (P1-5).
router.post('/admin/suspend-user/:id', (req, res) => {
  const u = db.prepare("SELECT id, status FROM users WHERE id=? AND role!='admin'").get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  const suspend = u.status !== 'suspended';
  // Use datetime('now') so timestamps are stored in the same UTC format as every
  // other table (consistent parsing across the codebase).
  db.prepare(`UPDATE users SET status=?, suspended_at=${suspend ? "datetime('now')" : 'NULL'}, suspended_reason=? WHERE id=?`)
    .run(suspend ? 'suspended' : 'active', suspend ? String(req.body?.reason || '').slice(0, 500) : '', u.id);
  audit(req.user.id, suspend ? 'suspend-user' : 'reinstate-user', { targetType: 'user', targetId: u.id, detail: String(req.body?.reason || ''), ip: req.ip });
  res.json({ ok: true, status: suspend ? 'suspended' : 'active' });
});
// Approve / revoke an investor's access to deal flow (P0-5).
router.post('/admin/approve-investor/:id', (req, res) => {
  const u = db.prepare("SELECT id, role, investor_approved FROM users WHERE id=?").get(req.params.id);
  if (!u || u.role !== 'investor') return res.status(404).json({ error: 'Investor not found.' });
  const approve = !u.investor_approved;
  db.prepare('UPDATE users SET investor_approved=? WHERE id=?').run(approve ? 1 : 0, u.id);
  audit(req.user.id, approve ? 'approve-investor' : 'revoke-investor', { targetType: 'user', targetId: u.id, ip: req.ip });
  if (approve) notify(u.id, 'Access Approved', 'Your investor account has been approved. You now have full access to deal flow on Fundamental.', '/discover');
  res.json({ ok: true, investor_approved: approve });
});
router.post('/admin/verify-startup/:id', (req, res) => {
  if (req.body && req.body.tier !== undefined) {
    const tier = Number(req.body.tier);
    if (!Number.isInteger(tier)) return res.status(400).json({ error: 'Verification tier must be a whole number from 0 to 3.' });
    db.prepare('UPDATE startups SET verified=? WHERE id=?').run(Math.max(0, Math.min(3, tier)), req.params.id);
  } else {
    db.prepare('UPDATE startups SET verified = (verified + 1) % 4 WHERE id=?').run(req.params.id);
  }
  const v = (db.prepare('SELECT verified FROM startups WHERE id=?').get(req.params.id) || {}).verified;
  audit(req.user.id, 'verify-startup', { targetType: 'startup', targetId: Number(req.params.id), detail: `tier=${v}`, ip: req.ip });
  res.json({ ok: true });
});
// Hide / unhide a startup from the marketplace (P1-5).
router.post('/admin/hide-startup/:id', (req, res) => {
  const s = db.prepare('SELECT id, hidden FROM startups WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Startup not found.' });
  const hide = !s.hidden;
  db.prepare('UPDATE startups SET hidden=? WHERE id=?').run(hide ? 1 : 0, s.id);
  audit(req.user.id, hide ? 'hide-startup' : 'unhide-startup', { targetType: 'startup', targetId: s.id, ip: req.ip });
  res.json({ ok: true, hidden: hide });
});
router.get('/admin/reports', (req, res) => {
  const rows = db.prepare(`SELECT r.*, u.name reporter_name FROM reports r JOIN users u ON u.id=r.reporter_id ORDER BY r.id DESC`).all();
  res.json({ reports: rows });
});
router.post('/admin/reports/:id/:action', (req, res) => {
  const map = { resolve: 'resolved', dismiss: 'dismissed' };
  if (!map[req.params.action]) return res.status(400).json({ error: 'That action is not supported. Please resolve or dismiss the report.' });
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
