-- First-party conversion funnel: event name + timestamp only, no user id, no IP,
-- no payload — enough to see where signups drop off, nothing that identifies a
-- person. Read by the admin analytics overview.
CREATE TABLE IF NOT EXISTS funnel_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_funnel_events_name ON funnel_events(name, created_at);
