-- Index for the report duplicate-check (one open report per reporter per target)
-- and the admin reports list. First migration through the versioned runner.
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id, status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id, status);
