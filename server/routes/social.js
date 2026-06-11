const express = require('express');
const { db } = require('../db');
const { auth } = require('../authmw');

const router = express.Router();
router.use(auth);

// Controlled professional feed — allowed post types only. No casual posting.
const POST_TYPES = ['Fundraising Announcement', 'Round Closed', 'Milestone', 'Hiring',
  'Product Launch', 'Investment Made', 'Investor Insight'];

function shapePost(p, userId) {
  const author = db.prepare('SELECT id, name, role, photo, headline, verified FROM users WHERE id=?').get(p.user_id);
  return {
    ...p, author,
    startup: p.startup_id ? db.prepare('SELECT id, name, logo, sector FROM startups WHERE id=?').get(p.startup_id) : null,
    likes: db.prepare('SELECT COUNT(*) c FROM post_likes WHERE post_id=?').get(p.id).c,
    liked: !!db.prepare('SELECT 1 FROM post_likes WHERE user_id=? AND post_id=?').get(userId, p.id),
    comments: db.prepare(`SELECT pc.*, u.name, u.photo, u.role FROM post_comments pc JOIN users u ON u.id=pc.user_id
      WHERE pc.post_id=? ORDER BY pc.id ASC`).all(p.id),
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
  const { type } = req.query;
  let rows = db.prepare('SELECT * FROM posts WHERE removed=0 ORDER BY id DESC LIMIT 100').all();
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
  res.json({ posts: ranked.map(({ p }) => shapePost(p, req.user.id)) });
});

router.post('/', (req, res) => {
  const { type, text, startup_id, media } = req.body;
  if (!POST_TYPES.includes(type)) return res.status(400).json({ error: 'Posts must use one of the allowed professional categories.' });
  if (!text || text.trim().length < 10) return res.status(400).json({ error: 'Write a substantive update (min 10 characters).' });
  if (text.trim().length > 400) return res.status(400).json({ error: 'Posts are capped at 400 characters — keep it sharp.' });
  const founderTypes = ['Fundraising Announcement', 'Round Closed', 'Milestone', 'Hiring', 'Product Launch'];
  const investorTypes = ['Investment Made', 'Investor Insight'];
  if (req.user.role === 'founder' && !founderTypes.includes(type)) return res.status(403).json({ error: 'This post type is for investors.' });
  if (req.user.role === 'investor' && !investorTypes.includes(type)) return res.status(403).json({ error: 'This post type is for founders.' });
  const info = db.prepare('INSERT INTO posts (user_id, type, text, startup_id, media) VALUES (?,?,?,?,?)')
    .run(req.user.id, type, text.trim(), startup_id || null, media || '');
  if (startup_id && ['Round Closed', 'Milestone', 'Hiring'].includes(type)) {
    const map = { 'Round Closed': 'Round Closed', 'Milestone': 'Milestone Achieved', 'Hiring': 'Hiring Announcement' };
    db.prepare('INSERT INTO activities (startup_id, type, text) VALUES (?,?,?)').run(startup_id, map[type], text.trim());
  }
  res.json({ post: shapePost(db.prepare('SELECT * FROM posts WHERE id=?').get(info.lastInsertRowid), req.user.id) });
});

router.post('/:id/like', (req, res) => {
  const exists = db.prepare('SELECT 1 FROM post_likes WHERE user_id=? AND post_id=?').get(req.user.id, req.params.id);
  if (exists) db.prepare('DELETE FROM post_likes WHERE user_id=? AND post_id=?').run(req.user.id, req.params.id);
  else db.prepare('INSERT INTO post_likes (user_id, post_id) VALUES (?,?)').run(req.user.id, req.params.id);
  res.json({ liked: !exists, likes: db.prepare('SELECT COUNT(*) c FROM post_likes WHERE post_id=?').get(req.params.id).c });
});

router.post('/:id/comment', (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Comment is empty' });
  db.prepare('INSERT INTO post_comments (post_id, user_id, text) VALUES (?,?,?)').run(req.params.id, req.user.id, text.trim());
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (post && post.user_id !== req.user.id) {
    db.prepare('INSERT INTO notifications (user_id, type, text, link) VALUES (?,?,?,?)')
      .run(post.user_id, 'New Message', `${req.user.name} commented on your post`, '/social');
  }
  res.json({ post: shapePost(post, req.user.id) });
});

module.exports = router;
