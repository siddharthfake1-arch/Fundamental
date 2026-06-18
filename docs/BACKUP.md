# Backup & Restore

Fundamental stores everything that matters in two places, both under `DATA_DIR`:

- **SQLite database** (`fundamental.db`) — accounts, profiles, startups, messages, notes, communities.
- **Upload trees** — `uploads/` (public: logos, photos, pitch videos) and `uploads-private/` (data-room documents, message attachments).

Render persistent-disk snapshots are a safety net, not a backup. **A backup you have never restored is not a backup.** Take backups off the server and run a restore drill on a schedule.

## Taking a backup

```bash
# Writes a self-contained, timestamped folder to ./backups/<timestamp>/
npm run backup

# Or choose a destination:
BACKUP_DIR=/mnt/backups npm run backup
```

`backup.js` uses SQLite's **online backup API**, so it produces a consistent snapshot **while the app is running** (no downtime). It then copies both upload trees and writes a `manifest.json` with file counts and sizes for verification.

Output layout:

```
<timestamp>/
  fundamental.db        consistent DB snapshot
  uploads/              public files
  uploads-private/      private files
  manifest.json         counts + byte sizes
```

### Get backups off the box

The disk the app runs on can fail with the app. Copy each backup folder to object storage:

```bash
# examples — pick one and run it after `npm run backup`
aws s3 sync ./backups/<timestamp>  s3://fundamental-backups/<timestamp>/
rclone copy ./backups/<timestamp>  r2:fundamental-backups/<timestamp>
```

Automate it: a daily cron (or Render Cron Job) that runs `npm run backup` and then syncs to S3/R2/Backblaze. Keep at least 7 daily + 4 weekly copies.

## Restoring

Restore **overwrites** the live database and upload trees, so it refuses to run without explicit confirmation.

```bash
# Practice into a STAGING copy first — point the data dir at a throwaway location:
DATA_DIR=/tmp/restore-drill node server/scripts/restore.js ./backups/<timestamp> --force
DATA_DIR=/tmp/restore-drill npm start     # boot and verify the smoke tests in STAGING.md

# Real restore (production), once you are certain of the target:
RESTORE_CONFIRM=yes npm run restore -- ./backups/<timestamp>
```

`restore.js` copies the DB snapshot into `DB_FILE`, removes any stale `-wal`/`-shm` sidecars so SQLite opens cleanly, then replaces both upload trees.

## Restore drill checklist (run monthly)

1. Take a fresh backup (`npm run backup`).
2. Restore it into a throwaway `DATA_DIR` (see command above).
3. Start the server against that data dir.
4. Run the smoke tests in `STAGING.md` (sign in, open a profile, download a data-room doc, view a pitch video).
5. Record the wall-clock time it took — that is your **Recovery Time Objective (RTO)**.
6. Confirm the newest data present matches your **Recovery Point Objective (RPO)** (e.g. "no more than 24h of data loss").

## Targets

| Objective | Beta target | Notes |
|-----------|-------------|-------|
| RPO (max data loss) | 24 hours | daily backup; tighten with hourly DB snapshots if needed |
| RTO (time to restore) | < 1 hour | measured during the drill above |
| Retention | 7 daily + 4 weekly | off-site (S3/R2/Backblaze) |
