const Database = require('better-sqlite3');

// DATA_DIR / DB_PATH resolution lives in paths.js so the DB and upload folders
// all agree on where persistent data is stored (see paths.js).
const { DB_FILE } = require('./paths');
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
// Wait briefly on a locked database (WAL checkpoints, the boot-time seed
// subprocess) instead of throwing SQLITE_BUSY immediately.
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK(role IN ('founder','investor','admin')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  city TEXT DEFAULT '',
  headline TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  linkedin TEXT DEFAULT '',
  education TEXT DEFAULT '',
  experience TEXT DEFAULT '',
  badges TEXT DEFAULT '[]',
  verified INTEGER DEFAULT 0,
  onboarded INTEGER DEFAULT 0,
  google_linked INTEGER DEFAULT 0,
  email_alerts INTEGER DEFAULT 1,
  inapp_alerts INTEGER DEFAULT 1,
  flagged INTEGER DEFAULT 0,
  last_active TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS investor_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  fund_name TEXT DEFAULT '',
  fund_size TEXT DEFAULT '',
  check_size TEXT DEFAULT '',
  stage_focus TEXT DEFAULT '[]',
  sector_focus TEXT DEFAULT '[]',
  thesis TEXT DEFAULT '',
  portfolio TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS startups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  founder_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  logo TEXT DEFAULT '',
  sector TEXT DEFAULT '',
  subsector TEXT DEFAULT '',
  stage TEXT DEFAULT '',
  city TEXT DEFAULT '',
  founded_year INTEGER,
  raising_status TEXT DEFAULT 'Not Raising',
  raising_amount TEXT DEFAULT '',
  one_liner TEXT DEFAULT '',
  problem TEXT DEFAULT '',
  solution TEXT DEFAULT '',
  business_model TEXT DEFAULT '',
  market_size TEXT DEFAULT '',
  competitive_advantage TEXT DEFAULT '',
  round_details TEXT DEFAULT '',
  arr REAL DEFAULT 0, mrr REAL DEFAULT 0, growth REAL DEFAULT 0,
  gross_margin REAL DEFAULT 0, burn REAL DEFAULT 0, runway REAL DEFAULT 0,
  cac REAL DEFAULT 0, ltv REAL DEFAULT 0,
  revenue_series TEXT DEFAULT '[]',
  video_url TEXT DEFAULT '',
  video_chapters TEXT DEFAULT '[]',
  video_views INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  verified INTEGER DEFAULT 0,
  use_of_funds TEXT DEFAULT '[]',
  deployment_timeline TEXT DEFAULT '',
  strategic_objectives TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS upvotes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  startup_id INTEGER NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, startup_id)
);

CREATE TABLE IF NOT EXISTS watchlist (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  startup_id INTEGER NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'Tracking',
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, startup_id)
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  startup_id INTEGER NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  collateral_id INTEGER,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collateral (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  startup_id INTEGER NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  access_level TEXT DEFAULT 'Public' CHECK(access_level IN ('Public','Request Access','Connected Only')),
  file_url TEXT DEFAULT '',
  downloads INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS access_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collateral_id INTEGER NOT NULL REFERENCES collateral(id) ON DELETE CASCADE,
  investor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','revoked')),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (collateral_id, investor_id)
);

CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (requester_id, recipient_id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deal_stage TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (a_id, b_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT DEFAULT '',
  attachment TEXT DEFAULT '',
  ref_startup_id INTEGER,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  startup_id INTEGER,
  media TEXT DEFAULT '',
  removed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  link TEXT DEFAULT '',
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  startup_id INTEGER NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  params TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- F-018: analytics/audit tables (startup_views, audit_logs, collateral_access_logs,
-- reports.target_id) deliberately omit FK cascades so security/audit history survives
-- cascade deletes. Lifecycle is handled explicitly instead: the retention sweep above
-- bounds growth, and account deletion (routes/users.js) removes the deleting user's
-- startup_views. SQLite cannot add FKs to existing tables without a full table rebuild.
CREATE TABLE IF NOT EXISTS startup_views (
  user_id INTEGER NOT NULL,
  startup_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS founder_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  startup_id INTEGER NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  arr REAL, mrr REAL, growth REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS communities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('topic','city','role')),
  description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS community_members (
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (community_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// Lightweight migrations for columns added after first release
for (const stmt of [
  "ALTER TABLE users ADD COLUMN cover TEXT DEFAULT ''",
  "ALTER TABLE startups ADD COLUMN cover TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN pwd_changed_at TEXT DEFAULT NULL", // session invalidation after password change
  "ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0",
  "ALTER TABLE watchlist ADD COLUMN tags TEXT DEFAULT '[]'", // investor deal-flow tags
  "ALTER TABLE startups ADD COLUMN stage_reached_at TEXT DEFAULT NULL", // last funding-journey advance
  // ---- Launch-hardening columns ----
  "ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'",            // active | suspended
  "ALTER TABLE users ADD COLUMN suspended_at TEXT DEFAULT NULL",
  "ALTER TABLE users ADD COLUMN suspended_reason TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN investor_approved INTEGER DEFAULT 0",     // investor must be approved to access deal flow
  "ALTER TABLE users ADD COLUMN accepted_terms_at TEXT DEFAULT NULL",     // legal acceptance timestamp
  "ALTER TABLE startups ADD COLUMN video_duration REAL DEFAULT 0",        // seconds; required <=720 to publish
  "ALTER TABLE startups ADD COLUMN public_share INTEGER DEFAULT 0",       // founder opt-in to the public share page
  "ALTER TABLE collateral ADD COLUMN file_key TEXT DEFAULT ''",           // private-storage filename (not publicly served)
  "ALTER TABLE messages ADD COLUMN attachment_key TEXT DEFAULT ''",       // private message attachment
  "ALTER TABLE messages ADD COLUMN attachment_name TEXT DEFAULT ''",
  "ALTER TABLE startups ADD COLUMN hidden INTEGER DEFAULT 0",             // admin can hide a startup from the marketplace
  "ALTER TABLE users ADD COLUMN links TEXT DEFAULT '[]'",                 // up to 10 user-added profile links [{label,url}]
  // Member-created communities: who created it + an approval gate. Default 'approved'
  // so pre-existing/seeded communities stay live; user submissions are set 'pending'.
  "ALTER TABLE communities ADD COLUMN created_by INTEGER",
  "ALTER TABLE communities ADD COLUMN status TEXT DEFAULT 'approved'",
  "ALTER TABLE startups ADD COLUMN links TEXT DEFAULT '[]'",              // company profile links [{label,url}]
  "ALTER TABLE users ADD COLUMN email_prefs TEXT DEFAULT '{}'",          // per-category email toggles {messages,connections,dealroom,activity}
  // Edit tracking: set when an item is edited so the UI can show an "edited" marker.
  "ALTER TABLE posts ADD COLUMN updated_at TEXT DEFAULT NULL",
  "ALTER TABLE post_comments ADD COLUMN updated_at TEXT DEFAULT NULL",
  "ALTER TABLE community_posts ADD COLUMN updated_at TEXT DEFAULT NULL",
  "ALTER TABLE community_replies ADD COLUMN updated_at TEXT DEFAULT NULL",
]) { try { db.exec(stmt); } catch { /* column exists */ } }

// Startup team members (founder can list co-founders / key team on the company
// profile). Cascades with the startup; ordered by sort_order for stable display.
db.exec(`
CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  startup_id INTEGER NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  linkedin TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_team_members_startup ON team_members(startup_id);
`);

// Demo accounts (dev only) are pre-approved and pre-consented so the seeded
// experience works; real signups remain gated. Idempotent and demo-scoped.
try {
  db.exec("UPDATE users SET investor_approved=1 WHERE role='investor' AND email LIKE '%@demo.app'");
  db.exec("UPDATE users SET accepted_terms_at=datetime('now') WHERE email LIKE '%@demo.app' AND accepted_terms_at IS NULL");
} catch { /* columns not present yet on very first run */ }

// Engagement & deal-flow tables added after first release.
db.exec(`
-- Follow a company (distinct from following a person). Subscribes the follower to
-- the startup's updates and milestone celebrations.
CREATE TABLE IF NOT EXISTS startup_follows (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  startup_id INTEGER NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, startup_id)
);

-- One-tap "Express Interest": a low-friction intent signal from an investor to a
-- founder, separate from conviction upvotes. Powers the engagement loop.
CREATE TABLE IF NOT EXISTS interests (
  investor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  startup_id INTEGER NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (investor_id, startup_id)
);

-- Quick reactions on founder updates (👏🔥🎉🚀). One reaction per user per update.
CREATE TABLE IF NOT EXISTS update_reactions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  update_id INTEGER NOT NULL REFERENCES founder_updates(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, update_id)
);

-- Share a deal with a co-investor (must be a connected investor).
CREATE TABLE IF NOT EXISTS deal_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  startup_id INTEGER NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (from_id, to_id, startup_id)
);

-- Immutable audit trail for sensitive actions (admin moderation, verification,
-- data-room access). Append-only; never updated or deleted by app code.
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  action TEXT NOT NULL,
  target_type TEXT DEFAULT '',
  target_id INTEGER,
  detail TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Data-room access log: who did what to which document, when (P1-3).
CREATE TABLE IF NOT EXISTS collateral_access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collateral_id INTEGER NOT NULL,
  startup_id INTEGER,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,            -- view | download | request | approve | reject | revoke
  ip TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// User-to-user blocks. Blocking is mutual-invisibility: neither side can view,
// connect with, follow, or message the other while the block stands. Managed
// from the profile (block) and Settings (unblock).
db.exec(`
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);
`);

// One-time codes for signup verification (email or SMS). Only the hash is stored.
db.exec(`
CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('email','phone')),
  code_hash TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  verified INTEGER DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_otp_identifier ON otp_codes(identifier, created_at);
`);

// Client-side render errors captured from the browser ErrorBoundary, so production
// crashes are visible server-side without waiting on a user to send a screenshot.
db.exec(`
CREATE TABLE IF NOT EXISTS client_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  message TEXT DEFAULT '',
  stack TEXT DEFAULT '',
  component_stack TEXT DEFAULT '',
  path TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_errors(created_at);
`);

// Indexes for every hot lookup path — without these each request full-scans tables
// that grow linearly with usage (notifications, views, messages).
db.exec(`
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_messages_convo ON messages(conversation_id, read);
CREATE INDEX IF NOT EXISTS idx_messages_convo_id ON messages(conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_startups_sector ON startups(sector);
CREATE INDEX IF NOT EXISTS idx_startups_stage ON startups(stage);
CREATE INDEX IF NOT EXISTS idx_startup_views_startup ON startup_views(startup_id, created_at);
CREATE INDEX IF NOT EXISTS idx_upvotes_startup ON upvotes(startup_id, created_at);
CREATE INDEX IF NOT EXISTS idx_watchlist_startup ON watchlist(startup_id);
CREATE INDEX IF NOT EXISTS idx_connections_recipient ON connections(recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_requester ON connections(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, removed);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_collateral_startup ON collateral(startup_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_investor ON access_requests(investor_id, status);
CREATE INDEX IF NOT EXISTS idx_activities_startup ON activities(startup_id);
CREATE INDEX IF NOT EXISTS idx_founder_updates_startup ON founder_updates(startup_id, created_at);
CREATE INDEX IF NOT EXISTS idx_startups_founder ON startups(founder_id);
CREATE INDEX IF NOT EXISTS idx_notes_inv_startup ON notes(investor_id, startup_id);
CREATE INDEX IF NOT EXISTS idx_conversations_a ON conversations(a_id);
CREATE INDEX IF NOT EXISTS idx_conversations_b ON conversations(b_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_startup_follows_startup ON startup_follows(startup_id);
CREATE INDEX IF NOT EXISTS idx_startup_follows_user ON startup_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_interests_startup ON interests(startup_id);
CREATE INDEX IF NOT EXISTS idx_interests_investor ON interests(investor_id);
CREATE INDEX IF NOT EXISTS idx_update_reactions_update ON update_reactions(update_id);
CREATE INDEX IF NOT EXISTS idx_deal_shares_to ON deal_shares(to_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_collateral_access_logs ON collateral_access_logs(collateral_id, created_at);
`);

// ---- Versioned migrations ----
// The bootstrap above is the frozen baseline. All FUTURE schema changes are
// numbered .sql files in server/migrations/, applied exactly once and recorded
// in schema_migrations (see server/migrations.js).
require('./migrations').runMigrations(db);

// ---- Data retention sweep (at boot, then daily) ----
// Bounds unbounded behavioural/security tables and clears expired one-time codes.
// Runs periodically so long-lived processes keep pruning, not just at startup.
// Document these windows in your privacy policy.
function retentionSweep() {
  try {
    db.exec("DELETE FROM startup_views WHERE created_at < datetime('now','-180 days')");
    db.exec("DELETE FROM otp_codes WHERE created_at < datetime('now','-1 day')");
    db.exec("DELETE FROM collateral_access_logs WHERE created_at < datetime('now','-365 days')");
    db.exec("DELETE FROM notifications WHERE read=1 AND created_at < datetime('now','-180 days')");
    db.exec("DELETE FROM client_errors WHERE created_at < datetime('now','-30 days')");
  } catch { /* tables may not exist on a brand-new DB yet */ }
}
retentionSweep();
setInterval(retentionSweep, 24 * 3600 * 1000).unref();

// ---- shared helpers ----
// Respects the recipient's in-app notification preference (P1-11). Email delivery
// is handled separately by the mailer when email_alerts is on.
function notify(userId, type, text, link = '') {
  const u = db.prepare('SELECT id, name, email, email_alerts, inapp_alerts, email_prefs FROM users WHERE id=?').get(userId);
  if (!u) return;
  if (u.inapp_alerts !== 0) {
    db.prepare('INSERT INTO notifications (user_id, type, text, link) VALUES (?,?,?,?)')
      .run(userId, type, text, link);
  }
  // Email delivery honors email_alerts + per-category email_prefs, is throttled,
  // and never blocks or fails the request (see server/mailer.js).
  require('./mailer').maybeEmail(u, type, text, link);
}

// Append-only audit trail for sensitive/admin actions.
function audit(actorId, action, { targetType = '', targetId = null, detail = '', ip = '' } = {}) {
  db.prepare('INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail, ip) VALUES (?,?,?,?,?,?)')
    .run(actorId ?? null, action, targetType, targetId, detail, ip);
}

// Data-room access log entry.
function logCollateralAccess(collateralId, startupId, userId, action, ip = '') {
  db.prepare('INSERT INTO collateral_access_logs (collateral_id, startup_id, user_id, action, ip) VALUES (?,?,?,?,?)')
    .run(collateralId, startupId ?? null, userId, action, ip);
}

// Startup visibility rules live in a pure module so they're unit-testable without
// the native sqlite binding (P0-4 enforcement).
const { isListed, canViewStartup } = require('./visibility');

function addActivity(startupId, type, text) {
  db.prepare('INSERT INTO activities (startup_id, type, text) VALUES (?,?,?)')
    .run(startupId, type, text);
}

// The public funding journey. Stage advances are celebratory and broadcast to
// everyone tracking or following the company.
const FUNDING_LADDER = ['Idea', 'Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+'];

// Everyone subscribed to a startup's progress: its watchlisters + its followers,
// de-duplicated, excluding a given user (usually the founder).
function startupSubscribers(startupId, excludeUserId = 0) {
  const rows = db.prepare(`
    SELECT user_id FROM watchlist WHERE startup_id=?
    UNION
    SELECT user_id FROM startup_follows WHERE startup_id=?
  `).all(startupId, startupId);
  return rows.map(r => r.user_id).filter(id => id !== excludeUserId);
}

// True when EITHER side has blocked the other (mutual invisibility).
function isBlocked(u1, u2) {
  return !!db.prepare(
    'SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)'
  ).get(u1, u2, u2, u1);
}

function areConnected(u1, u2) {
  return !!db.prepare(
    `SELECT 1 FROM connections WHERE status='accepted' AND
     ((requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?))`
  ).get(u1, u2, u2, u1);
}

// ---- Public user visibility ----
// A single source of truth for "should this account be visible to a normal user?".
// Suspended, flagged, and admin accounts are hidden from discovery/profile/connect/
// follow/messaging surfaces. The viewer always sees themselves, and admins see
// everyone (for moderation). `ACTIVE_USER_SQL` is the matching WHERE fragment for
// bulk queries (e.g. the network directory) so the rule never drifts between the
// row-level check and the list query.
const ACTIVE_USER_SQL = "status='active' AND flagged=0 AND role!='admin'";
function isVisibleUser(u, viewer) {
  if (!u) return false;
  if (viewer && (u.id === viewer.id || viewer.role === 'admin')) return true;
  return u.status === 'active' && !u.flagged && u.role !== 'admin';
}

// Shape a user row for exposure to OTHER members. Explicit ALLOWLIST — never a
// strip-list — so newly added columns (moderation notes, account state, contact
// info) are private by default. Session-only extras (email, phone, onboarded)
// are added by sessionPayload in routes/auth.js, never here.
const PUBLIC_USER_FIELDS = ['id', 'role', 'name', 'city', 'headline', 'bio', 'photo', 'cover',
  'linkedin', 'education', 'experience', 'badges', 'verified', 'links', 'created_at'];
function publicUser(u) {
  if (!u) return null;
  const rest = {};
  for (const k of PUBLIC_USER_FIELDS) if (u[k] !== undefined) rest[k] = u[k];
  rest.badges = JSON.parse(rest.badges || '[]');
  try { rest.links = JSON.parse(rest.links || '[]'); } catch { rest.links = []; }
  return rest;
}

// Profile completion scoring for a founder + their startup
function profileCompletion(user, startup) {
  const checks = [
    !!user.photo, !!user.bio, !!user.headline, !!user.linkedin,
    !!startup, !!(startup && startup.logo), !!(startup && startup.one_liner),
    !!(startup && startup.video_url), !!(startup && startup.problem),
    !!(startup && startup.solution),
    !!(startup && (startup.arr || startup.mrr)),
    !!(startup && db.prepare('SELECT 1 FROM collateral WHERE startup_id=?').get(startup.id)),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// Fundamental Score: 0–100 composite of completeness, traction, engagement and trust.
// Deterministic and explainable — shown with its breakdown, never as a black box.
function fundamentalScore(s) {
  const fields = [s.one_liner, s.problem, s.solution, s.business_model, s.market_size,
    s.competitive_advantage, s.round_details, s.logo, s.video_url].filter(Boolean).length;
  const completeness = Math.round((fields / 9) * 40);
  let traction = 4;
  const rev = s.arr || (s.mrr || 0) * 12;
  if (rev >= 5e6) traction = 26; else if (rev >= 1e6) traction = 21; else if (rev >= 250e3) traction = 15; else if (rev > 0) traction = 10;
  if (s.growth >= 20) traction += 4; else if (s.growth >= 10) traction += 2;
  traction = Math.min(30, traction);
  const upvotes = db.prepare('SELECT COUNT(*) c FROM upvotes WHERE startup_id=?').get(s.id).c;
  const updates = db.prepare("SELECT COUNT(*) c FROM founder_updates WHERE startup_id=? AND created_at > datetime('now','-60 days')").get(s.id).c;
  const engagement = Math.min(20, upvotes * 2 + Math.min(6, (s.views || 0) / 500) + updates * 3);
  const trust = s.verified ? 10 : 0;
  return {
    total: Math.min(100, Math.round(completeness + traction + engagement + trust)),
    breakdown: { completeness, traction, engagement: Math.round(engagement), trust },
  };
}

// Thesis fit: how well a startup matches an investor's declared focus.
function thesisFit(startup, investorProfile) {
  if (!investorProfile) return null;
  const J = (x) => { try { return JSON.parse(x) ?? []; } catch { return []; } };
  const sectors = Array.isArray(investorProfile.sector_focus) ? investorProfile.sector_focus : J(investorProfile.sector_focus);
  const stages = Array.isArray(investorProfile.stage_focus) ? investorProfile.stage_focus : J(investorProfile.stage_focus);
  if (sectors.length === 0 && stages.length === 0) return null;
  let fit = 0;
  if (sectors.includes(startup.sector)) fit += 55; else if (sectors.length === 0) fit += 25;
  if (stages.includes(startup.stage)) fit += 35; else if (stages.length === 0) fit += 15;
  if (startup.raising_status === 'Actively Raising') fit += 10;
  return Math.min(100, fit);
}

// Trust Score for people: verification, profile quality, network, contribution.
// Explainable and anti-gamification: capped components, no like-counting.
function trustScore(u) {
  const tier = Math.min(3, u.verified || 0);
  const verification = [0, 25, 33, 40][tier];
  const fields = [u.photo, u.bio, u.headline, u.linkedin, u.education || u.experience, u.city].filter(Boolean).length;
  const profile = Math.round((fields / 6) * 30);
  const conns = db.prepare("SELECT COUNT(*) c FROM connections WHERE (requester_id=? OR recipient_id=?) AND status='accepted'").get(u.id, u.id).c;
  const network = Math.min(15, conns * 3);
  const posts = db.prepare('SELECT COUNT(*) c FROM posts WHERE user_id=? AND removed=0').get(u.id).c;
  const replies = db.prepare('SELECT COUNT(*) c FROM community_replies WHERE user_id=?').get(u.id).c;
  const contribution = Math.min(15, posts * 3 + replies * 2);
  return { total: verification + profile + network + contribution, breakdown: { verification, profile, network, contribution } };
}

module.exports = { db, notify, audit, logCollateralAccess, isListed, canViewStartup, addActivity, areConnected, isBlocked, publicUser, isVisibleUser, ACTIVE_USER_SQL, profileCompletion, fundamentalScore, thesisFit, trustScore, FUNDING_LADDER, startupSubscribers };
