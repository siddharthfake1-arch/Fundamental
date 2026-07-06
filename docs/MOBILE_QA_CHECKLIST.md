# Mobile QA Checklist

Run this full pass on a real device (Android APK sideload, iOS TestFlight) against
production before every store submission. Check each item on BOTH platforms.

## Auth & session
- [ ] Signup with email OTP (code arrives, verify works)
- [ ] Resend OTP
- [ ] Login / logout
- [ ] Forgot password (request code → reset → sign in with new password)
- [ ] Token persists across app restart (kill the app, reopen → still signed in)
- [ ] Logout clears the session (restart → login screen)
- [ ] Expired/invalid token returns to login without a crash loop
- [ ] Offline cold start shows the signed-in shell + offline banner (not a logout)

## Onboarding & profiles
- [ ] Founder onboarding end-to-end (profile, startup, logo, video, data room)
- [ ] Investor onboarding end-to-end
- [ ] Edit personal profile (photo, cover, links)
- [ ] Edit startup profile (metrics, team, raise status)

## Content
- [ ] Create / edit / delete own social post (text, image, video)
- [ ] Create / edit / delete own community discussion + reply
- [ ] Report + block flows work
- [ ] Upload profile image / startup logo (photo library AND camera)
- [ ] Upload pitch video (large file — try ≥50 MB on Wi-Fi and mobile data)
- [ ] Background the app mid-upload → clear failure message, retry works
- [ ] Upload / download data-room file (download opens the share sheet)
- [ ] Message: send text, send attachment, download counterpart's attachment
- [ ] Data export (Settings → Privacy) opens the share sheet with a JSON file
- [ ] Account delete (typed DELETE confirmation) signs out and removes data

## Feeds & discovery
- [ ] Discover: filters, sort, load more, pull-to-refresh
- [ ] Search (nav bar): startups, people, communities; keyboard nav
- [ ] Social feed, Pulse, Network, Communities, Watchlist load + pull-to-refresh
- [ ] Notifications list, mark-as-read, badge updates
- [ ] Returning to the app after minutes refreshes badges immediately

## Native behavior
- [ ] Android hardware back: closes open modal/menu first, then navigates,
      then minimizes on a root screen (never exits abruptly)
- [ ] Status bar: readable in dark AND light theme; header never under the clock
- [ ] Notch / home-indicator: no content clipped (check Landing, Auth, Messages)
- [ ] Keyboard: Messages composer stays visible while typing
- [ ] External links (LinkedIn, user websites) open the system browser
- [ ] Internal fundamental.co.in links (e.g. a shared /s/... link in a message)
      navigate INSIDE the app
- [ ] Share buttons open the native share sheet
- [ ] Haptics fire on like/save/send/connect
- [ ] Deep links: with the app installed and .well-known files live, tapping
      https://fundamental.co.in/s/... in an email opens the app (requires
      ANDROID_CERT_SHA256 / APPLE_TEAM_ID set on the server — see MOBILE.md)
- [ ] Video pitch plays inline, fullscreen works, chapters seek
- [ ] Theme toggle: no flash of wrong theme on relaunch

## Legal & store compliance
- [ ] /legal/terms, /legal/privacy, /legal/disclosures render in-app
- [ ] Cookie banner does NOT appear in the native app
- [ ] Account deletion reachable in ≤3 taps from Settings (store requirement)

## Regression guardrails (run before merging mobile → production)
- [ ] `npm test` green at repo root (unit + encoding + route tests)
- [ ] `cd client && npm run build` (web bundle, no VITE_API_BASE)
- [ ] `cd client && npm run build:mobile` (works on Windows via cross-env)
- [ ] `cd client/android && gradlew assembleDebug` + `gradlew bundleRelease`
- [ ] Codemagic `ios-release` workflow green (archive + TestFlight upload)
