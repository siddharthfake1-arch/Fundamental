// Environment truth for the client bundle.
//
// The same codebase ships two ways:
//   - Web: served by our own Express server, same origin → API_BASE is '' and every
//     relative URL keeps working exactly as before (this file is then a no-op).
//   - Native app (Capacitor): the WebView origin is capacitor://localhost (iOS) or
//     https://localhost (Android), so every API/media path must be absolute against
//     the production origin, injected at build time via VITE_API_BASE.
export const API_BASE = import.meta.env.VITE_API_BASE || '';

// The native bridge injects window.Capacitor before any page script runs, so this is
// safe at module-eval time and costs the web bundle zero Capacitor imports.
export const IS_NATIVE = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

// API endpoints: '/api/...' → absolute on native, unchanged on web.
export const apiUrl = (p) => (p && p.startsWith('/') ? API_BASE + p : p);

// Media/file paths from the API are relative ('/uploads/...'); absolute http(s),
// data: and blob: URLs (external logos, previews) pass through untouched.
export const absUrl = (u) => (!u || /^(https?:|data:|blob:)/i.test(u) ? u : API_BASE + u);

// Share links must always point at the public website — never the WebView origin.
export const shareOrigin = () => API_BASE || window.location.origin;

// Native capability hooks. All null on the web (call sites fall back to their
// existing browser behavior); native.js installs real implementations at boot:
//   openExternal(url)          — open a link in the system browser
//   downloadFile(url, name)    — fetch an authenticated file and hand it to the OS share sheet
//   share({ title, url })      — native share sheet (returns a promise)
export const nativeBridge = { openExternal: null, downloadFile: null, share: null };
