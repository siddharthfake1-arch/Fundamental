// Shared security primitives: rate limiting, URL/input validation, headers.
// Zero-dependency by design so the security posture never depends on npm install state.
const crypto = require('crypto');

// ---- Rate limiting (fixed window, in-memory) ----
// Per-process is acceptable: the app is a single Node service by architecture.
// If this ever runs multi-instance, move state to Redis without changing call sites.
const buckets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000).unref();

function rateLimit({ windowMs, max, name }) {
  return (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
    b.count++;
    if (b.count > max) {
      res.setHeader('Retry-After', Math.ceil((b.reset - now) / 1000));
      return res.status(429).json({ error: 'Too many requests — please slow down and try again shortly.' });
    }
    next();
  };
}

// ---- URL validation ----
// User-supplied URLs are rendered as <a href> / <img src> / <video src> in the client.
// Only http(s) and our own /uploads paths are allowed — blocks javascript:, data:,
// vbscript: and friends (stored XSS).
function safeUrl(value, { maxLen = 600 } = {}) {
  if (value === undefined || value === null || value === '') return '';
  const v = String(value).trim();
  if (v.length > maxLen) return null;
  if (/[\s<>"'\\]/.test(v)) return null;            // never valid in a URL we accept
  if (v.startsWith('/uploads/')) return v;          // our own object storage
  try {
    const u = new URL(v);
    if (u.protocol === 'http:' || u.protocol === 'https:') return v;
  } catch { /* not absolute */ }
  return null;
}

// Validate a set of URL-bearing fields in-place on a request body.
// Returns an error string, or null when everything is clean.
function validateUrlFields(body, fields) {
  for (const f of fields) {
    if (body[f] === undefined) continue;
    const clean = safeUrl(body[f]);
    if (clean === null) return `"${f}" must be a valid http(s) link or an uploaded file`;
    body[f] = clean;
  }
  return null;
}

// Coerce numeric fields; reject non-numeric garbage instead of storing it.
function validateNumericFields(body, fields) {
  for (const f of fields) {
    if (body[f] === undefined) continue;
    if (body[f] === null || body[f] === '') { body[f] = undefined; continue; }
    const n = Number(body[f]);
    if (!Number.isFinite(n)) return `"${f}" must be a number`;
    body[f] = n;
  }
  return null;
}

// Cap free-text fields to sane lengths (defense against storage abuse via the JSON body cap).
function clampStrings(body, fields, maxLen = 5000) {
  for (const f of fields) {
    if (typeof body[f] === 'string' && body[f].length > maxLen) body[f] = body[f].slice(0, maxLen);
  }
}

// ---- CSRF defense-in-depth ----
// Cookies are SameSite=Lax (blocks cross-site POSTs in modern browsers); this adds an
// explicit Origin check for state-changing API requests as a second layer.
function csrfOriginCheck(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next(); // non-browser clients (curl, tests) and same-origin older browsers
  try {
    if (new URL(origin).host === req.headers.host) return next();
  } catch { /* malformed origin */ }
  return res.status(403).json({ error: 'Cross-origin request rejected' });
}

// ---- Security headers ----
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // App pages only — /uploads sets its own stricter CSP. img/media allow https: because
  // external logo/video URLs are a documented feature; scripts are self-only.
  if (!req.path.startsWith('/uploads/')) {
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; " +
      "connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  }
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

// Unguessable upload names: 16 bytes of CSPRNG entropy (filenames are the only thing
// protecting /uploads objects from URL guessing).
function randomFileName(originalName) {
  const safe = String(originalName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  return `${crypto.randomBytes(16).toString('hex')}-${safe}`;
}

module.exports = { rateLimit, safeUrl, validateUrlFields, validateNumericFields, clampStrings, csrfOriginCheck, securityHeaders, randomFileName };
