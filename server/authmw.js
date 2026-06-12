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

function auth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    // Tokens issued before the last password change are dead — evicts stolen sessions.
    if (user.pwd_changed_at && payload.iat * 1000 < new Date(user.pwd_changed_at + 'Z').getTime()) {
      return res.status(401).json({ error: 'Session expired — please sign in again' });
    }
    db.prepare("UPDATE users SET last_active=datetime('now') WHERE id=?").run(user.id);
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

module.exports = { sign, auth, requireRole, JWT_SECRET };
