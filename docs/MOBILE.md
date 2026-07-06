# Fundamental Mobile Apps (iOS + Android)

The mobile apps are the full web product wrapped with **Capacitor 7**: the React app
ships inside the binary and talks to the live API at `https://fundamental.co.in`.
Everything the website does, the apps do — same accounts, same data, no separate backend.

- Branch: `mobile-app` (native projects live in `client/android/` and `client/ios/`)
- App ID (both stores, permanent): `co.fundamental.app` · App name: **Fundamental**
- Build the app bundle: `cd client && npm run build:mobile` (injects the live API origin,
  then syncs both native projects)

## How it works (for future maintainers)

- **Auth**: the WebView can't use cross-origin cookies, so the apps use a bearer token.
  The server accepts `Authorization: Bearer` alongside the web cookie (`server/authmw.js`),
  answers CORS for the app origins `capacitor://localhost` / `https://localhost`
  (`server/security.js` → `appCors`), and returns the token in login/signup responses.
  The app stores it via Capacitor Preferences and restores it before first render
  (`client/src/native.js`, loaded only on device).
- **Media**: API-returned `/uploads/...` paths are made absolute by `absUrl()`
  (`client/src/config.js`) at every render point.
- **Native behavior**: status bar follows the theme, splash holds until the session
  probe resolves, Android hardware back navigates the SPA, external links open the
  system browser, authenticated downloads go through the OS share sheet.
- The **web build is untouched**: `VITE_API_BASE` is unset there, so all of this is inert.

## Rebuilding after app changes

Any change to `client/src` needs a new store release to reach the apps (the bundle
ships inside the binary — server/API changes reach existing installs immediately):

```
cd client
npm run build:mobile          # rebuild bundle + cap sync
# Android AAB (locally, with android/key.properties present):
cd android && ./gradlew bundleRelease
# iOS: run the ios-release workflow on Codemagic (see below)
```

Bump `versionCode`/`versionName` in `client/android/app/build.gradle` for each
Play release; iOS build numbers auto-increment in the Codemagic workflow.

## Signing (Android) — CRITICAL

- Keystore: `client/android/fundamental-upload.jks` (gitignored, never commit)
- Credentials: `client/android/key.properties` (gitignored)
- **Keep the .jks file and its password in a password manager.** Enroll in
  **Play App Signing** during the first Play Console upload so Google holds the
  final signing key and a lost upload key can be reset.

## Release pipelines

- **Requirements for local Android builds**: JDK 21 (`JAVA_HOME` set) + Android SDK 35
  (`ANDROID_HOME` set). On Windows, `npm run build:mobile` works out of the box
  (cross-env); use `gradlew.bat` inside `client/android`. Without a local JDK,
  build through CI instead.
- **Android locally**: any machine meeting the above
  (`gradle bundleRelease`).
- **Android CI**: `.github/workflows/android-release.yml` (GitHub Actions, manual
  trigger, needs the four `KEYSTORE_*` secrets) — or the `android-release` workflow
  in `codemagic.yaml`.
- **iOS (no Mac needed)**: `codemagic.yaml` → `ios-release` workflow builds a signed
  IPA and uploads to TestFlight. One-time setup: connect the repo at codemagic.io,
  add an App Store Connect API key under Code signing identities (name it
  `fundamental-asc-key`), create the app record in App Store Connect.

## Store checklist (owner actions)

**Google Play (~$25 one-time)**
1. Create a Play Console developer account (play.google.com/console).
2. Create app → upload `app-release.aab` → enroll Play App Signing.
3. Listing assets are in `client/store-assets/`: 512px icon, 1024×500 feature graphic.
   Take 4–8 phone screenshots of the app (Discover, a startup page with the pitch
   video, Messages, Dashboard).
4. Data safety form: collects name, email, phone (optional), photos/videos, messages;
   encrypted in transit; users can delete data in-app (Settings → Delete account).
5. **Policy note**: personal accounts must run a closed test (12+ testers, 14 days)
   before production access. Start recruiting testers early, or register as an
   organization (needs a D-U-N-S number) to skip this.

**Apple App Store ($99/year)**
1. Enroll at developer.apple.com (individual is fastest).
2. App Store Connect → create the app (bundle ID `co.fundamental.app`, iPhone).
3. Sign up at codemagic.io (free tier: 500 macOS minutes/month), connect the repo,
   add the App Store Connect API key, run `ios-release` → build lands in TestFlight.
4. Test on your own iPhone via TestFlight, then submit for review.
5. Review needs: a **working demo account** (create a real approved-investor account
   on production and put the credentials in App Review notes), 6.7" screenshots
   (1290×2796), privacy policy URL `https://fundamental.co.in/legal/privacy`.
   Account deletion is already built in — mention it in the notes.

## Drafted store listing copy

**Short description (Google, ≤80 chars)**
> The serious fundraising network. Video pitches, data rooms, real investors.

**Subtitle (Apple, ≤30 chars)**
> Fundraising, done seriously.

**Full description (both stores)**
> Fundamental is where founders raise and investors discover — a serious
> fundraising marketplace built around the 12-minute video pitch.
>
> FOR FOUNDERS
> • Publish your startup with a structured profile, metrics, and a video pitch
> • Share a public pitch link anywhere
> • Run a private data room with per-document access control
> • Message investors, track connection requests, and post updates
>
> FOR INVESTORS
> • Browse vetted startups by sector, stage, and geography
> • Watch pitches, request data-room access, and keep private notes
> • Build a pipeline with your watchlist and deal stages
> • Follow founders, join communities, and track market pulse
>
> Real accounts, verified investors, moderated content. Your data stays private —
> no third-party tracking.
>
> Fundamental is a professional network; nothing in the app is investment advice.

**Category**: Business (or Finance) · **Content rating**: 17+/18+ (unmoderated
user content + financial topics answered honestly in the questionnaire)

## Versioning & QA

- Current app version: **1.2 (versionCode 3)**. Bump BOTH values in
  `client/android/app/build.gradle` before every Play upload — versionCode must
  strictly increase. iOS build numbers auto-increment in Codemagic.
- Token storage uses Capacitor Preferences — fine for beta (sandboxed per-app,
  `allowBackup=false`); consider a Keychain/Keystore-backed secure-storage plugin
  before large-scale production.
- Before ANY store submission or mobile→production merge, complete
  `docs/MOBILE_QA_CHECKLIST.md` on a real device.

## Known limitations (v1)

- No push notifications yet — the app polls in-app notifications every 20s like the
  web. Fast-follow: FCM/APNs via `@capacitor/push-notifications` + server work.
- Deep links are fully wired in the apps (Android App Links intent filter + iOS
  Associated Domains + in-app routing). To activate them, set two env vars on the
  server: `ANDROID_CERT_SHA256` (Play Console → App integrity → App signing key
  certificate SHA-256) and `APPLE_TEAM_ID` (Apple Developer Team ID). The server
  then serves `/.well-known/assetlinks.json` and
  `/.well-known/apple-app-site-association`, and links open the app.
- Keep the app open while a pitch video uploads (uploads pause if iOS backgrounds
  the app; the 10-minute upload timeout already guards against hangs).
