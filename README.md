# Fundamental

**Fundraising? Fundamental.**

A serious fundraising marketplace and professional network. Every startup opens with a mandatory **12-minute video pitch**, structured metrics, and a permissioned data room — built for investors who do real diligence.

![stack](https://img.shields.io/badge/stack-React%20%2B%20Express%20%2B%20SQLite-d9b15e)

## Quick Start

```bash
npm install       # installs everything and builds the client automatically
npm start         # serves the full app on http://localhost:3000
```

Demo data (8 startups, 8 founders, 5 investors, admin) seeds itself on first boot.
Set `AUTO_SEED=false` to start empty. **Deploying to the internet?** See [DEPLOYMENT.md](DEPLOYMENT.md).

**Demo logins** (password `demo1234`):

| Role | Email |
|---|---|
| Founder | `founder1@demo.app` … `founder8@demo.app` |
| Investor | `investor1@demo.app` … `investor5@demo.app` |
| Admin | `admin@fundamental.app` |

For development with hot reload: `npm run dev` (API on :3000, Vite on :5173 with proxy).

## Product

### Pages
- **Login / Signup** — role selection (Founder / Investor), email+password, Google sign-in (enable with `GOOGLE_CLIENT_ID`)
- **Onboarding** — founders: startup details, metrics, *mandatory 12-minute pitch upload* (duration-validated), initial collateral, live profile-completion indicator; investors: fund, check size, stage/sector focus, thesis
- **Discover** — the marketplace: sector / sub-sector / stage / revenue / geography / raising-status / verified-only filters, sort by recent / most upvoted / most viewed, saved searches, institutional tile cards
- **Startup Profile** — 7 structured sections: ① 12-minute pitch (chapter markers, playback speed, view count) ② executive summary ③ metrics dashboard with revenue graph ④ collateral data room (Public / Request Access / Connected Only, founder approve-reject-revoke, download tracking, investor private notes per document) ⑤ team ⑥ activity & signals with upvote trend ⑦ use of funds
- **Founder & Investor Profiles** — bios, badges (Repeat / Exited / High Growth Founder), linked startups, portfolios, thesis, mutual connections
- **Network** — directory with role/sector/stage/geography/active filters, connect & follow, pending/accepted/rejected states
- **Messages** — unlocked only after an accepted connection; attachments, startup references, deal stages (Intro / Due Diligence / Closed / Passed)
- **Dashboards** — founder: completion %, views, video views, collateral requests, upvotes, raise progress tracker; investor: watchlist, requested access, active conversations, suggested startups matched to focus
- **Notifications** — all 7 event types, filter by type, mark as read, live badge counts
- **Social** — controlled professional feed, allowed post types only, tag startups, attach media, like/comment/share
- **Watchlist** (investor) — private notes, status tracking, live activity
- **Settings** — profile, startup management, collateral manager, raising-status toggle, notification prefs, password
- **Admin Panel** — verify users & startups, moderate content, handle reports, flag fraud, platform analytics

### System rules (enforced server-side)
- Mandatory pitch video — startups without one are hidden from Discover
- One upvote per investor per startup
- Messaging only after connection accepted
- Collateral access by access level with founder approval workflow
- Private notes visible only to the creating investor
- Role-based permissions throughout, verified badge system, profile-completion scoring

## Architecture

```
server/            Express API · better-sqlite3 · JWT cookie auth · multer uploads
  index.js         entrypoint, uploads, static serving
  db.js            schema + shared helpers
  seed.js          demo data
  routes/          auth · startups · users · messages · social · misc(admin/dashboards)
client/            React 18 · Vite · Tailwind · React Router (SPA, PWA-installable)
```

Environment: `PORT` (default 3000), `JWT_SECRET` (set in production), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (optional Google sign-in).
