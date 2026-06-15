const express = require('express');
const { db, notify, areConnected, publicUser, trustScore } = require('../db');
const { auth, requireRole } = require('../authmw');
const { validateUrlFields, clampStrings } = require('../security');

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
  if (!target || target.id === req.user.id) return res.status(400).json({ error: 'We could not find that person. Please try a different profile.' });
  const existing = db.prepare(
    'SELECT * FROM connections WHERE (requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?)'
  ).get(req.user.id, target.id, target.id, req.user.id);
  if (existing && existing.status !== 'rejected') return res.status(409).json({ error: 'This connection is already ' + existing.status + '.' });
  if (existing) db.prepare('DELETE FROM connections WHERE id=?').run(existing.id);
  db.prepare('INSERT INTO connections (requester_id, recipient_id) VALUES (?,?)').run(req.user.id, target.id);
  notify(target.id, 'Connection Request', `${req.user.name} would like to connect with you. Review the request to respond.`, '/network?tab=requests');
  res.json({ ok: true, status: 'pending' });
});

router.post('/connections/:id/:action', (req, res) => {
  const c = db.prepare('SELECT * FROM connections WHERE id=? AND recipient_id=?').get(req.params.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'We could not find that connection request. It may have already been handled.' });
  const map = { accept: 'accepted', reject: 'rejected' };
  const status = map[req.params.action];
  if (!status) return res.status(400).json({ error: 'That action is not supported. Please accept or reject the request.' });
  db.prepare('UPDATE connections SET status=? WHERE id=?').run(status, c.id);
  if (status === 'accepted') {
    notify(c.requester_id, 'Connection Accepted', `${req.user.name} accepted your connection request. You can now message each other.`, `/profile/${req.user.id}`);
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
  const targetId = Number(req.params.id);
  if (!targetId || targetId === req.user.id) return res.status(400).json({ error: 'You cannot follow yourself.' }); // (P2-5)
  if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(targetId)) return res.status(404).json({ error: 'We could not find that person.' });
  const exists = db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?').get(req.user.id, targetId);
  if (exists) db.prepare('DELETE FROM follows WHERE follower_id=? AND followee_id=?').run(req.user.id, targetId);
  else db.prepare('INSERT INTO follows (follower_id, followee_id) VALUES (?,?)').run(req.user.id, targetId);
  res.json({ following: !exists });
});

// ---- Profile pages ----
router.get('/profile/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'We could not find that profile. It may have been removed.' });
  const out = { user: publicUser(u), trust: trustScore(u) };

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
    // Only the owner and admins see unlisted (draft) startups on a profile (P0-4).
    const ownerView = req.user.id === u.id || req.user.role === 'admin';
    out.startups = db.prepare(
      `SELECT id, name, logo, sector, stage, one_liner, raising_status, verified FROM startups WHERE founder_id=?${ownerView ? '' : " AND video_url != ''"}`
    ).all(u.id);
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
      // Portfolio companies are only shown if listed (unless you own the profile / admin).
      const ownerView = req.user.id === u.id || req.user.role === 'admin';
      out.portfolio_startups = out.investor.portfolio
        .map(pid => db.prepare('SELECT id, name, logo, sector, stage, one_liner, video_url FROM startups WHERE id=?').get(pid))
        .filter(s => s && (ownerView || s.video_url))
        .map(({ video_url, ...s }) => s);
    }
    // Visual intelligence: where this investor's attention actually goes (aggregates only)
    const interest = db.prepare(`SELECT s.sector label, COUNT(*) n FROM upvotes u JOIN startups s ON s.id=u.startup_id
      WHERE u.user_id=? AND s.sector != '' GROUP BY s.sector ORDER BY n DESC`).all(u.id);
    const totalInterest = interest.reduce((a, r) => a + r.n, 0) || 1;
    out.interest_allocation = interest.map(r => ({ label: r.label, pct: Math.round((r.n / totalInterest) * 100) }));
    const stageInterest = db.prepare(`SELECT s.stage label, COUNT(*) n FROM watchlist w JOIN startups s ON s.id=w.startup_id
      WHERE w.user_id=? AND s.stage != '' GROUP BY s.stage ORDER BY n DESC`).all(u.id);
    const totalStage = stageInterest.reduce((a, r) => a + r.n, 0) || 1;
    out.stage_allocation = stageInterest.map(r => ({ label: r.label, pct: Math.round((r.n / totalStage) * 100) }));
    out.activity_stats = {
      upvotes: db.prepare('SELECT COUNT(*) c FROM upvotes WHERE user_id=?').get(u.id).c,
      pipeline: db.prepare('SELECT COUNT(*) c FROM watchlist WHERE user_id=?').get(u.id).c,
      posts: db.prepare('SELECT COUNT(*) c FROM posts WHERE user_id=? AND removed=0').get(u.id).c,
    };
  }
  out.posts = db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM post_likes WHERE post_id=p.id) likes,
    (SELECT COUNT(*) FROM post_comments WHERE post_id=p.id) comments
    FROM posts p WHERE p.user_id=? AND p.removed=0 ORDER BY p.id DESC LIMIT 10`).all(u.id);
  if (u.id !== req.user.id) {
    const txt = `${req.user.name} viewed your profile.`;
    const dup = db.prepare("SELECT 1 FROM notifications WHERE user_id=? AND type='Profile Viewed' AND text=? AND created_at > datetime('now','-1 day')").get(u.id, txt);
    if (!dup) notify(u.id, 'Profile Viewed', txt, `/profile/${req.user.id}`);
  }
  res.json(out);
});

// ---- Edit own profile / investor profile ----
router.put('/me', (req, res) => {
  const allowed = ['name', 'city', 'headline', 'bio', 'linkedin', 'education', 'experience', 'photo', 'cover', 'email_alerts', 'inapp_alerts', 'onboarded'];
  // photo/cover/linkedin render as src/href — block javascript: et al. (stored XSS)
  const urlErr = validateUrlFields(req.body, ['photo', 'cover', 'linkedin']);
  if (urlErr) return res.status(400).json({ error: urlErr });
  clampStrings(req.body, ['name', 'city', 'headline'], 200);
  clampStrings(req.body, ['bio', 'education', 'experience'], 5000);
  const sets = [], vals = [];
  for (const k of allowed) if (req.body[k] !== undefined) { sets.push(`${k}=?`); vals.push(req.body[k]); }
  if (sets.length) db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).run(...vals, req.user.id);
  if (req.user.role === 'investor' && req.body.investor) {
    const ip = req.body.investor;
    clampStrings(ip, ['fund_name', 'fund_size', 'check_size'], 200);
    clampStrings(ip, ['thesis'], 5000);
    for (const k of ['stage_focus', 'sector_focus', 'portfolio']) {
      if (ip[k] !== undefined && !Array.isArray(ip[k])) return res.status(400).json({ error: `"${k}" must be a list.` });
    }
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

// Warm Intro Graph — mutual accepted connections who can introduce you to the target.
router.get('/intro-path/:id', (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id) return res.json({ connectors: [], direct: false });
  if (areConnected(req.user.id, targetId)) return res.json({ connectors: [], direct: true });
  const connsOf = (uid) => db.prepare(
    `SELECT CASE WHEN requester_id=? THEN recipient_id ELSE requester_id END pid
     FROM connections WHERE (requester_id=? OR recipient_id=?) AND status='accepted'`
  ).all(uid, uid, uid).map(r => r.pid);
  const mine = new Set(connsOf(req.user.id));
  const theirs = connsOf(targetId);
  const connectors = theirs.filter(id => mine.has(id)).slice(0, 3)
    .map(id => db.prepare('SELECT id, name, role, photo, headline, verified FROM users WHERE id=?').get(id))
    .filter(Boolean);
  res.json({ connectors, direct: false });
});

router.post('/report', (req, res) => {
  const { target_type, target_id, reason } = req.body;
  if (!target_type || !target_id || !reason) return res.status(400).json({ error: 'Please add a reason so our team can review this report.' });
  if (!['user', 'startup', 'post'].includes(target_type)) return res.status(400).json({ error: 'That report target is not supported.' });
  // Validate the target exists (P2-9).
  const tables = { user: 'users', startup: 'startups', post: 'posts' };
  const tid = Number(target_id) || 0;
  if (!db.prepare(`SELECT 1 FROM ${tables[target_type]} WHERE id=?`).get(tid)) {
    return res.status(404).json({ error: 'We could not find the content you are reporting.' });
  }
  // De-duplicate: one open report per reporter per target.
  const dup = db.prepare("SELECT 1 FROM reports WHERE reporter_id=? AND target_type=? AND target_id=? AND status='open'").get(req.user.id, target_type, tid);
  if (dup) return res.json({ ok: true, already: true });
  db.prepare('INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?,?,?,?)')
    .run(req.user.id, target_type, tid, String(reason).slice(0, 2000));
  res.json({ ok: true });
});

module.exports = router;
