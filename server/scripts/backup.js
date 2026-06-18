// Backup the SQLite database and all uploaded files into a single timestamped
// folder. Safe to run on a LIVE database: it uses SQLite's online backup API
// (consistent snapshot, no downtime) and copies the upload trees afterward.
//
// Usage:
//   node server/scripts/backup.js                 -> ./backups/<timestamp>/
//   BACKUP_DIR=/mnt/backups node server/scripts/backup.js
//
// The output folder is self-contained:
//   <timestamp>/fundamental.db      (consistent DB snapshot)
//   <timestamp>/uploads/            (public files: logos, photos, pitch videos)
//   <timestamp>/uploads-private/    (data-room docs + message attachments)
//   <timestamp>/manifest.json       (counts + sizes for restore verification)
//
// IMPORTANT: a backup that has never been restored is not a real backup. After
// taking one, run a restore drill into a staging copy (see BACKUP.md).
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DB_FILE, UPLOAD_DIR, PRIVATE_DIR } = require('../paths');

function copyTree(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name), d = path.join(dest, entry.name);
    if (entry.isDirectory()) count += copyTree(s, d);
    else { fs.copyFileSync(s, d); count++; }
  }
  return count;
}

function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseDir = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups');
  const out = path.join(baseDir, stamp);
  fs.mkdirSync(out, { recursive: true });

  // 1) Consistent online DB snapshot (works while the app is running).
  const dbDest = path.join(out, 'fundamental.db');
  if (fs.existsSync(DB_FILE)) {
    const db = new Database(DB_FILE, { readonly: true });
    await db.backup(dbDest);
    db.close();
  } else {
    console.warn(`No database found at ${DB_FILE} - skipping DB snapshot.`);
  }

  // 2) Upload trees.
  const publicCount = copyTree(UPLOAD_DIR, path.join(out, 'uploads'));
  const privateCount = copyTree(PRIVATE_DIR, path.join(out, 'uploads-private'));

  const manifest = {
    created_at: new Date().toISOString(),
    source: { db: DB_FILE, uploads: UPLOAD_DIR, uploads_private: PRIVATE_DIR },
    db_bytes: fs.existsSync(dbDest) ? fs.statSync(dbDest).size : 0,
    public_files: publicCount,
    private_files: privateCount,
    public_bytes: dirSize(path.join(out, 'uploads')),
    private_bytes: dirSize(path.join(out, 'uploads-private')),
  };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`Backup complete -> ${out}`);
  console.log(`  database: ${(manifest.db_bytes / 1048576).toFixed(1)} MB`);
  console.log(`  public:   ${publicCount} files (${(manifest.public_bytes / 1048576).toFixed(1)} MB)`);
  console.log(`  private:  ${privateCount} files (${(manifest.private_bytes / 1048576).toFixed(1)} MB)`);
  console.log('\nNext: copy this folder OFF the server (S3/R2/Backblaze) and run a restore drill (see BACKUP.md).');
}

main().catch((e) => { console.error('Backup FAILED:', e.message); process.exit(1); });
