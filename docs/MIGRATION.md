# Scaling Migration Plan (SQLite -> Postgres, local disk -> S3/R2)

**Status: planning only. Do not execute without an explicit decision — the current
SQLite + persistent-disk setup is correct for invite-only beta.** This document maps
the code that assumes SQLite and local files so the migration is mechanical when the
time comes.

## When to migrate

Migrate to Postgres + object storage when any of these become true:

- You need **zero-downtime deploys** (Render disk forces single-instance, recreate-on-deploy).
- You need **more than one app instance** (SQLite is single-writer; in-memory rate limits don't share).
- **Uploads/videos outgrow the disk**, or you need a CDN for video delivery.

## Part 1 — Database: SQLite -> Postgres

**Coupling points (all isolated in `server/db.js`):**
- `better-sqlite3` synchronous API (`db.prepare(...).get/all/run`) is used throughout the routes. Moving to `pg` (async) means routes become `await`-based, or you keep the synchronous shape behind a thin adapter.
- SQLite-specific SQL to translate:
  - `datetime('now')`, `datetime('now','-10 minutes')`, `datetime('now','+N minutes')` -> `now()`, `now() - interval '10 minutes'`.
  - `AUTOINCREMENT` -> `GENERATED ... AS IDENTITY` / `serial`.
  - `INSERT ... .lastInsertRowid` -> `INSERT ... RETURNING id`.
  - `PRAGMA foreign_keys = ON` -> not needed (Postgres enforces FKs).
  - Boolean columns stored as `0/1` integers -> `boolean`.
  - Date comparisons that append `'Z'` in JS (e.g. `new Date(x + 'Z')`) -> store `timestamptz`.

**Recommended path:**
1. Introduce **versioned migrations** first (a `schema_migrations` table + numbered SQL files), and freeze ad-hoc `ALTER TABLE`s in `db.js`. This is valuable even before Postgres.
2. Stand up Render Postgres; translate the schema; load it via the migration files.
3. Build a one-time exporter: read every table with the current SQLite reader, insert into Postgres.
4. Run both in staging, diff row counts, then cut over.
5. Back up SQLite immediately before the cutover (`docs/BACKUP.md`).

## Part 2 — Files: local disk -> S3/R2

**Coupling points:**
- `server/paths.js` — `UPLOAD_DIR`, `PRIVATE_DIR` (filesystem dirs).
- `server/storage.js` — `streamPrivate`, `privateExists`, `deletePrivate` (private files).
- `server/index.js` — multer disk storage, magic-byte validation by reading the head from disk, `express.static('/uploads')`.

**Recommended path:**
1. Define a storage interface: `put(stream) -> key`, `getStream(key)`, `exists(key)`, `delete(key)`, `publicUrl(key)`.
2. Implement it twice: the current local-disk backend and an S3/R2 backend (presigned PUT/GET).
3. Public assets -> bucket + CDN; private assets -> private bucket, served via presigned URLs through the existing access-checked endpoints (keep the permission checks).
4. Keep magic-byte validation: validate the head before finalizing the object.
5. Migrate existing files with a sync script; flip the backend via env (`STORAGE=local|s3`).

## Part 3 — Shared rate limiting: in-memory -> Redis/Upstash

`server/security.js` `rateLimit()` keeps counters in a process-local `Map`. The call
sites already pass `{ name, windowMs, max, keyFn }`, so the swap is a backend change,
not an API change: replace the `buckets` Map with `INCR`/`EXPIRE` on Redis when
`REDIS_URL` is set, falling back to in-memory otherwise. No route changes needed.
