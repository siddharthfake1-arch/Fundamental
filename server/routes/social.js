const express = require('express');
const { db } = require('../db');
const { auth } = require('../authmw');
const { validateUrlFields } = require('../security');
const { qstr, qint } = require('../util');

const router = express.Router();
router.use(auth);

// Controlled professional feed — allowed post types only. No casual posting.
const POST_TYPES = ['Fundraising Announcement', 'Round Closed', 'Milestone', 'Hiring',
  'Product Launch', 'Investment Made', 'Investor Insight'];

function shapePost(p, userId) {
  const author = db.prepare('SELECT id, name, role, photo, headline, verified FROM users WHERE id=?').get(p.user_id);
  return {
    ...p, author,
    can_edit: p.user_id === userId,
    edited: !!p.updated_at,
    startup: p.startup_id ? db.prepare('SELECT id, name, logo, sector FROM startups WHERE id=?').get(p.startup_id) : null,
    likes: db.prepare('SELECT COUNT(*) c FROM post_likes WHERE post_id=?').get(p.id).c,
    liked: !!db.prepare('SELECT 1 FROM post_likes WHERE user_id=? AND post_id=?').get(userId, p.id),
    comments: db.prepare(`SELECT pc.*, u.name, u.photo, u.role FROM post_comments pc JOIN users u ON u.id=pc.user_id
      WHERE pc.post_id=? ORDER BY pc.id ASC`).all(p.id).map(pc => ({ ...pc, can_edit: pc.user_id === userId, edited: !!pc.updated_at })),
  };
}

router.get('/types', (req, res) => {
  const allowed = req.user.role === 'investor'
    ? ['Investment Made', 'Investor Insight']
    : ['Fundraising Announcement', 'Round Closed', 'Milestone', 'Hiring', 'Product Launch'];
  res.json({ types: POST_TYPES, allowed_for_me: allowed });
});

// Signal-ranked feed: relevance + author credibility + signal type — not likes.
router.get('/', (req, res) => {
  const type = qstr(req.query.type);
  const limit = qint(req.query.limit, 30, 50), offset = qint(req.query.offset, 0);
  let rows = db.prepare('SELECT * FROM posts WHERE removed=0 ORDER BY id DESC LIMIT 150').all();
  if (type) rows = rows.filter(p => p.type === type);
  const ip = req.user.role === 'investor'
    ? db.prepare('SELECT sector_focus FROM investor_profiles WHERE user_id=?').get(req.user.id) : null;
  let mySectors = [];
  try { mySectors = ip ? JSON.parse(ip.sector_focus) : []; } catch {}
  const myStartup = req.user.role === 'founder'
    ? db.prepare('SELECT sector FROM startups WHERE founder_id=?').get(req.user.id) : null;
  if (myStartup) mySectors = [myStartup.sector];
  const SIGNAL_WEIGHT = { 'Fundraising Announcement': 3, 'Round Closed': 3, 'Investor Insight': 3, 'Milestone': 2.5, 'Investment Made': 2.5, 'Product Launch': 2, 'Hiring': 1 };
  const ranked = rows.map(p => {
    const author = db.prepare('SELECT verified FROM users WHERE id=?').get(p.user_id);
    const startup = p.startup_id ? db.prepare('SELECT sector FROM startups WHERE id=?').get(p.startup_id) : null;
    const ageHours = (Date.now() - new Date(p.created_at + 'Z')) / 36e5;
    const rank = (SIGNAL_WEIGHT[p.type] || 1)
      + Math.min(3, (author?.verified || 0)) * 1.5            // credibility, capped
      + (startup && mySectors.includes(startup.sector) ? 3 : 0) // relevance to viewer
      - Math.min(8, ageHours / 24);                            // recency decay
    return { p, rank };
  }).sort((a, b) => b.rank - a.rank);
  const page = ranked.slice(offset, offset + limit);
  res.json({ posts: page.map(({ p }) => shapePost(p, req.user.id)), total: ranked.length, limit, offset });
});

router.post('/', (req, res) => {
  // Post media renders as <img>/<video>/<a href> for every feed viewer (stored XSS)
  const urlErr = validateUrlFields(req.body, ['media']);
  if (urlErr) return res.status(400).json({ error: urlErr });
  const { type, text, startup_id, media } = req.body;
  if (!POST_TYPES.includes(type)) return res.status(400).json({ error: 'Please choose one of the supported professional post categories.' });
  if (!text || text.trim().length < 10) return res.status(400).json({ error: 'Share a substantive update of at least 10 characters.' });
  if (text.trim().length > 400) return res.status(400).json({ error: 'Posts are limited to 400 characters. Please keep it sharp.' });
  const founderTypes = ['Fundraising Announcement', 'Round Closed', 'Milestone', 'Hiring', 'Product Launch'];
  const investorTypes = ['Investment Made', 'Investor Insight'];
  if (req.user.role === 'founder' && !founderTypes.includes(type)) return res.status(403).json({ error: 'This post type is available to investors only.' });
  if (req.user.role === 'investor' && !investorTypes.includes(type)) return res.status(403).json({ error: 'This post type is available to founders only.' });
  // A founder may only tag their own startup; investors cannot tag a startup as
  // the official author (prevents misleading associations, P1-9).
  let taggedId = null;
  if (startup_id) {
    if (req.user.role !== 'founder') return res.status(403).json({ error: 'Only a startup\'s founder can tag it in a post.' });
    const own = db.prepare('SELECT 1 FROM startups WHERE id=? AND founder_id=?').get(startup_id, req.user.id);
    if (!own) return res.status(403).json({ error: 'You can only tag your own startup.' });
    taggedId = Number(startup_id);
  }
  const info = db.prepare('INSERT INTO posts (user_id, type, text, startup_id, media) VALUES (?,?,?,?,?)')
    .run(req.user.id, type, text.trim(), taggedId, media || '');
  if (taggedId && ['Round Closed', 'Milestone', 'Hiring'].includes(type)) {
    const map = { 'Round Closed': 'Round Closed', 'Milestone': 'Milestone Achieved', 'Hiring': 'Hiring Announcement' };
    db.prepare('INSERT INTO activities (startup_id, type, text) VALUES (?,?,?)').run(taggedId, map[type], text.trim());
  }
  res.json({ post: shapePost(db.prepare('SELECT * FROM posts WHERE id=?').get(info.lastInsertRowid), req.user.id) });
});

// Removed/moderated posts cannot be interacted with by direct ID (P1-10).
function livePost(req, res, next) {
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!post || post.removed) return res.status(404).json({ error: 'This post is no longer available.' });
  req.post = post;
  next();
}

router.post('/:id/like', livePost, (req, res) => {
  const exists = db.prepare('SELECT 1 FROM post_likes WHERE user_id=? AND post_id=?').get(req.user.id, req.params.id);
  if (exists) db.prepare('DELETE FROM post_likes WHERE user_id=? AND post_id=?').run(req.user.id, req.params.id);
  else db.prepare('INSERT INTO post_likes (user_id, post_id) VALUES (?,?)').run(req.user.id, req.params.id);
  res.json({ liked: !exists, likes: db.prepare('SELECT COUNT(*) c FROM post_likes WHERE post_id=?').get(req.params.id).c });
});

router.post('/:id/comment', livePost, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Please write a comment before posting.' });
  db.prepare('INSERT INTO post_comments (post_id, user_id, text) VALUES (?,?,?)').run(req.params.id, req.user.id, text.trim().slice(0, 1000));
  const post = req.post;
  if (post && post.user_id !== req.user.id) {
    db.prepare('INSERT INTO notifications (user_id, type, text, link) VALUES (?,?,?,?)')
      .run(post.user_id, 'New Message', `${req.user.name} commented on your post. Open it to see what they said.`, '/social');
  }
  res.json({ post: shapePost(post, req.user.id) });
});

// Comment edit/delete — owner or admin only (re-verified server-side).
router.put('/comments/:id', (req, res) => {
  const comment = db.prepare('SELECT * FROM post_comments WHERE id=?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'This comment is no longer available.' });
  if (comment.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'You can only edit your own comment.' });
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Please write a comment before saving.' });
  db.prepare("UPDATE post_comments SET text=?, updated_at=datetime('now') WHERE id=?").run(text.trim().slice(0, 1000), req.params.id);
  res.json({ ok: true });
});

router.delete('/comments/:id', (req, res) => {
  const comment = db.prepare('SELECT * FROM post_comments WHERE id=?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'This comment is no longer available.' });
  if (comment.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'You can only delete your own comment.' });
  db.prepare('DELETE FROM post_comments WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Post edit/delete — owner or admin only (re-verified server-side).
router.put('/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!post || post.removed) return res.status(404).json({ error: 'This post is no longer available.' });
  if (post.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'You can only edit your own post.' });
  // Post media renders as <img>/<video>/<a href> for every feed viewer (stored XSS)
  const urlErr = validateUrlFields(req.body, ['media']);
  if (urlErr) return res.status(400).json({ error: urlErr });
  const { type, text, startup_id, media } = req.body;
  if (!POST_TYPES.includes(type)) return res.status(400).json({ error: 'Please choose one of the supported professional post categories.' });
  if (!text || text.trim().length < 10) return res.status(400).json({ error: 'Share a substantive update of at least 10 characters.' });
  if (text.trim().length > 400) return res.status(400).json({ error: 'Posts are limited to 400 characters. Please keep it sharp.' });
  const founderTypes = ['Fundraising Announcement', 'Round Closed', 'Milestone', 'Hiring', 'Product Launch'];
  const investorTypes = ['Investment Made', 'Investor Insight'];
  if (req.user.role === 'founder' && !founderTypes.includes(type)) return res.status(403).json({ error: 'This post type is available to investors only.' });
  if (req.user.role === 'investor' && !investorTypes.includes(type)) return res.status(403).json({ error: 'This post type is available to founders only.' });
  // A founder may only tag their own startup; investors cannot tag a startup as
  // the official author (prevents misleading associations, P1-9).
  let taggedId = null;
  if (startup_id) {
    if (req.user.role !== 'founder') return res.status(403).json({ error: 'Only a startup\'s founder can tag it in a post.' });
    const own = db.prepare('SELECT 1 FROM startups WHERE id=? AND founder_id=?').get(startup_id, req.user.id);
    if (!own) return res.status(403).json({ error: 'You can only tag your own startup.' });
    taggedId = Number(startup_id);
  }
  db.prepare("UPDATE posts SET type=?, text=?, startup_id=?, media=?, updated_at=datetime('now') WHERE id=?")
    .run(type, text.trim(), taggedId, media || '', req.params.id);
  res.json({ post: shapePost(db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id), req.user.id) });
});

router.delete('/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!post || post.removed) return res.status(404).json({ error: 'This post is no longer available.' });
  if (post.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'You can only delete your own post.' });
  db.prepare('UPDATE posts SET removed=1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
