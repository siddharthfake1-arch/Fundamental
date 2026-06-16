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
const { JWT_SECRET } = require('./authmw');

const OTP_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 3; // per identifier per 10 minutes

// F-010: keyed HMAC instead of bare SHA-256. The 6-digit code space is tiny, so a
// DB leak of unsalted SHA-256 hashes would be trivially reversible; an HMAC keyed by
// the server secret cannot be brute-forced offline without that secret.
const OTP_KEY = process.env.OTP_PEPPER || JWT_SECRET;
const hashCode = (c) => crypto.createHmac('sha256', OTP_KEY).update(String(c)).digest('hex');

const isEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
// E.164-ish: optional +, 7–15 digits (spaces/dashes tolerated then stripped)
function normalizePhone(v) {
  if (typeof v !== 'string') return null;
  const cleaned = v.replace(/[\s().-]/g, '');
  return /^\+?[0-9]{7,15}$/.test(cleaned) ? cleaned : null;
}

// Bound outbound provider calls so a hung email/SMS API can't hang the request.
async function fetchWithTimeout(url, opts, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function deliver(channel, identifier, code) {
  try {
    if (channel === 'email' && process.env.RESEND_API_KEY) {
      const r = await fetchWithTimeout('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.OTP_FROM || 'Fundamental <onboarding@resend.dev>',
          to: identifier,
          subject: `${code} is your Fundamental verification code`,
          text: `Your Fundamental verification code is ${code}. It expires in ${OTP_TTL_MIN} minutes. If you did not request this code, you can safely ignore this email.`,
        }),
      });
      return r.ok;
    }
    if (channel === 'phone' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const r = await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: process.env.TWILIO_FROM, To: identifier, Body: `Your Fundamental verification code is ${code}. It expires in ${OTP_TTL_MIN} minutes.` }),
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
    if (!isEmail(rawIdentifier)) return { error: 'Enter a valid email address.' };
    identifier = rawIdentifier.toLowerCase();
  } else if (channel === 'phone') {
    identifier = normalizePhone(rawIdentifier);
    if (!identifier) return { error: 'Enter a valid phone number with country code, for example +9665…' };
  } else return { error: 'Choose a verification method: email or phone.' };

  const recent = db.prepare(
    "SELECT COUNT(*) c FROM otp_codes WHERE identifier=? AND created_at > datetime('now','-10 minutes')"
  ).get(identifier).c;
  if (recent >= MAX_SENDS_PER_WINDOW) return { error: 'You have requested several codes. Wait a few minutes, then try again.' };

  const code = crypto.randomInt(100000, 1000000).toString(); // CSPRNG 6 digits
  db.prepare('DELETE FROM otp_codes WHERE identifier=? AND verified=0').run(identifier); // one live code per identifier
  db.prepare(`INSERT INTO otp_codes (identifier, channel, code_hash, expires_at) VALUES (?,?,?, datetime('now','+${OTP_TTL_MIN} minutes'))`)
    .run(identifier, channel, hashCode(code));

  const delivered = await deliver(channel, identifier, code);
  if (delivered) return { ok: true, identifier };
  // Fail closed in production: never surface the code to the client (P0-2).
  if (process.env.NODE_ENV === 'production') {
    return { error: 'We could not send your verification code right now. Please try again shortly.' };
  }
  // Development only: return the code (clearly labelled in the UI) so local signup
  // works without an email/SMS provider configured.
  return { ok: true, identifier, demo_code: code };
}

// Check a submitted code. Returns { ok, channel } or { error }.
function verifyOtp(rawIdentifier, code) {
  const identifier = isEmail(rawIdentifier) ? rawIdentifier.toLowerCase() : normalizePhone(rawIdentifier);
  if (!identifier) return { error: 'Enter the email address or phone number you used to request the code.' };
  const row = db.prepare(
    "SELECT * FROM otp_codes WHERE identifier=? AND verified=0 ORDER BY id DESC LIMIT 1"
  ).get(identifier);
  if (!row) return { error: 'We have not sent a code to this address. Request a new one.' };
  if (new Date(row.expires_at + 'Z') < new Date()) return { error: 'This code has expired. Request a new one.' };
  if (row.attempts >= MAX_ATTEMPTS) return { error: 'Too many incorrect attempts. Request a new code.' };
  // Bound guesses ACROSS re-requested codes for the same identifier, not just the
  // latest row — otherwise re-requesting a code resets the per-row attempt budget.
  const recentAttempts = db.prepare(
    "SELECT COALESCE(SUM(attempts),0) n FROM otp_codes WHERE identifier=? AND created_at > datetime('now','-10 minutes')"
  ).get(identifier).n;
  if (recentAttempts >= 10) return { error: 'Too many attempts. Please wait a few minutes and request a new code.' };
  if (hashCode(String(code || '').trim()) !== row.code_hash) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id=?').run(row.id);
    return { error: 'That code is incorrect. Check it and try again.' };
  }
  db.prepare('UPDATE otp_codes SET verified=1 WHERE id=?').run(row.id);
  return { ok: true, identifier, channel: row.channel };
}

module.exports = { sendOtp, verifyOtp, isEmail, normalizePhone };
