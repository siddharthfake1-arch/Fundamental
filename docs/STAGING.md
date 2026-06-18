# Staging & Pre-Production Smoke Tests

GitHub + Render auto-deploy can push straight to production. Until there is a staging gate, production *is* the test environment. Set up a staging service so changes are exercised before real users see them.

## Staging environment

1. **Create a second Render service** ("fundamental-staging") from the same repo, set to deploy from a `staging` branch (or use Render preview environments per PR).
2. **Separate persistent disk** and a **separate `DATA_DIR`** so staging never touches production data.
3. **Environment variables** mirror production but with throwaway secrets:
   - `NODE_ENV=production` (so you test the real code paths), but a distinct `JWT_SECRET`.
   - `AUTO_SEED=false` (production safety check stays on; do not seed demo accounts).
   - A test Resend key/sender, or leave the email provider unset to use demo OTP codes.
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` for a staging-only admin (12+ chars).
4. **Promotion flow:** merge to `staging` → auto-deploy → run the smoke tests below → fast-forward `main` → production deploys.

## Pre-production smoke test checklist

Run after every staging deploy (and as the restore-drill verification in `BACKUP.md`):

**Auth**
- [ ] Sign up (email OTP two-step): code arrives / demo code shows, account is created.
- [ ] Weak/common password is rejected at signup.
- [ ] Log in and log out.
- [ ] Forgot password: request a code, reset, and log in with the new password.
- [ ] Old session is invalidated after a password reset.

**Founder onboarding**
- [ ] Create a startup; it stays a non-public **draft** until a pitch video is added.
- [ ] Upload a pitch video (up to 100 MB, <= 12 minutes); over-limit/over-length is rejected.
- [ ] Add team members and profile links.

**Data room**
- [ ] Upload a private document (<= 25 MB).
- [ ] Investor requests access; founder approves; investor downloads.
- [ ] Revoke access; download is then refused.
- [ ] Confirm a private file is never reachable from `/uploads/...`.

**Messaging**
- [ ] Messaging is blocked until a connection is accepted.
- [ ] One-sided cap: a cold conversation stops the sender after the cap; replying lifts it.
- [ ] No raw `attachment_key` appears in any conversation response.

**Social / communities**
- [ ] Create, edit (shows "edited"), and delete a post — owner only.
- [ ] Propose a community; admin approves; withdraw a still-pending one.

**Investor / admin**
- [ ] New investor is unapproved and blocked from deal flow until an admin approves.
- [ ] Admin can verify, suspend, and view reports/client errors.
- [ ] Suspended/flagged users disappear from discovery and profiles.

**Persistence**
- [ ] Trigger a redeploy and confirm accounts, uploads, and messages survive.
