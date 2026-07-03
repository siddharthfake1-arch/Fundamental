// Transactional notification email delivery (Resend), honoring user preferences.
//
// Design:
//   - notify() in db.js calls maybeEmail(user, type, text, link) fire-and-forget.
//     The caller passes the user row, so this module never touches the DB (no
//     circular dependency with db.js).
//   - Master switch: users.email_alerts (0 = no notification email, ever).
//   - Per-category switches: users.email_prefs JSON, e.g. {"messages":0}.
//     A category is ON unless explicitly set to 0/false.
//   - Noise control: high-frequency social signals (profile views, upvotes) are
//     never emailed, and each user gets at most one email per category per
//     30 minutes (in-memory throttle — a burst becomes one email, and the rest
//     wait in the in-app notification center).
//   - Without RESEND_API_KEY this is a silent no-op (dev/test).
const OTP_FROM = () => process.env.OTP_FROM || 'Fundamental <onboarding@resend.dev>';

// Notification type -> preference category (see EMAIL_CATEGORIES for the UI list).
const CATEGORY = {
  'New Message': 'messages',
  'Connection Request': 'connections',
  'Connection Accepted': 'connections',
  'Collateral Request': 'dealroom',
  'Access Approved': 'dealroom',
  'Deal Alert': 'activity',
  'Milestone Achieved': 'activity',
  'Community Review': 'activity',
  'Community Approved': 'activity',
  'Community Declined': 'activity',
  'Community Removed': 'activity',
};
const NEVER_EMAIL = new Set(['Profile Viewed', 'Upvote Received']);
const EMAIL_CATEGORIES = [
  ['messages', 'Messages', 'New direct messages'],
  ['connections', 'Connections', 'Connection requests and accepts'],
  ['dealroom', 'Data room', 'Document access requests and approvals'],
  ['activity', 'Activity', 'Deal alerts, milestones, and community updates'],
];

const THROTTLE_MS = 30 * 60 * 1000;
const lastSent = new Map(); // `${userId}:${category}` -> timestamp
setInterval(() => {
  const cutoff = Date.now() - THROTTLE_MS;
  for (const [k, t] of lastSent) if (t < cutoff) lastSent.delete(k);
}, 10 * 60 * 1000).unref();

async function fetchWithTimeout(url, opts, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

function appBase() {
  return (process.env.APP_URL || process.env.PUBLIC_URL || '').replace(/\/$/, '');
}

// Low-level send. Returns true on accepted delivery, false otherwise.
async function sendEmail(to, subject, text) {
  if (!process.env.RESEND_API_KEY) return false;
  try {
    const r = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: OTP_FROM(), to, subject, text }),
    });
    if (!r.ok) console.error(`Notification email failed (${r.status}) to ${to}`);
    return r.ok;
  } catch (e) {
    console.error('Notification email failed:', e.message);
    return false;
  }
}

// Decide + send a notification email for one in-app notification. Fire-and-forget:
// callers do not await this, and it must never throw.
function maybeEmail(user, type, text, link = '') {
  try {
    if (!process.env.RESEND_API_KEY) return;
    if (!user || !user.email || user.email_alerts === 0) return;
    if (NEVER_EMAIL.has(type)) return;
    const cat = CATEGORY[type] || 'activity';
    let prefs = {};
    try { prefs = JSON.parse(user.email_prefs || '{}') || {}; } catch { /* default all-on */ }
    if (prefs[cat] === 0 || prefs[cat] === false) return;
    const key = `${user.id}:${cat}`;
    const now = Date.now();
    if ((lastSent.get(key) || 0) > now - THROTTLE_MS) return;
    lastSent.set(key, now);
    const base = appBase();
    const body = [
      `Hi ${user.name || 'there'},`,
      '',
      text,
      base && link ? `\nOpen it on Fundamental: ${base}${link}` : (base ? `\nOpen Fundamental: ${base}` : ''),
      '',
      `You are receiving this because email alerts are on for your account.${base ? ` Manage preferences: ${base}/settings?tab=notifications` : ''}`,
    ].filter(l => l !== null).join('\n');
    sendEmail(user.email, `${type} — Fundamental`, body); // intentionally not awaited
  } catch { /* never let email delivery break the request path */ }
}

module.exports = { sendEmail, maybeEmail, EMAIL_CATEGORIES };
