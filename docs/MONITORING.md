# Monitoring, Alerting & Incident Response

## What already exists

- `GET /api/health` — checks DB connectivity (not just process liveness).
- Structured JSON error logs with a per-request `X-Request-Id` (see `server/index.js` error handler).
- Client render-error capture: the browser ErrorBoundary posts to `POST /api/client-errors`; admins review them at `/admin?tab=errors`.

## What to add before broad production

| Signal | Tool (pick one) | Threshold / action |
|--------|-----------------|--------------------|
| Uptime | Better Stack, UptimeRobot, Pingdom | Hit `/api/health` every 1 min; alert after 2 consecutive failures. |
| Server errors (5xx) | Sentry / Logtail | Wire into the `app.use((err,...))` handler (marked `// wire Sentry here`). Alert on error-rate spike. |
| Client errors | Sentry (browser) or the built-in `/api/client-errors` viewer | Daily review; alert if a single message spikes. |
| Deploy failure | Render deploy notifications -> Slack/email | Notify on failed build/deploy. |
| Disk usage | Render disk metric / cron `df` check | Alert at 80% (SQLite + uploads share the disk). |
| Backup failure | Exit code of the backup cron | Page if the daily backup job exits non-zero or uploads 0 bytes. |
| Email delivery | Resend dashboard / webhooks | Alert on bounce/complaint spikes or send failures. |

### Wiring Sentry (server)

**Already wired as a soft hook.** Set `SENTRY_DSN` and run `npm install @sentry/node` — the server initializes Sentry at boot and captures every unhandled route error in the global handler (`server/index.js`). Without the env var or the package it boots normally with a console note.

## Incident runbook (skeleton)

1. **Detect** — alert fires (uptime, 5xx, disk, backup, email).
2. **Triage** — check `/api/health`, Render logs (filter by `request_id`), and `/admin?tab=errors`.
3. **Contain**
   - App down / crash loop → roll back to the previous Render deploy.
   - Disk full → free space or grow the disk; uploads and SQLite share it.
   - Data corruption → restore from the latest verified backup (`docs/BACKUP.md`).
4. **Communicate** — post status to users if downtime > a few minutes.
5. **Recover & verify** — run the `STAGING.md` smoke tests against production.
6. **Postmortem** — root cause, timeline, and one concrete prevention action.

## Admin / security hygiene

- Rotate the bootstrap `ADMIN_PASSWORD` after first sign-in; never leave the documented default in place.
- `validateProductionConfig()` already refuses to boot production without `JWT_SECRET`, an OTP provider, a public URL, and a defined proxy hop count — keep those set.
- Review the audit log (`audit_logs`) and reports regularly; suspensions, verifications, and data-room access are recorded there.
