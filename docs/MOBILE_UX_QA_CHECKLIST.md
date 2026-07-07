# Mobile UX QA Checklist (v1.6 native shell)

Run this on real devices before every store release. Target matrix:

| Device class | Example | Why |
|---|---|---|
| Standard iPhone | iPhone 13/14/15 | Primary iOS target, notch + home indicator |
| Small iPhone | iPhone SE | Cramped height, no notch |
| Medium Android | Pixel 6/7, Samsung A-series | Primary Android target |
| Tall Android | 20:9 flagship | Edge cases in chat height / sheets |

Test **dark and light themes** on every section below.

## Shell & navigation
- [ ] App opens on the login screen (not the marketing site), splash hides cleanly
- [ ] Compact header shows on every page: wordmark on root tabs, back + label on detail pages
- [ ] Header hides when scrolling down a feed, returns when scrolling up
- [ ] Bottom tabs: Discover, Network, Social, Messages (badge), Menu (your avatar)
- [ ] Active tab shows the gold indicator; tab taps give a light haptic
- [ ] Menu tab opens the menu screen: profile card, Dashboard, Market Pulse, Communities, Startup index, Pipeline (investor), Notifications (badge), theme toggle, Settings, Sign out
- [ ] No web hamburger or desktop link row anywhere
- [ ] Search icon opens the full-screen search overlay; results navigate and close it
- [ ] Android back: closes sheet/menu/search first → detail pages pop back → other tabs return to Discover → Discover backgrounds the app

## Keyboard (test EVERY form)
- [ ] Login / signup / OTP: focused field and the primary button stay visible above the keyboard
- [ ] Tapping outside any input dismisses the keyboard (auth, onboarding, search, comments, messages, settings)
- [ ] Tapping a button while the keyboard is open still triggers the button (no swallowed taps)
- [ ] Messages composer rides directly above the keyboard; sent message scrolls into view
- [ ] Bottom tab bar hides while the keyboard is open, returns when it closes
- [ ] No zoom-on-focus on iOS (inputs are 16px on touch screens)
- [ ] Onboarding: every step scrolls; Continue is reachable with the keyboard open

## Safe areas & bottom spacing
- [ ] No content hidden behind the bottom tab bar or home indicator on ANY page — scroll to the very bottom of: Discover, Startup detail, Profile, Social, Pulse, Communities, Network, Messages, Dashboard, Notifications, Watchlist, Settings (every tab), Onboarding, Legal
- [ ] Toasts appear above the tab bar, not behind it
- [ ] Status bar never overlaps the header (Android), notch respected (iOS)
- [ ] Modals/sheets: drag handle visible, sheet bottom padding clears the home indicator

## Sheets & forms
- [ ] Discover filters open as a bottom sheet; "Show N startups" applies and closes
- [ ] All dialogs (report, save search, reference startup, confirms) render as bottom sheets on the phone and cover the tab bar with a dimmed backdrop
- [ ] Settings tabs scroll horizontally without a visible scrollbar; every tab's Save button reachable
- [ ] Editing forms don't lose unsaved input when the keyboard dismisses

## Chat (Messages)
- [ ] Conversation list feels native: avatars, timestamps, unread badges, deal stage chips
- [ ] Opening a thread takes the FULL screen (no page title above it)
- [ ] Back arrow returns to the list; hardware back does the same
- [ ] Thread opens scrolled to the latest message instantly (no animated crawl)
- [ ] New incoming message auto-scrolls only when already near the bottom
- [ ] Attachments open via the share sheet; upload shows progress

## Feeds
- [ ] Pull-to-refresh works on Discover, Social, Notifications, Network, Messages — spinner + haptic at the threshold
- [ ] Skeletons (not spinners) during loads; images fade in; no layout jumps
- [ ] Like/upvote pops with a haptic; no double-fire on fast taps

## Native behavior
- [ ] External links open the system browser; fundamental.co.in links route in-app
- [ ] Deep link from another app opens the right screen (once env vars set)
- [ ] Backgrounding + returning refreshes badges/threads immediately
- [ ] Offline: cold start keeps you signed in with a "You're offline" banner; controls aren't blocked
- [ ] Session expiry lands on login WITHOUT a white reload flash
- [ ] Theme toggle updates the status bar color instantly

## Regressions to rule out
- [ ] Desktop web (fundamental.co.in on a laptop): full nav, dropdown search, centered modals — completely unchanged
- [ ] Mobile WEB (phone browser): still has the top nav + bottom tabs; Menu tab works
- [ ] `npm test` green; `npm run build` and `npm run build:mobile` clean
