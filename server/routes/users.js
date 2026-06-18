const express = require('express');
const fs = require('fs');
const path = require('path');
const { db, notify, audit, areConnected, publicUser, trustScore, isVisibleUser, ACTIVE_USER_SQL } = require('../db');
const { auth, requireRole } = require('../authmw');
const { validateUrlFields, clampStrings, sanitizeLinks } = require('../security');
const { deletePrivate } = require('../storage');
const { J, qstr } = require('../util');

const router = express.Router();
router.use(auth);

// ---- Network directory ----
router.get('/network', (req, res) => {
  // All query params coerced to strings so array/object inputs cannot 500 the route.
  const role = qstr(req.query.role), sector = qstr(req.query.sector), stage = qstr(req.query.stage);
  const geography = qstr(req.query.geography).toLowerCase(), active = qstr(req.query.active), q = qstr(req.query.q).toLowerCase();
  // Only active, non-flagged, onboarded members appear in discovery (ACTIVE_USER_SQL
  // already excludes admins). Suspended/flagged accounts are hidden platform-wide.
  let users = db.prepare(`SELECT * FROM users WHERE id != ? AND onboarded=1 AND ${ACTIVE_USER_SQL}`).all(req.user.id);
  if (q) users = users.filter(u => (u.name + ' ' + u.headline).toLowerCase().includes(q));
  if (role) users = users.filter(u => u.role === role);
  if (geography) users = users.filter(u => (u.city || '').toLowerCase().includes(geography));
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
  if (!target || target.id === req.user.id || !isVisibleUser(target, req.user)) return res.status(400).json({ error: 'We could not find that person. Please try a different profile.' });
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
  const followTarget = db.prepare('SELECT * FROM users WHERE id=?').get(targetId);
  if (!isVisibleUser(followTarget, req.user)) return res.status(404).json({ error: 'We could not find that person.' });
  const exists = db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?').get(req.user.id, targetId);
  if (exists) db.prepare('DELETE FROM follows WHERE follower_id=? AND followee_id=?').run(req.user.id, targetId);
  else db.prepare('INSERT INTO follows (follower_id, followee_id) VALUES (?,?)').run(req.user.id, targetId);
  res.json({ following: !exists });
});

// ---- Profile pages ----
router.get('/profile/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  // Hide suspended/flagged/admin profiles from normal members (owner + admins exempt).
  if (!u || !isVisibleUser(u, req.user)) return res.status(404).json({ error: 'We could not find that profile. It may have been removed.' });
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
    // F-008: an investor's sourcing strategy (sector/stage attention, pipeline size)
    // is sensitive intelligence. It is SELF-ONLY (owner or admin) — never exposed on
    // another member's view of the profile.
    const selfView = req.user.id === u.id || req.user.role === 'admin';
    if (selfView) {
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

// ---- Data export (GDPR/CCPA/DPDP portability) ----
// Returns the user's own data as JSON. Excludes other users' private content.
router.get('/me/export', (req, res) => {
  const uid = req.user.id;
  const data = {
    exported_at: new Date().toISOString(),
    account: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(uid)),
    email: req.user.email,
    phone: req.user.phone,
    investor_profile: db.prepare('SELECT * FROM investor_profiles WHERE user_id=?').get(uid) || null,
    startups: db.prepare('SELECT * FROM startups WHERE founder_id=?').all(uid),
    posts: db.prepare('SELECT * FROM posts WHERE user_id=?').all(uid),
    comments: db.prepare('SELECT * FROM post_comments WHERE user_id=?').all(uid),
    messages_sent: db.prepare('SELECT id, conversation_id, text, attachment_name, created_at FROM messages WHERE sender_id=?').all(uid),
    // F-016: received messages (conversations the user is part of), full data map.
    messages_received: db.prepare(`SELECT m.id, m.conversation_id, m.text, m.created_at FROM messages m
      JOIN conversations c ON c.id=m.conversation_id WHERE (c.a_id=? OR c.b_id=?) AND m.sender_id!=?`).all(uid, uid, uid),
    connections: db.prepare('SELECT * FROM connections WHERE requester_id=? OR recipient_id=?').all(uid, uid),
    follows: db.prepare('SELECT followee_id FROM follows WHERE follower_id=?').all(uid),
    startup_follows: db.prepare('SELECT startup_id, created_at FROM startup_follows WHERE user_id=?').all(uid),
    interests: db.prepare('SELECT startup_id, created_at FROM interests WHERE investor_id=?').all(uid),
    watchlist: db.prepare('SELECT * FROM watchlist WHERE user_id=?').all(uid),
    notes: db.prepare('SELECT * FROM notes WHERE investor_id=?').all(uid),
    saved_searches: db.prepare('SELECT * FROM saved_searches WHERE user_id=?').all(uid),
    access_requests: db.prepare('SELECT * FROM access_requests WHERE investor_id=?').all(uid),
    // Private document inventory (metadata only — files are downloaded individually).
    private_documents: db.prepare(`SELECT c.id, c.title, c.type, c.access_level FROM collateral c
      JOIN startups s ON s.id=c.startup_id WHERE s.founder_id=? AND c.file_key != ''`).all(uid),
    collateral_access_log: db.prepare('SELECT collateral_id, action, created_at FROM collateral_access_logs WHERE user_id=?').all(uid),
    community_memberships: db.prepare('SELECT community_id, joined_at FROM community_members WHERE user_id=?').all(uid),
    community_posts: db.prepare('SELECT * FROM community_posts WHERE user_id=?').all(uid),
    community_replies: db.prepare('SELECT * FROM community_replies WHERE user_id=?').all(uid),
    reports_filed: db.prepare('SELECT target_type, target_id, reason, status, created_at FROM reports WHERE reporter_id=?').all(uid),
    notifications: db.prepare('SELECT * FROM notifications WHERE user_id=?').all(uid),
  };
  res.setHeader('Content-Disposition', 'attachment; filename="fundamental-data-export.json"');
  res.json(data);
});

// ---- Account deletion (right to erasure) ----
// F-004: enumerate and delete the user's files (public uploads + private docs +
// message attachments) BEFORE removing the row, so no orphaned artifacts remain.
// DB rows cascade via ON DELETE CASCADE foreign keys. Admins cannot self-delete.
router.delete('/me', (req, res) => {
  if (req.user.role === 'admin') return res.status(400).json({ error: 'Admin accounts cannot be self-deleted. Use another admin or the server.' });
  const uid = req.user.id;

  // Private files: collateral in owned startups + attachments the user sent.
  const privateKeys = new Set();
  for (const r of db.prepare(`SELECT c.file_key FROM collateral c JOIN startups s ON s.id=c.startup_id WHERE s.founder_id=? AND c.file_key != ''`).all(uid)) privateKeys.add(r.file_key);
  for (const r of db.prepare(`SELECT attachment_key FROM messages WHERE sender_id=? AND attachment_key != ''`).all(uid)) privateKeys.add(r.attachment_key);

  // Public upload files: profile photo/cover, owned-startup logo/cover/video, post media.
  const publicUrls = new Set();
  const u = db.prepare('SELECT photo, cover FROM users WHERE id=?').get(uid);
  [u && u.photo, u && u.cover].forEach(v => v && publicUrls.add(v));
  for (const r of db.prepare('SELECT logo, cover, video_url FROM startups WHERE founder_id=?').all(uid)) { [r.logo, r.cover, r.video_url].forEach(v => v && publicUrls.add(v)); }
  for (const r of db.prepare("SELECT media FROM posts WHERE user_id=? AND media != ''").all(uid)) publicUrls.add(r.media);
  for (const r of db.prepare("SELECT attachment FROM messages WHERE sender_id=? AND attachment != ''").all(uid)) publicUrls.add(r.attachment);

  audit(uid, 'delete-account', { targetType: 'user', targetId: uid, detail: `private_files=${privateKeys.size} public_files=${publicUrls.size}`, ip: req.ip });
  db.prepare('DELETE FROM startup_views WHERE user_id=?').run(uid); // table has no FK cascade
  db.prepare('DELETE FROM users WHERE id=?').run(uid);

  // Remove files only after the DB row is gone.
  for (const key of privateKeys) deletePrivate(key);
  const { UPLOAD_DIR } = require('../paths');
  for (const url of publicUrls) {
    if (typeof url === 'string' && url.startsWith('/uploads/')) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(url))); } catch { /* already gone / external */ }
    }
  }
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ ok: true });
});

// ---- Edit own profile / investor profile ----
router.put('/me', (req, res) => {
  // F-012: `onboarded` is NOT a generic profile field — it is set only by the
  // server via /complete-onboarding after required artifacts are validated.
  const allowed = ['name', 'city', 'headline', 'bio', 'linkedin', 'education', 'experience', 'photo', 'cover', 'email_alerts', 'inapp_alerts'];
  // photo/cover/linkedin render as src/href — block javascript: et al. (stored XSS)
  const urlErr = validateUrlFields(req.body, ['photo', 'cover', 'linkedin']);
  if (urlErr) return res.status(400).json({ error: urlErr });
  clampStrings(req.body, ['name', 'city', 'headline'], 200);
  clampStrings(req.body, ['bio', 'education', 'experience'], 5000);
  // Profile links are an array, validated/serialized separately from the flat fields.
  if (req.body.links !== undefined) {
    const r = sanitizeLinks(req.body.links);
    if (r.error) return res.status(400).json({ error: r.error });
    req.body.links = JSON.stringify(r.links);
    allowed.push('links');
  }
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

// F-012: server-validated onboarding completion. Founders must have a startup with
// the mandatory one-liner and a verified pitch video; investors just need a profile.
router.post('/complete-onboarding', (req, res) => {
  if (req.user.role === 'founder') {
    // A founder can finish onboarding (and use the app) without a pitch video; the
    // startup simply stays a non-public draft until a video is added (enforced by
    // startup visibility rules). Only the one-line description is required here.
    const s = db.prepare('SELECT one_liner FROM startups WHERE founder_id=?').get(req.user.id);
    if (!s || !s.one_liner || !s.one_liner.trim()) return res.status(400).json({ error: 'Add your one-line description before finishing.' });
  }
  db.prepare('UPDATE users SET onboarded=1 WHERE id=?').run(req.user.id);
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
  const connectors = theirs.filter(id => mine.has(id))
    .map(id => db.prepare('SELECT id, name, role, photo, headline, verified, status, flagged FROM users WHERE id=?').get(id))
    .filter(c => isVisibleUser(c, req.user))
    .slice(0, 3)
    .map(({ status, flagged, ...c }) => c);
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
