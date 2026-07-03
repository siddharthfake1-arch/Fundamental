# Deploying Fundamental

The app is a single Node service: the Express server serves the API **and** the built
React app on one port. Fresh databases seed themselves with demo data on first boot
(disable with `AUTO_SEED=false`).

---

## Option A — Render.com (recommended, free tier works)

**Manual steps (~10 minutes):**

1. Create a free account at https://render.com (sign in with GitHub).
2. Click **New → Web Service** and select the `Fundamental` repository
   (branch: `claude/gracious-goodall-pmgads`, or `main` after merging).
3. Fill in:
   - **Runtime:** Node 20
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
4. Under **Environment Variables**, add:
   - `NODE_ENV` = `production`
   - `JWT_SECRET` = any long random string (e.g. run `openssl rand -hex 32`, or mash the keyboard for 50+ characters)
5. Click **Create Web Service**. First build takes ~5 minutes.
6. Your site is live at `https://<your-app>.onrender.com`.

**Persistence note:** the free tier has an ephemeral disk — the SQLite database and
uploaded files reset on each deploy/restart (demo data re-seeds automatically). For
real users, add a **Persistent Disk** (Render paid feature, ~$1/mo for 1GB), mount it
at `/opt/render/project/src/data`, and point the app at it with these env vars:

```
DATA_DIR=/opt/render/project/src/data
DB_PATH=/opt/render/project/src/data/fundamental.db
```

The database **and** all uploads (public `uploads/` + private `uploads-private/`) are
stored under `DATA_DIR`, so everything survives deploys and restarts on the mounted disk.

## Option B — Railway.app

1. https://railway.app → **New Project → Deploy from GitHub repo**.
2. Railway auto-detects Node. Set **Start Command** to `npm start` if asked.
3. Add the same env vars: `NODE_ENV=production`, `JWT_SECRET=<random string>`.
4. Add a **Volume** (e.g. mounted at `/app/data`) and set `DATA_DIR=/app/data` to persist the database and uploads.
5. Open the generated domain.

## Option C — Your own VPS (DigitalOcean / Hetzner / EC2)

```bash
# On Ubuntu 22.04+
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
git clone <your-repo-url> && cd Fundamental
npm install                       # also builds the client (postinstall)
NODE_ENV=production JWT_SECRET=$(openssl rand -hex 32) PORT=3000 npm start
```
Put nginx or Caddy in front for HTTPS (Caddy: `caddy reverse-proxy --from yourdomain.com --to localhost:3000`).
Use `pm2` to keep it running: `npm i -g pm2 && pm2 start server/index.js --name fundamental && pm2 save`.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `JWT_SECRET` | **Yes (production)** | Signs login sessions. Long random string. The server **refuses to start** in production without it. |
| `NODE_ENV` | Yes | Set `production` (enables secure cookies). |
| `PORT` | No | Defaults to 3000. Render/Railway set it automatically. |
| `DATA_DIR` | Recommended | Directory for the SQLite DB and all uploads (public + private). Point it at a mounted persistent disk so data survives restarts. Defaults to the `server/` folder. |
| `DB_PATH` | No | Explicit path to the SQLite file. Defaults to `<DATA_DIR>/fundamental.db`. |
| `AUTO_SEED` | No | `false` to start with an empty database instead of demo data. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No | Enables the "Sign in with Google" button. |
| `RESEND_API_KEY` (+ optional `OTP_FROM`) | Recommended | Sends signup verification codes by **email** via [Resend](https://resend.com). |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | No | Sends signup verification codes by **SMS** via Twilio. |

**Signup OTP:** new accounts must verify their email or phone with a 6-digit code.
With no provider configured the app runs in **demo mode** — the code is shown on
screen so signup keeps working. Set `RESEND_API_KEY` (email) and/or the Twilio
variables (SMS) for real delivery before launch.

## Going to real production (beyond demo)

- **Database:** SQLite is perfect up to thousands of users on one box. Beyond that, port `server/db.js` to Postgres.
- **Uploads:** move `server/uploads` to S3/Cloudflare R2 for durability and CDN delivery.
- **Pitch videos:** for smooth 12-minute streaming at scale, store videos in object storage or a video CDN (Mux/Cloudflare Stream) and save the URL — the app already accepts external video URLs.
- **Email:** notification preferences exist in-app; wire an SMTP/Resend key to send them by email.
- **Remove demo data:** set `AUTO_SEED=false` before first boot, or delete `server/fundamental.db` and restart.

---

## Production launch checklist (security hardening)

The server now **fails closed**: with `NODE_ENV=production` it refuses to boot unless the
required configuration is present, and it will not run with demo/seed accounts in the database.

**Required in production**

| Variable | Purpose |
| --- | --- |
| `NODE_ENV=production` | Enables secure cookies, HSTS, and the fail-closed checks |
| `JWT_SECRET` | Long random secret (`openssl rand -hex 32`) |
| `APP_URL` (or `PUBLIC_URL`) | Your public site URL |
| `RESEND_API_KEY` *or* Twilio (`TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM`) | OTP delivery — without a provider, signup fails closed (no codes are shown) |

**Admin bootstrap (no public admin signup)**

Set these once to create the first admin; rotate the password after first sign-in:

```
ADMIN_EMAIL=you@yourco.com
ADMIN_PASSWORD=<at least 12 characters>
ADMIN_NAME="Your Name"
```

**Operational requirements (not yet provisioned in code)**

- **Persistent storage:** set `DATA_DIR` to a mounted persistent disk so the SQLite
  database (`<DATA_DIR>/fundamental.db`) and uploads (`<DATA_DIR>/uploads` +
  `<DATA_DIR>/uploads-private`) survive restarts — or migrate to managed Postgres +
  S3/R2 before a large launch. Private documents (`uploads-private/`) are never served
  statically — they stream through access-checked endpoints.
- **Upload size limits:** pitch videos cap at 100 MB, each data-room file at 25 MB,
  images at 10 MB (enforced server-side after a magic-byte content check).
- **Forgot password:** self-serve reset via email OTP is built in (`/api/auth/forgot-password`
  + `/api/auth/reset-password`); a reset invalidates older sessions via `pwd_changed_at`.
- **Notification emails:** with `RESEND_API_KEY` set, in-app notifications also email the
  recipient (honoring the master toggle + per-category preferences in Settings, throttled to
  one email per category per 30 min). Set `APP_URL` so email links point at your domain.
- **Error monitoring:** set `SENTRY_DSN` and `npm install @sentry/node` to capture server
  errors; the hook is soft and the app boots fine without it (see `docs/MONITORING.md`).
- **Schema changes:** go through versioned migrations (`server/migrations/*.sql`, applied
  once and recorded in `schema_migrations`) — back up before deploying one.
- **Backups & restore:** run `npm run backup` (consistent online snapshot + uploads) and
  keep copies off-box. See `docs/BACKUP.md`, and `docs/STAGING.md` / `docs/MONITORING.md`
  / `docs/MIGRATION.md` for staging, observability, and the Postgres/S3 scaling plan.
- **Malware scanning** for uploaded documents (integrate a scanner in the
  `/api/upload/private` pipeline).
- **Distributed rate limiting** (Redis) if running more than one instance — the
  built-in limiter is per-process.
- **Investor KYC/accreditation:** the approval workflow and gating are built in
  (`investor_approved`); connect your KYC provider and approve via the Admin panel.

Run `npm test` for the security self-checks (input validation, upload sniffing,
visibility rules).
