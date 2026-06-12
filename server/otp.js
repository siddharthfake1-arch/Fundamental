// One-time-code generation, delivery and verification for signup.
//
// Delivery is pluggable via environment variables:
//   RESEND_API_KEY (+ optional OTP_FROM)               → email via Resend
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM → SMS via Twilio
// With no provider configured the platform stays usable: the code is returned
// to the client and shown on screen ("demo mode"). Configure a provider before
// real launch — DEPLOYMENT.md documents this.
const crypto = require('crypto');
const { db } = require('./db');

const OTP_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 3; // per identifier per 10 minutes

const hashCode = (c) => crypto.createHash('sha256').update(String(c)).digest('hex');

const isEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
// E.164-ish: optional +, 7–15 digits (spaces/dashes tolerated then stripped)
function normalizePhone(v) {
  if (typeof v !== 'string') return null;
  const cleaned = v.replace(/[\s().-]/g, '');
  return /^\+?[0-9]{7,15}$/.test(cleaned) ? cleaned : null;
}

async function deliver(channel, identifier, code) {
  try {
    if (channel === 'email' && process.env.RESEND_API_KEY) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.OTP_FROM || 'Fundamental <onboarding@resend.dev>',
          to: identifier,
          subject: `${code} is your Fundamental verification code`,
          text: `Your Fundamental verification code is ${code}. It expires in ${OTP_TTL_MIN} minutes. If you didn't request this, ignore this email.`,
        }),
      });
      return r.ok;
    }
    if (channel === 'phone' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: process.env.TWILIO_FROM, To: identifier, Body: `Your Fundamental verification code is ${code}. Expires in ${OTP_TTL_MIN} minutes.` }),
      });
      return r.ok;
    }
  } catch (e) {
    console.error('OTP delivery failed:', e.message);
  }
  return false; // no provider configured (or provider error) → caller falls back to demo mode
}

// Create + (attempt to) deliver a code. Returns { ok, demo_code? } or { error }.
async function sendOtp(channel, rawIdentifier) {
  let identifier;
  if (channel === 'email') {
    if (!isEmail(rawIdentifier)) return { error: 'Enter a valid email address' };
    identifier = rawIdentifier.toLowerCase();
  } else if (channel === 'phone') {
    identifier = normalizePhone(rawIdentifier);
    if (!identifier) return { error: 'Enter a valid phone number (with country code, e.g. +9665…)' };
  } else return { error: 'Invalid verification channel' };

  const recent = db.prepare(
    "SELECT COUNT(*) c FROM otp_codes WHERE identifier=? AND created_at > datetime('now','-10 minutes')"
  ).get(identifier).c;
  if (recent >= MAX_SENDS_PER_WINDOW) return { error: 'Too many codes requested — wait a few minutes and try again' };

  const code = crypto.randomInt(100000, 1000000).toString(); // CSPRNG 6 digits
  db.prepare('DELETE FROM otp_codes WHERE identifier=? AND verified=0').run(identifier); // one live code per identifier
  db.prepare(`INSERT INTO otp_codes (identifier, channel, code_hash, expires_at) VALUES (?,?,?, datetime('now','+${OTP_TTL_MIN} minutes'))`)
    .run(identifier, channel, hashCode(code));

  const delivered = await deliver(channel, identifier, code);
  if (delivered) return { ok: true, identifier };
  // Demo mode: no provider configured. Surfacing the code keeps signup functional;
  // it is clearly labelled in the UI so operators know to configure delivery.
  return { ok: true, identifier, demo_code: code };
}

// Check a submitted code. Returns { ok, channel } or { error }.
function verifyOtp(rawIdentifier, code) {
  const identifier = isEmail(rawIdentifier) ? rawIdentifier.toLowerCase() : normalizePhone(rawIdentifier);
  if (!identifier) return { error: 'Invalid identifier' };
  const row = db.prepare(
    "SELECT * FROM otp_codes WHERE identifier=? AND verified=0 ORDER BY id DESC LIMIT 1"
  ).get(identifier);
  if (!row) return { error: 'No code was sent — request a new one' };
  if (new Date(row.expires_at + 'Z') < new Date()) return { error: 'That code has expired — request a new one' };
  if (row.attempts >= MAX_ATTEMPTS) return { error: 'Too many wrong attempts — request a new code' };
  if (hashCode(String(code || '').trim()) !== row.code_hash) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id=?').run(row.id);
    return { error: 'Incorrect code — check and try again' };
  }
  db.prepare('UPDATE otp_codes SET verified=1 WHERE id=?').run(row.id);
  return { ok: true, identifier, channel: row.channel };
}

module.exports = { sendOtp, verifyOtp, isEmail, normalizePhone };
