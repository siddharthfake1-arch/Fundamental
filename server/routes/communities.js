const express = require('express');
const { db, publicUser } = require('../db');
const { auth } = require('../authmw');

const router = express.Router();
router.use(auth);

function shape(c, userId) {
  return {
    ...c,
    members: db.prepare('SELECT COUNT(*) c FROM community_members WHERE community_id=?').get(c.id).c,
    posts: db.prepare('SELECT COUNT(*) c FROM community_posts WHERE community_id=?').get(c.id).c,
    joined: !!db.prepare('SELECT 1 FROM community_members WHERE community_id=? AND user_id=?').get(c.id, userId),
  };
}

router.get('/', (req, res) => {
  const all = db.prepare('SELECT * FROM communities ORDER BY kind, name').all().map(c => shape(c, req.user.id));
  res.json({ communities: all });
});

router.post('/:slug/join', (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE slug=?').get(req.params.slug);
  if (!c) return res.status(404).json({ error: 'Community not found' });
  const exists = db.prepare('SELECT 1 FROM community_members WHERE community_id=? AND user_id=?').get(c.id, req.user.id);
  if (exists) db.prepare('DELETE FROM community_members WHERE community_id=? AND user_id=?').run(c.id, req.user.id);
  else db.prepare('INSERT INTO community_members (community_id, user_id) VALUES (?,?)').run(c.id, req.user.id);
  res.json({ joined: !exists });
});

router.get('/:slug', (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE slug=?').get(req.params.slug);
  if (!c) return res.status(404).json({ error: 'Community not found' });
  const posts = db.prepare('SELECT * FROM community_posts WHERE community_id=? ORDER BY id DESC LIMIT 50').all(c.id).map(p => ({
    ...p,
    author: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(p.user_id)),
    replies: db.prepare('SELECT COUNT(*) c FROM community_replies WHERE post_id=?').get(p.id).c,
  }));
  res.json({ community: shape(c, req.user.id), posts });
});

router.post('/:slug/posts', (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE slug=?').get(req.params.slug);
  if (!c) return res.status(404).json({ error: 'Community not found' });
  if (!db.prepare('SELECT 1 FROM community_members WHERE community_id=? AND user_id=?').get(c.id, req.user.id)) {
    return res.status(403).json({ error: 'Join the community to start a discussion.' });
  }
  const { title, body } = req.body;
  if (!title || !title.trim() || !body || !body.trim()) return res.status(400).json({ error: 'Title and body are required' });
  if (body.length > 2000) return res.status(400).json({ error: 'Keep discussions under 2000 characters' });
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
  if (!post) return res.status(404).json({ error: 'Discussion not found' });
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Reply is empty' });
  db.prepare('INSERT INTO community_replies (post_id, user_id, body) VALUES (?,?,?)')
    .run(post.id, req.user.id, body.trim().slice(0, 1200));
  res.json({ ok: true });
});

module.exports = router;
