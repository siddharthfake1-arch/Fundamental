const express = require('express');
const { db, notify, areConnected, publicUser } = require('../db');
const { auth, requireRole } = require('../authmw');

const router = express.Router();
router.use(auth);
const J = (s, d = []) => { try { return JSON.parse(s) ?? d; } catch { return d; } };

// ---- Network directory ----
router.get('/network', (req, res) => {
  const { role, sector, stage, geography, active, q } = req.query;
  let users = db.prepare("SELECT * FROM users WHERE id != ? AND role != 'admin' AND onboarded=1").all(req.user.id);
  if (q) users = users.filter(u => (u.name + ' ' + u.headline).toLowerCase().includes(q.toLowerCase()));
  if (role) users = users.filter(u => u.role === role);
  if (geography) users = users.filter(u => u.city.toLowerCase().includes(geography.toLowerCase()));
  if (active === 'true') {
    users = users.filter(u => new Date(u.last_active + 'Z') > new Date(Date.now() - 7 * 864e5));
  }
  const cards = users.map(u => {
    let company = '', focus = [];
    if (u.role === 'founder') {
      const s = db.prepare('SELECT name, sector, stage FROM startups WHERE founder_id=?').get(u.id);
      if (s) { company = s.name; focus = [s.sector, s.stage]; }
    } else {
      const ip = db.prepare('SELECT * FROM investor_profiles WHERE user_id=?').get(u.id);
      if (ip) { company = ip.fund_name; focus = [...J(ip.sector_focus), ...J(ip.stage_focus)]; }
    }
    const conn = db.prepare(
      'SELECT * FROM connections WHERE (requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?)'
    ).get(req.user.id, u.id, u.id, req.user.id);
    return {
      ...publicUser(u), company, focus,
      connection: conn ? conn.status : null,
      connection_direction: conn ? (conn.requester_id === req.user.id ? 'outgoing' : 'incoming') : null,
      connection_id: conn ? conn.id : null,
      following: !!db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?').get(req.user.id, u.id),
    };
  }).filter(c => {
    if (sector && !c.focus.some(f => f === sector)) return false;
    if (stage && !c.focus.some(f => f === stage)) return false;
    return true;
  });
  res.json({ users: cards });
});

// ---- Connections ----
router.post('/connect/:id', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!target || target.id === req.user.id) return res.status(400).json({ error: 'Invalid user' });
  const existing = db.prepare(
    'SELECT * FROM connections WHERE (requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?)'
  ).get(req.user.id, target.id, target.id, req.user.id);
  if (existing && existing.status !== 'rejected') return res.status(409).json({ error: 'Connection already ' + existing.status });
  if (existing) db.prepare('DELETE FROM connections WHERE id=?').run(existing.id);
  db.prepare('INSERT INTO connections (requester_id, recipient_id) VALUES (?,?)').run(req.user.id, target.id);
  notify(target.id, 'Connection Request', `${req.user.name} wants to connect`, '/network?tab=requests');
  res.json({ ok: true, status: 'pending' });
});

router.post('/connections/:id/:action', (req, res) => {
  const c = db.prepare('SELECT * FROM connections WHERE id=? AND recipient_id=?').get(req.params.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'Request not found' });
  const map = { accept: 'accepted', reject: 'rejected' };
  const status = map[req.params.action];
  if (!status) return res.status(400).json({ error: 'Invalid action' });
  db.prepare('UPDATE connections SET status=? WHERE id=?').run(status, c.id);
  if (status === 'accepted') {
    notify(c.requester_id, 'Connection Accepted', `${req.user.name} accepted your connection request`, `/profile/${req.user.id}`);
  }
  res.json({ ok: true });
});

router.get('/connections', (req, res) => {
  const pending = db.prepare(`SELECT c.id, c.created_at, u.id user_id, u.name, u.role, u.photo, u.headline, u.verified
    FROM connections c JOIN users u ON u.id=c.requester_id WHERE c.recipient_id=? AND c.status='pending' ORDER BY c.id DESC`).all(req.user.id);
  const accepted = db.prepare(`SELECT c.id, u.id user_id, u.name, u.role, u.photo, u.headline, u.verified
    FROM connections c JOIN users u ON u.id = CASE WHEN c.requester_id=? THEN c.recipient_id ELSE c.requester_id END
    WHERE (c.requester_id=? OR c.recipient_id=?) AND c.status='accepted' ORDER BY c.id DESC`).all(req.user.id, req.user.id, req.user.id);
  res.json({ pending, accepted });
});

router.post('/follow/:id', (req, res) => {
  const exists = db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?').get(req.user.id, req.params.id);
  if (exists) db.prepare('DELETE FROM follows WHERE follower_id=? AND followee_id=?').run(req.user.id, req.params.id);
  else db.prepare('INSERT INTO follows (follower_id, followee_id) VALUES (?,?)').run(req.user.id, req.params.id);
  res.json({ following: !exists });
});

// ---- Profile pages ----
router.get('/profile/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const out = { user: publicUser(u) };

  const myConns = db.prepare(
    `SELECT CASE WHEN requester_id=? THEN recipient_id ELSE requester_id END pid FROM connections WHERE (requester_id=? OR recipient_id=?) AND status='accepted'`
  ).all(req.user.id, req.user.id, req.user.id).map(r => r.pid);
  const theirConns = db.prepare(
    `SELECT CASE WHEN requester_id=? THEN recipient_id ELSE requester_id END pid FROM connections WHERE (requester_id=? OR recipient_id=?) AND status='accepted'`
  ).all(u.id, u.id, u.id).map(r => r.pid);
  out.total_connections = theirConns.length;
  out.mutual_connections = theirConns.filter(id => myConns.includes(id)).length;
  out.connected = areConnected(req.user.id, u.id);
  const conn = db.prepare(
    'SELECT * FROM connections WHERE (requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?)'
  ).get(req.user.id, u.id, u.id, req.user.id);
  out.connection_status = conn ? conn.status : null;
  out.connection_direction = conn ? (conn.requester_id === req.user.id ? 'outgoing' : 'incoming') : null;
  out.connection_id = conn ? conn.id : null;
  out.following = !!db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?').get(req.user.id, u.id);

  if (u.role === 'founder') {
    out.startups = db.prepare('SELECT id, name, logo, sector, stage, one_liner, raising_status, verified FROM startups WHERE founder_id=?').all(u.id);
    const sids = out.startups.map(s => s.id);
    out.activity = sids.length
      ? db.prepare(`SELECT a.*, s.name startup_name FROM activities a JOIN startups s ON s.id=a.startup_id
          WHERE a.startup_id IN (${sids.map(() => '?').join(',')}) ORDER BY a.id DESC LIMIT 20`).all(...sids)
      : [];
  }
  if (u.role === 'investor') {
    const ip = db.prepare('SELECT * FROM investor_profiles WHERE user_id=?').get(u.id);
    out.investor = ip ? { ...ip, stage_focus: J(ip.stage_focus), sector_focus: J(ip.sector_focus), portfolio: J(ip.portfolio) } : null;
    if (out.investor) {
      out.portfolio_startups = out.investor.portfolio
        .map(pid => db.prepare('SELECT id, name, logo, sector, stage, one_liner FROM startups WHERE id=?').get(pid))
        .filter(Boolean);
    }
  }
  out.posts = db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM post_likes WHERE post_id=p.id) likes,
    (SELECT COUNT(*) FROM post_comments WHERE post_id=p.id) comments
    FROM posts p WHERE p.user_id=? AND p.removed=0 ORDER BY p.id DESC LIMIT 10`).all(u.id);
  if (u.id !== req.user.id) notify(u.id, 'Profile Viewed', `${req.user.name} viewed your profile`, `/profile/${req.user.id}`);
  res.json(out);
});

// ---- Edit own profile / investor profile ----
router.put('/me', (req, res) => {
  const allowed = ['name', 'city', 'headline', 'bio', 'linkedin', 'education', 'experience', 'photo', 'email_alerts', 'inapp_alerts', 'onboarded'];
  const sets = [], vals = [];
  for (const k of allowed) if (req.body[k] !== undefined) { sets.push(`${k}=?`); vals.push(req.body[k]); }
  if (sets.length) db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).run(...vals, req.user.id);
  if (req.user.role === 'investor' && req.body.investor) {
    const ip = req.body.investor;
    db.prepare(`UPDATE investor_profiles SET fund_name=COALESCE(?,fund_name), fund_size=COALESCE(?,fund_size),
      check_size=COALESCE(?,check_size), stage_focus=COALESCE(?,stage_focus), sector_focus=COALESCE(?,sector_focus),
      thesis=COALESCE(?,thesis), portfolio=COALESCE(?,portfolio) WHERE user_id=?`)
      .run(ip.fund_name ?? null, ip.fund_size ?? null, ip.check_size ?? null,
        ip.stage_focus ? JSON.stringify(ip.stage_focus) : null,
        ip.sector_focus ? JSON.stringify(ip.sector_focus) : null,
        ip.thesis ?? null, ip.portfolio ? JSON.stringify(ip.portfolio) : null, req.user.id);
  }
  res.json({ ok: true });
});

router.post('/report', (req, res) => {
  const { target_type, target_id, reason } = req.body;
  if (!target_type || !target_id || !reason) return res.status(400).json({ error: 'Reason required' });
  db.prepare('INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?,?,?,?)')
    .run(req.user.id, target_type, target_id, reason);
  res.json({ ok: true });
});

module.exports = router;
