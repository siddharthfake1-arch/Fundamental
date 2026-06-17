const express = require('express');
const { db, publicUser, notify, audit } = require('../db');
const { auth } = require('../authmw');

const router = express.Router();
router.use(auth);

const KINDS = ['topic', 'city', 'role'];

function shape(c, userId) {
  return {
    ...c,
    members: db.prepare('SELECT COUNT(*) c FROM community_members WHERE community_id=?').get(c.id).c,
    posts: db.prepare('SELECT COUNT(*) c FROM community_posts WHERE community_id=?').get(c.id).c,
    joined: !!db.prepare('SELECT 1 FROM community_members WHERE community_id=? AND user_id=?').get(c.id, userId),
    is_owner: c.created_by === userId,
  };
}

// Build a unique URL slug from a community name.
function uniqueSlug(name) {
  const base = String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'community';
  let slug = base, n = 2;
  while (db.prepare('SELECT 1 FROM communities WHERE slug=?').get(slug)) slug = `${base}-${n++}`;
  return slug;
}

// Listing: everyone sees approved communities; a creator also sees their own
// submissions that are still pending review.
router.get('/', (req, res) => {
  const approved = db.prepare("SELECT * FROM communities WHERE status='approved' ORDER BY kind, name").all().map(c => shape(c, req.user.id));
  const pending = db.prepare("SELECT * FROM communities WHERE status='pending' AND created_by=? ORDER BY id DESC").all(req.user.id).map(c => shape(c, req.user.id));
  res.json({ communities: approved, pending });
});

// Anyone (founder, investor, admin) can propose a community. It goes live only
// after an admin approves it. The creator is auto-enrolled as the first member.
router.post('/', (req, res) => {
  const name = String(req.body.name || '').trim();
  const kind = String(req.body.kind || '').trim();
  const description = String(req.body.description || '').trim();
  if (name.length < 3 || name.length > 60) return res.status(400).json({ error: 'Give your community a name between 3 and 60 characters.' });
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'Choose a community type: topic, city, or role.' });
  if (description.length > 300) return res.status(400).json({ error: 'Keep the description under 300 characters.' });

  const slug = uniqueSlug(name);
  const info = db.prepare("INSERT INTO communities (slug, name, kind, description, created_by, status) VALUES (?,?,?,?,?,'pending')")
    .run(slug, name, kind, description, req.user.id);
  // Creator joins automatically so they're a member the moment it goes live.
  db.prepare('INSERT INTO community_members (community_id, user_id) VALUES (?,?)').run(info.lastInsertRowid, req.user.id);
  audit(req.user.id, 'community-create', { targetType: 'community', targetId: info.lastInsertRowid, detail: name, ip: req.ip });
  // Notify admins there is something to review.
  for (const a of db.prepare("SELECT id FROM users WHERE role='admin'").all()) {
    notify(a.id, 'Community Review', `${req.user.name} submitted a new community “${name}” for review.`, '/admin?tab=communities');
  }
  res.json({ ok: true, slug, status: 'pending' });
});

// Resolve a community by slug, enforcing visibility: pending/rejected communities
// are only visible to their creator and admins.
function getVisible(req, slug) {
  const c = db.prepare('SELECT * FROM communities WHERE slug=?').get(slug);
  if (!c) return { error: 404 };
  if (c.status !== 'approved' && c.created_by !== req.user.id && req.user.role !== 'admin') return { error: 404 };
  return { c };
}

router.post('/:slug/join', (req, res) => {
  const { c, error } = getVisible(req, req.params.slug);
  if (error) return res.status(404).json({ error: 'We could not find that community. It may have been removed.' });
  if (c.status !== 'approved') return res.status(403).json({ error: 'This community is awaiting approval.' });
  const exists = db.prepare('SELECT 1 FROM community_members WHERE community_id=? AND user_id=?').get(c.id, req.user.id);
  if (exists) db.prepare('DELETE FROM community_members WHERE community_id=? AND user_id=?').run(c.id, req.user.id);
  else db.prepare('INSERT INTO community_members (community_id, user_id) VALUES (?,?)').run(c.id, req.user.id);
  res.json({ joined: !exists });
});

router.get('/:slug', (req, res) => {
  const { c, error } = getVisible(req, req.params.slug);
  if (error) return res.status(404).json({ error: 'We could not find that community. It may have been removed.' });
  const posts = db.prepare('SELECT * FROM community_posts WHERE community_id=? ORDER BY id DESC LIMIT 50').all(c.id).map(p => ({
    ...p,
    author: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(p.user_id)),
    replies: db.prepare('SELECT COUNT(*) c FROM community_replies WHERE post_id=?').get(p.id).c,
  }));
  res.json({ community: shape(c, req.user.id), posts });
});

router.post('/:slug/posts', (req, res) => {
  const { c, error } = getVisible(req, req.params.slug);
  if (error) return res.status(404).json({ error: 'We could not find that community. It may have been removed.' });
  if (c.status !== 'approved') return res.status(403).json({ error: 'This community is awaiting approval.' });
  if (!db.prepare('SELECT 1 FROM community_members WHERE community_id=? AND user_id=?').get(c.id, req.user.id)) {
    return res.status(403).json({ error: 'Join this community to start a discussion.' });
  }
  const { title, body } = req.body;
  if (!title || !title.trim() || !body || !body.trim()) return res.status(400).json({ error: 'Please add both a title and a body to start the discussion.' });
  if (body.length > 2000) return res.status(400).json({ error: 'Please keep discussions under 2,000 characters.' });
  db.prepare('INSERT INTO community_posts (community_id, user_id, title, body) VALUES (?,?,?,?)')
    .run(c.id, req.user.id, title.trim().slice(0, 140), body.trim());
  res.json({ ok: true });
});

router.get('/posts/:id/replies', (req, res) => {
  const replies = db.prepare('SELECT * FROM community_replies WHERE post_id=? ORDER BY id ASC').all(req.params.id).map(r => ({
    ...r, author: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(r.user_id)),
  }));
  res.json({ replies });
});

router.post('/posts/:id/replies', (req, res) => {
  const post = db.prepare('SELECT * FROM community_posts WHERE id=?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'We could not find that discussion. It may have been removed.' });
  const community = db.prepare('SELECT * FROM communities WHERE id=?').get(post.community_id);
  if (!community || community.status !== 'approved') return res.status(404).json({ error: 'We could not find that discussion.' });
  // Replying requires community membership, same as posting (P2-8).
  if (!db.prepare('SELECT 1 FROM community_members WHERE community_id=? AND user_id=?').get(post.community_id, req.user.id)) {
    return res.status(403).json({ error: 'Join the community to take part in the discussion.' });
  }
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Please write a reply before posting.' });
  db.prepare('INSERT INTO community_replies (post_id, user_id, body) VALUES (?,?,?)')
    .run(post.id, req.user.id, body.trim().slice(0, 1200));
  res.json({ ok: true });
});

// Members directory — powers in-community networking (view profiles, connect).
router.get('/:slug/members', (req, res) => {
  const { c, error } = getVisible(req, req.params.slug);
  if (error) return res.status(404).json({ error: 'We could not find that community.' });
  const members = db.prepare(`SELECT u.* FROM community_members m JOIN users u ON u.id=m.user_id
    WHERE m.community_id=? ORDER BY m.joined_at DESC LIMIT 200`).all(c.id).map(u => {
    const pu = publicUser(u);
    const conn = db.prepare(
      'SELECT * FROM connections WHERE (requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?)'
    ).get(req.user.id, u.id, u.id, req.user.id);
    return {
      id: pu.id, name: pu.name, role: pu.role, photo: pu.photo, headline: pu.headline, verified: pu.verified,
      is_me: u.id === req.user.id,
      connection: conn ? conn.status : null,
      connection_direction: conn ? (conn.requester_id === req.user.id ? 'outgoing' : 'incoming') : null,
    };
  });
  res.json({ members });
});

module.exports = router;
