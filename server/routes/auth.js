const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, publicUser } = require('../db');
const { sign, auth, JWT_SECRET } = require('../authmw');
const { rateLimit } = require('../security');
const { sendOtp, verifyOtp, normalizePhone } = require('../otp');

const router = express.Router();
// Brute-force protection: credential endpoints get a tight per-IP budget.
// The integration test suite runs many flows from a single IP, so limits are
// relaxed only under NODE_ENV=test (never in dev or production).
const TEST = process.env.NODE_ENV === 'test';
const authLimiter = rateLimit({ name: 'auth', windowMs: 15 * 60_000, max: TEST ? 100000 : 25 });
const otpLimiter = rateLimit({ name: 'otp', windowMs: 10 * 60_000, max: TEST ? 100000 : 15 });
// F-011: also throttle by target identifier (email), not just IP, so distributed
// clients can't spray credential attempts at one account.
const lc = (v) => (typeof v === 'string' ? v.toLowerCase().slice(0, 254) : null);
const loginIdLimiter = rateLimit({ name: 'login-id', windowMs: 15 * 60_000, max: TEST ? 100000 : 10, keyFn: (req) => lc(req.body && req.body.email) });
const otpIdLimiter = rateLimit({ name: 'otp-id', windowMs: 10 * 60_000, max: TEST ? 100000 : 6, keyFn: (req) => lc(req.body && req.body.identifier) });
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

// ---- Signup verification (OTP via email) ----
// Neutral response: we do not reveal whether an email is already registered here
// (no enumeration oracle). A duplicate is only reported at the final signup step,
// which the attacker can only reach by controlling — and verifying — that mailbox.
router.post('/send-otp', otpLimiter, otpIdLimiter, async (req, res) => {
  const { channel, identifier } = req.body;
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

router.post('/signup', authLimiter, async (req, res) => {
  const { role, name, email, password, city, phone, otp_token, accept_terms } = req.body;
  if (!['founder', 'investor'].includes(role)) return res.status(400).json({ error: 'Select your role: founder or investor.' });
  if (!name || !String(name).trim() || String(name).length > 120) return res.status(400).json({ error: 'Enter your full name (up to 120 characters).' });
  if (typeof email !== 'string' || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
  if (!accept_terms) return res.status(400).json({ error: 'Please accept the Terms of Service and Privacy Policy to continue.' }); // P0-10

  // The account email is the login credential, so it MUST be the verified channel —
  // a phone OTP cannot be used to claim an arbitrary, unverified email (P0-2).
  let emailVerified = false;
  try {
    const p = jwt.verify(otp_token || '', JWT_SECRET);
    if (p.ch === 'email' && p.otp === email.toLowerCase()) emailVerified = true;
  } catch { /* missing/expired/invalid token */ }
  if (!emailVerified) return res.status(400).json({ error: 'Verify your email address with the code we sent before creating your account.' });

  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email.toLowerCase())) {
    return res.status(409).json({ error: 'An account already uses this email address.' });
  }
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const info = db.prepare("INSERT INTO users (role, name, email, password_hash, city, phone, email_verified, phone_verified, accepted_terms_at) VALUES (?,?,?,?,?,?,1,0,datetime('now'))")
    .run(role, String(name).trim(), email.toLowerCase(), hash, String(city || '').slice(0, 120), phone ? normalizePhone(phone) || '' : '');
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  if (role === 'investor') db.prepare('INSERT INTO investor_profiles (user_id) VALUES (?)').run(user.id);
  res.cookie('token', sign(user), COOKIE).json({ user: sessionPayload(user) });
});

router.post('/login', authLimiter, loginIdLimiter, async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').toLowerCase());
  // Async bcrypt so a slow hash doesn't block the event loop under concurrent logins.
  const ok = user && await bcrypt.compare(String(password || ''), user.password_hash);
  if (!ok) return res.status(401).json({ error: 'That email or password is incorrect.' });
  if (user.status === 'suspended' || user.flagged) {
    return res.status(403).json({ error: 'Your account has been suspended. Contact support@fundamental.app if you believe this is a mistake.' });
  }
  res.cookie('token', sign(user), COOKIE).json({ user: sessionPayload(user) });
});

// Google OAuth — wired when GOOGLE_CLIENT_ID is configured; clean 501 otherwise.
router.post('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(501).json({ error: 'Google Sign-In is not configured on this deployment. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it.' });
  }
  res.status(501).json({ error: 'Google Sign-In could not be completed. Try again or use your email and password.' });
});

router.post('/logout', (req, res) => {
  // Options must match the set-cookie attributes or some browsers won't clear it
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }).json({ ok: true });
});

router.get('/me', auth, (req, res) => {
  res.json({ user: sessionPayload(req.user) });
});

router.post('/change-password', auth, authLimiter, async (req, res) => {
  const { current, next } = req.body;
  if (!await bcrypt.compare(String(current || ''), req.user.password_hash)) {
    return res.status(400).json({ error: 'Your current password is incorrect.' });
  }
  if (typeof next !== 'string' || next.length < 8 || next.length > 200) return res.status(400).json({ error: 'Choose a new password of at least 8 characters.' });
  // pwd_changed_at invalidates every token issued before this moment (kills stolen
  // sessions). We set it first, then sign a fresh token so the current device stays
  // signed in — authmw uses a small grace window to avoid a same-second eviction race.
  const hash = await bcrypt.hash(next, BCRYPT_ROUNDS);
  db.prepare("UPDATE users SET password_hash=?, pwd_changed_at=datetime('now') WHERE id=?").run(hash, req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  res.cookie('token', sign(user), COOKIE).json({ ok: true });
});

module.exports = router;
