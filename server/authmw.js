const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('./db');

// SECURITY: never sign production sessions with a predictable secret. Refusing to boot
// is the only safe behaviour — a known secret means anyone can forge an admin token.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET must be set in production. Generate one with: openssl rand -hex 32');
  process.exit(1);
}
// Dev fallback is random per boot (not a hardcoded string) so a leaked dev cookie can
// never be replayed against another instance. Restarting dev just re-logs you in.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}

// Sessions arrive as an httpOnly cookie (web) or an Authorization: Bearer header
// (native mobile apps, which store the token in secure device storage). Bearer takes
// precedence: a client that explicitly presents Authorization is a programmatic
// client, and an ambient cookie must never override its stated identity.
function extractToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return req.cookies.token;
}

function auth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    // Tokens issued before the last password change are dead — evicts stolen sessions.
    // A 2s grace avoids a same-second race evicting the freshly-issued token (iat is
    // second-resolution while pwd_changed_at can land in the same second).
    if (user.pwd_changed_at && payload.iat * 1000 < new Date(user.pwd_changed_at + 'Z').getTime() - 2000) {
      return res.status(401).json({ error: 'Session expired — please sign in again' });
    }
    // Suspended or flagged accounts are locked out immediately — every request
    // re-checks status, so existing sessions stop working the moment they're suspended (P0-6).
    if (user.status === 'suspended' || user.flagged) {
      res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
      return res.status(403).json({ error: 'Your account has been suspended. Contact support@fundamental.app if you believe this is a mistake.' });
    }
    // Presence tracking only needs minute resolution — writing on EVERY request
    // (including the 8s/15s polls) made each poll a WAL write. One write per
    // 60s per user carries the same product signal at a fraction of the churn.
    if (!user.last_active || (Date.now() - new Date(user.last_active + 'Z').getTime()) > 60_000) {
      db.prepare("UPDATE users SET last_active=datetime('now') WHERE id=?").run(user.id);
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

// Investor-only deal-flow actions require an approved investor account (P0-5).
// Admins always pass. Founders are rejected by the surrounding requireRole.
function requireApprovedInvestor(req, res, next) {
  if (req.user.role === 'admin') return next();
  if (req.user.role !== 'investor') {
    return res.status(403).json({ error: 'This action is for investors.' });
  }
  if (!req.user.investor_approved) {
    return res.status(403).json({ error: 'Your investor account is pending approval. You can browse once an administrator approves access.' });
  }
  next();
}

// Fail-closed production configuration check (P0-9). Called once at boot.
function validateProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = [];
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  // OTP delivery must be configured in production — no demo-code fallback is allowed.
  const hasEmailOtp = !!process.env.RESEND_API_KEY;
  const hasSmsOtp = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
  if (!hasEmailOtp && !hasSmsOtp) missing.push('RESEND_API_KEY (or Twilio SMS credentials)');
  if (!process.env.APP_URL && !process.env.PUBLIC_URL) missing.push('APP_URL (your public site URL)');
  // F-006: proxy topology must be explicit in production so req.ip can't be spoofed.
  if (process.env.TRUST_PROXY_HOPS === undefined) missing.push('TRUST_PROXY_HOPS (number of trusted proxy hops, e.g. 1 behind Render/nginx)');
  if (missing.length) {
    console.error('FATAL: production launch blocked — missing required configuration:\n  - ' + missing.join('\n  - '));
    console.error('Set these environment variables, or run with NODE_ENV unset for local development.');
    process.exit(1);
  }
}

module.exports = { sign, auth, extractToken, requireRole, requireApprovedInvestor, validateProductionConfig, JWT_SECRET };
