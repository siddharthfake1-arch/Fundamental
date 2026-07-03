// Versioned schema migrations.
//
// The base schema in db.js is idempotent (CREATE IF NOT EXISTS + tolerated
// ALTERs) and stays as-is. Every schema change FROM NOW ON goes through this
// runner instead: add a numbered .sql file to server/migrations/ and it will be
// applied exactly once, in order, inside a transaction, and recorded in
// schema_migrations. A failed migration aborts boot with a clear error instead
// of being silently swallowed — that is the whole point.
//
//   server/migrations/001_short_description.sql
//   server/migrations/002_next_change.sql
//
// Rules:
//   - Never edit or renumber a migration that has shipped; add a new one.
//   - Back up before deploying migrations to production (npm run backup).
//   - Statements are executed as one script per file (db.exec), in one transaction.
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT DEFAULT (datetime('now'))
  )`);

  if (!fs.existsSync(MIGRATIONS_DIR)) return;
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d+_.+\.sql$/.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version));

  for (const file of files) {
    const version = parseInt(file, 10);
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(version, file);
    });
    try {
      apply();
      console.log(`Migration applied: ${file}`);
    } catch (e) {
      // Fail loudly — a half-applied schema must never boot silently.
      console.error(`FATAL: migration ${file} failed: ${e.message}`);
      console.error('Fix the migration (or restore from backup) before restarting.');
      process.exit(1);
    }
  }
}

module.exports = { runMigrations };
