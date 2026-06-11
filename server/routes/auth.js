const express = require('express');
const bcrypt = require('bcryptjs');
const { db, publicUser } = require('../db');
const { sign, auth } = require('../authmw');

const router = express.Router();
const COOKIE = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 3600 * 1000,
};

function sessionPayload(user) {
  const me = publicUser(user);
  if (user.role === 'investor') {
    const ip = db.prepare('SELECT * FROM investor_profiles WHERE user_id=?').get(user.id);
    if (ip) {
      me.investor = {
        ...ip,
        stage_focus: JSON.parse(ip.stage_focus || '[]'),
        sector_focus: JSON.parse(ip.sector_focus || '[]'),
        portfolio: JSON.parse(ip.portfolio || '[]'),
      };
    }
  }
  if (user.role === 'founder') {
    me.startup = db.prepare('SELECT id, name, logo FROM startups WHERE founder_id=?').get(user.id) || null;
  }
  return me;
}

router.post('/signup', (req, res) => {
  const { role, name, email, password, city } = req.body;
  if (!['founder', 'investor'].includes(role)) return res.status(400).json({ error: 'Select a role: Founder or Investor' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Full name is required' });
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (role, name, email, password_hash, city) VALUES (?,?,?,?,?)')
    .run(role, name.trim(), email.toLowerCase(), hash, city || '');
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  if (role === 'investor') db.prepare('INSERT INTO investor_profiles (user_id) VALUES (?)').run(user.id);
  res.cookie('token', sign(user), COOKIE).json({ user: sessionPayload(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email=?').get((email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.cookie('token', sign(user), COOKIE).json({ user: sessionPayload(user) });
});

// Google OAuth — wired when GOOGLE_CLIENT_ID is configured; clean 501 otherwise.
router.post('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(501).json({ error: 'Google Sign-In is not configured on this deployment. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it.' });
  }
  res.status(501).json({ error: 'Google Sign-In handshake not completed' });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token').json({ ok: true });
});

router.get('/me', auth, (req, res) => {
  res.json({ user: sessionPayload(req.user) });
});

router.post('/change-password', auth, (req, res) => {
  const { current, next } = req.body;
  if (!bcrypt.compareSync(current || '', req.user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  if (!next || next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(next, 10), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
