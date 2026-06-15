// Small shared server utilities (deduplicated from routes).

// Safe JSON parse with a default.
const J = (s, d = []) => { try { return JSON.parse(s) ?? d; } catch { return d; } };

// Coerce a query-string value to a single trimmed string. Express turns repeated
// params (?q=a&q=b) into arrays and nested params (?q[x]=y) into objects, which
// crash code that calls string methods on them — this normalizes all of those to
// a string so list endpoints can never 500 on hostile input (audit High).
function qstr(v) {
  if (Array.isArray(v)) v = v[0];
  if (v == null || typeof v === 'object') return '';
  return String(v);
}

// Coerce a query value to a bounded positive integer (for pagination).
function qint(v, def, max) {
  const n = parseInt(qstr(v), 10);
  if (!Number.isFinite(n) || n < 0) return def;
  return max != null ? Math.min(n, max) : n;
}

module.exports = { J, qstr, qint };
