const express = require('express');
const { db, publicUser, notify, audit, isVisibleUser } = require('../db');
const { auth } = require('../authmw');

const router = express.Router();
router.use(auth);

const KINDS = ['topic', 'city', 'role'];

function shape(c, userId) {
  // created_by is internal — expose only the derived is_owner flag.
  const { created_by, ...pub } = c;
  return {
    ...pub,
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
  // Discussions by suspended/flagged authors are hidden platform-wide.
  const posts = db.prepare(`SELECT p.* FROM community_posts p JOIN users u ON u.id=p.user_id
    AND u.status='active' AND u.flagged=0 WHERE p.community_id=? ORDER BY p.id DESC LIMIT 50`).all(c.id).map(p => ({
    ...p,
    author: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(p.user_id)),
    replies: db.prepare('SELECT COUNT(*) c FROM community_replies WHERE post_id=?').get(p.id).c,
    can_edit: p.user_id === req.user.id || req.user.role === 'admin',
    edited: !!p.updated_at,
  }));
  res.json({ community: shape(c, req.user.id), posts });
});

// Edit a community. Only the creator or an admin may edit. The description can
// always be changed; the name and kind can only change while still pending (or
// by an admin). The slug never changes once created.
router.put('/:slug', (req, res) => {
  const { c, error } = getVisible(req, req.params.slug);
  if (error) return res.status(404).json({ error: 'We could not find that community. It may have been removed.' });
  if (c.created_by !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Only the community owner can edit it.' });

  const description = String(req.body.description || '').trim();
  if (description.length > 300) return res.status(400).json({ error: 'Keep the description under 300 characters.' });

  const canEditNameKind = c.status === 'pending' || req.user.role === 'admin';
  if (canEditNameKind) {
    const name = String(req.body.name || '').trim();
    const kind = String(req.body.kind || '').trim();
    if (name.length < 3 || name.length > 60) return res.status(400).json({ error: 'Give your community a name between 3 and 60 characters.' });
    if (!KINDS.includes(kind)) return res.status(400).json({ error: 'Choose a community type: topic, city, or role.' });
    db.prepare('UPDATE communities SET name=?, kind=?, description=? WHERE id=?').run(name, kind, description, c.id);
  } else {
    db.prepare('UPDATE communities SET description=? WHERE id=?').run(description, c.id);
  }
  const updated = db.prepare('SELECT * FROM communities WHERE id=?').get(c.id);
  res.json({ community: shape(updated, req.user.id) });
});

// Withdraw/delete a community. The creator can withdraw their own submission while
// it is still pending review; an admin can remove any community. Posts, replies and
// memberships cascade via foreign keys.
router.delete('/:slug', (req, res) => {
  const { c, error } = getVisible(req, req.params.slug);
  if (error) return res.status(404).json({ error: 'We could not find that community. It may have been removed.' });
  const isOwner = c.created_by === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && !(isOwner && c.status === 'pending')) {
    return res.status(403).json({ error: 'You can only withdraw your own community while it is still pending review.' });
  }
  db.prepare('DELETE FROM communities WHERE id=?').run(c.id);
  audit(req.user.id, 'community-delete', { targetType: 'community', targetId: c.id, detail: c.name, ip: req.ip });
  res.json({ ok: true });
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
  const replies = db.prepare(`SELECT r.* FROM community_replies r JOIN users u ON u.id=r.user_id
    AND u.status='active' AND u.flagged=0 WHERE r.post_id=? ORDER BY r.id ASC`).all(req.params.id).map(r => ({
    ...r, author: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(r.user_id)),
    can_edit: r.user_id === req.user.id || req.user.role === 'admin',
    edited: !!r.updated_at,
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

// Edit a discussion. Only the author or an admin may edit, and only while the
// community is still live (approved).
router.put('/posts/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM community_posts WHERE id=?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'We could not find that discussion. It may have been removed.' });
  if (post.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Only the author can edit this discussion.' });
  const community = db.prepare('SELECT * FROM communities WHERE id=?').get(post.community_id);
  if (!community || community.status !== 'approved') return res.status(403).json({ error: 'This community is awaiting approval.' });
  const { title, body } = req.body;
  if (!title || !title.trim() || !body || !body.trim()) return res.status(400).json({ error: 'Please add both a title and a body to start the discussion.' });
  if (body.length > 2000) return res.status(400).json({ error: 'Please keep discussions under 2,000 characters.' });
  db.prepare("UPDATE community_posts SET title=?, body=?, updated_at=datetime('now') WHERE id=?").run(title.trim().slice(0, 140), body.trim(), post.id);
  res.json({ ok: true });
});

// Delete a discussion. Only the author or an admin may delete; replies cascade.
router.delete('/posts/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM community_posts WHERE id=?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'We could not find that discussion. It may have been removed.' });
  if (post.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Only the author can delete this discussion.' });
  db.prepare('DELETE FROM community_replies WHERE post_id=?').run(post.id);
  db.prepare('DELETE FROM community_posts WHERE id=?').run(post.id);
  res.json({ ok: true });
});

// Edit a reply. Only the author or an admin may edit.
router.put('/replies/:id', (req, res) => {
  const reply = db.prepare('SELECT * FROM community_replies WHERE id=?').get(req.params.id);
  if (!reply) return res.status(404).json({ error: 'We could not find that reply. It may have been removed.' });
  if (reply.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Only the author can edit this reply.' });
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Please write a reply before posting.' });
  db.prepare("UPDATE community_replies SET body=?, updated_at=datetime('now') WHERE id=?").run(body.trim().slice(0, 1200), reply.id);
  res.json({ ok: true });
});

// Delete a reply. Only the author or an admin may delete.
router.delete('/replies/:id', (req, res) => {
  const reply = db.prepare('SELECT * FROM community_replies WHERE id=?').get(req.params.id);
  if (!reply) return res.status(404).json({ error: 'We could not find that reply. It may have been removed.' });
  if (reply.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Only the author can delete this reply.' });
  db.prepare('DELETE FROM community_replies WHERE id=?').run(reply.id);
  res.json({ ok: true });
});

// Members directory — powers in-community networking (view profiles, connect).
router.get('/:slug/members', (req, res) => {
  const { c, error } = getVisible(req, req.params.slug);
  if (error) return res.status(404).json({ error: 'We could not find that community.' });
  const members = db.prepare(`SELECT u.* FROM community_members m JOIN users u ON u.id=m.user_id
    WHERE m.community_id=? ORDER BY m.joined_at DESC LIMIT 200`).all(c.id)
    .filter(u => isVisibleUser(u, req.user)) // hide suspended/flagged/admin members (self + admin viewer exempt)
    .map(u => {
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
