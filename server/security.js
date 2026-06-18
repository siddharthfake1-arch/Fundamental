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

// `keyFn(req)` lets callers throttle by something other than IP (e.g. the target
// email/identifier), which is harder to evade across distributed clients (F-011).
// For multi-instance deployments, back this with Redis (documented in DEPLOYMENT.md).
function rateLimit({ windowMs, max, name, keyFn }) {
  return (req, res, next) => {
    const extra = keyFn ? keyFn(req) : req.ip;
    if (extra == null) return next(); // nothing to key on (e.g. no email supplied yet)
    const key = `${name}:${extra}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
    b.count++;
    if (b.count > max) {
      res.setHeader('Retry-After', Math.ceil((b.reset - now) / 1000));
      return res.status(429).json({ error: 'Too many requests. Wait a moment, then try again.' });
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
    if (clean === null) return `Enter a valid http or https link for "${f}", or upload a file.`;
    body[f] = clean;
  }
  return null;
}

// ---- Password policy ----
// A small, high-signal blocklist of the most-guessed passwords. Kept short on
// purpose: bcrypt + rate limiting carry the real load — this just stops the
// laziest choices that would otherwise pass a pure length check.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'iloveyou', 'admin123', 'letmein1', 'welcome1', 'changeme1',
  'passw0rd', 'football1', 'baseball1', 'sunshine1', 'princess1', 'fundamental',
]);

// Validate a password against the production policy. Returns an error string for
// the caller to surface, or null when the password is acceptable. Rules: 8–200
// chars, contains at least one letter AND one number, not a single repeated
// character, and not on the common-password blocklist.
function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Use a password of at least 8 characters.';
  if (pw.length > 200) return 'That password is too long (200 characters max).';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use a mix of letters and numbers in your password.';
  if (/^(.)\1+$/.test(pw)) return 'That password is too simple. Mix in more characters.';
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return 'That password is too common. Choose something harder to guess.';
  return null;
}

// Coerce numeric fields; reject non-numeric garbage instead of storing it.
function validateNumericFields(body, fields) {
  for (const f of fields) {
    if (body[f] === undefined) continue;
    if (body[f] === null || body[f] === '') { body[f] = undefined; continue; }
    const n = Number(body[f]);
    if (!Number.isFinite(n)) return `Enter a number for "${f}".`;
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

// Validate a user/startup "links" array: up to `max` entries of { label, url }.
// Each URL must be a safe http(s) link (blocks javascript:/data: stored XSS);
// labels are optional, stripped of angle brackets and clamped. Blank rows are
// skipped so a trailing empty editor row never blocks a save. Returns
// { links } on success or { error } on the first invalid URL.
function sanitizeLinks(input, max = 10) {
  if (!Array.isArray(input)) return { error: 'Links must be a list.' };
  const out = [];
  for (const item of input) {
    const raw = item && item.url;
    if (!raw || !String(raw).trim()) continue; // skip empty rows
    const url = safeUrl(raw);
    if (!url) return { error: 'Each link needs a valid http or https URL.' };
    const label = String((item && item.label) || '').replace(/[<>]/g, '').trim().slice(0, 80);
    out.push({ label, url });
    if (out.length > max) return { error: `You can add up to ${max} links.` };
  }
  return { links: out };
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
  return res.status(403).json({ error: 'This request was blocked for security reasons. Refresh the page and try again.' });
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

// ---- Upload content validation (magic bytes) ----
// Classify an uploaded file by its actual bytes, not its extension (P0-7).
// Returns 'image' | 'video' | 'document' | null. Rejects spoofed extensions.
function sniffFileType(buf, name = '') {
  if (!buf || buf.length < 4) return null;
  const b = buf;
  const ascii = (start, end) => b.slice(start, end).toString('latin1');
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image'; // PNG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image';                   // JPEG
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image';  // GIF
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image'; // WEBP
  const head = b.slice(0, 512).toString('utf8').trim().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image'; // SVG
  if (b.length >= 12 && ascii(4, 8) === 'ftyp') return 'video';                          // MP4/MOV/M4V
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video';   // WEBM/MKV
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'document'; // PDF
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'document'; // ZIP / docx / xlsx / pptx / key
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'document'; // legacy MS Office
  if (/\.(csv|txt)$/i.test(name) && !/[\x00-\x08\x0e-\x1f]/.test(head)) return 'document'; // CSV/TXT
  return null;
}

module.exports = { rateLimit, safeUrl, validateUrlFields, validateNumericFields, clampStrings, sanitizeLinks, validatePassword, csrfOriginCheck, securityHeaders, randomFileName, sniffFileType };
