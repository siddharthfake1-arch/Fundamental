// Restore a backup folder produced by backup.js into the live data locations.
//
// Usage:
//   node server/scripts/restore.js ./backups/2026-06-18T10-00-00-000Z
//   node server/scripts/restore.js <folder> --force      (skip confirmation)
//
// This OVERWRITES the current database and upload trees. By default it refuses to
// run unless RESTORE_CONFIRM=yes (or --force) is set, because restoring onto a live
// production database is destructive. Always practice restores into a STAGING copy
// first (point DATA_DIR/DB_PATH at a throwaway dir) - see BACKUP.md.
const fs = require('fs');
const path = require('path');
const { DB_FILE, UPLOAD_DIR, PRIVATE_DIR } = require('../paths');

const src = process.argv[2];
const force = process.argv.includes('--force') || process.env.RESTORE_CONFIRM === 'yes';

if (!src) { console.error('Usage: node server/scripts/restore.js <backup-folder> [--force]'); process.exit(1); }
if (!fs.existsSync(src)) { console.error(`Backup folder not found: ${src}`); process.exit(1); }
if (!force) {
  console.error('Refusing to restore without confirmation. This OVERWRITES the live database and uploads.');
  console.error('Re-run with --force (or RESTORE_CONFIRM=yes) once you are sure of the target DATA_DIR/DB_PATH.');
  process.exit(1);
}

function replaceTree(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return 0;
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name), d = path.join(destDir, entry.name);
    if (entry.isDirectory()) count += replaceTree(s, d);
    else { fs.copyFileSync(s, d); count++; }
  }
  return count;
}

// Database: copy the snapshot into place and remove any stale WAL/SHM sidecars so
// SQLite opens the restored file cleanly.
const dbSnap = path.join(src, 'fundamental.db');
if (fs.existsSync(dbSnap)) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) { try { fs.rmSync(DB_FILE + suffix, { force: true }); } catch {} }
  fs.copyFileSync(dbSnap, DB_FILE);
  console.log(`Restored database -> ${DB_FILE}`);
} else {
  console.warn('No fundamental.db in backup - leaving current database untouched.');
}

const pub = replaceTree(path.join(src, 'uploads'), UPLOAD_DIR);
const priv = replaceTree(path.join(src, 'uploads-private'), PRIVATE_DIR);
console.log(`Restored ${pub} public file(s) and ${priv} private file(s).`);
console.log('\nDone. Start the server and run the smoke-test checklist (see STAGING.md) to verify.');
