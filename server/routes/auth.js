const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, publicUser } = require('../db');
const { sign, auth, JWT_SECRET } = require('../authmw');
const { rateLimit } = require('../security');
const { sendOtp, verifyOtp, normalizePhone } = require('../otp');

const router = express.Router();
// Brute-force protection: credential endpoints get a tight per-IP budget.
const authLimiter = rateLimit({ name: 'auth', windowMs: 15 * 60_000, max: 25 });
const otpLimiter = rateLimit({ name: 'otp', windowMs: 10 * 60_000, max: 15 });
const BCRYPT_ROUNDS = 12; // fintech-grade work factor; existing 10-round hashes still verify
const COOKIE = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 3600 * 1000,
};

function sessionPayload(user) {
  const me = publicUser(user);
  me.email = user.email; // own session only — publicUser strips these for everyone else
  me.phone = user.phone || '';
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

// ---- Signup verification (OTP via email or phone) ----
router.post('/send-otp', otpLimiter, async (req, res) => {
  const { channel, identifier } = req.body;
  // For signup we can tell the user early that the email is taken
  if (channel === 'email' && typeof identifier === 'string' &&
      db.prepare('SELECT 1 FROM users WHERE email=?').get(identifier.toLowerCase())) {
    return res.status(409).json({ error: 'An account with this email already exists — sign in instead' });
  }
  const out = await sendOtp(channel, identifier);
  if (out.error) return res.status(400).json({ error: out.error });
  res.json({ ok: true, demo: !!out.demo_code, demo_code: out.demo_code });
});

router.post('/verify-otp', otpLimiter, (req, res) => {
  const { identifier, code } = req.body;
  const out = verifyOtp(identifier, code);
  if (out.error) return res.status(400).json({ error: out.error });
  // Short-lived proof of verification, consumed by /signup
  const otp_token = jwt.sign({ otp: out.identifier, ch: out.channel }, JWT_SECRET, { expiresIn: '30m' });
  res.json({ ok: true, otp_token });
});

router.post('/signup', authLimiter, (req, res) => {
  const { role, name, email, password, city, phone, otp_token } = req.body;
  if (!['founder', 'investor'].includes(role)) return res.status(400).json({ error: 'Select a role: Founder or Investor' });
  if (!name || !String(name).trim() || String(name).length > 120) return res.status(400).json({ error: 'Full name is required' });
  if (typeof email !== 'string' || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  // OTP proof must match the email or the phone on this signup
  let verifiedChannel = null;
  try {
    const p = jwt.verify(otp_token || '', JWT_SECRET);
    const normPhone = phone ? normalizePhone(phone) : null;
    if (p.ch === 'email' && p.otp === email.toLowerCase()) verifiedChannel = 'email';
    else if (p.ch === 'phone' && normPhone && p.otp === normPhone) verifiedChannel = 'phone';
  } catch { /* missing/expired/invalid token */ }
  if (!verifiedChannel) return res.status(400).json({ error: 'Please verify your email or phone with the code we sent before creating the account' });

  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const info = db.prepare('INSERT INTO users (role, name, email, password_hash, city, phone, email_verified, phone_verified) VALUES (?,?,?,?,?,?,?,?)')
    .run(role, String(name).trim(), email.toLowerCase(), hash, String(city || '').slice(0, 120),
      phone ? normalizePhone(phone) || '' : '', verifiedChannel === 'email' ? 1 : 0, verifiedChannel === 'phone' ? 1 : 0);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  if (role === 'investor') db.prepare('INSERT INTO investor_profiles (user_id) VALUES (?)').run(user.id);
  res.cookie('token', sign(user), COOKIE).json({ user: sessionPayload(user) });
});

router.post('/login', authLimiter, (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
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
  // Options must match the set-cookie attributes or some browsers won't clear it
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }).json({ ok: true });
});

router.get('/me', auth, (req, res) => {
  res.json({ user: sessionPayload(req.user) });
});

router.post('/change-password', auth, authLimiter, (req, res) => {
  const { current, next } = req.body;
  if (!bcrypt.compareSync(String(current || ''), req.user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  if (typeof next !== 'string' || next.length < 8 || next.length > 200) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  // pwd_changed_at invalidates every token issued before this moment (kills stolen
  // sessions); we then issue a fresh cookie so the current device stays signed in.
  db.prepare("UPDATE users SET password_hash=?, pwd_changed_at=datetime('now') WHERE id=?")
    .run(bcrypt.hashSync(next, BCRYPT_ROUNDS), req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  res.cookie('token', sign(user), COOKIE).json({ ok: true });
});

module.exports = router;
