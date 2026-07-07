// Native (Capacitor) runtime — loaded ONLY on device via dynamic import in main.jsx,
// so none of this (or the Capacitor packages) ever lands in the web bundle.
//
// Responsibilities:
//   - restore the bearer session (and cached user) from device storage BEFORE React renders
//   - persist/clear tokens via the api.js session hooks
//   - status bar style follows the app theme; splash hides when the session probe resolves
//   - external links open in the system browser, not inside the WebView
//   - authenticated file downloads land in the OS share sheet
//   - haptic feedback hook for taps that deserve it
import { setAuthToken, session } from './api';
import { API_BASE, apiUrl, nativeBridge } from './config';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'cached_user';

export async function initNative() {
  const { Preferences } = await import('@capacitor/preferences');
  const { StatusBar, Style } = await import('@capacitor/status-bar');
  const { SplashScreen } = await import('@capacitor/splash-screen');
  const { Browser } = await import('@capacitor/browser');
  const { Share } = await import('@capacitor/share');
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
  const { Keyboard } = await import('@capacitor/keyboard');
  const { Capacitor } = await import('@capacitor/core');
  const isAndroid = Capacitor.getPlatform() === 'android';

  // ---- Keyboard awareness ----
  // body.kb-open lets CSS react (hide the bottom tab bar, tighten the chat
  // height); --keyboard-height is exposed for any layout that needs the exact
  // number. The WebView itself resizes (config resize:'native'), so most
  // layouts need no work — these hooks handle the chrome.
  // addListener returns a promise — swallow the rejection where the plugin is
  // unavailable (web preview, some iPad configurations).
  Promise.resolve(Keyboard.addListener('keyboardWillShow', (info) => {
    document.body.classList.add('kb-open');
    document.documentElement.style.setProperty('--keyboard-height', `${info?.keyboardHeight || 0}px`);
    // Keep the focused field visible once the viewport settles.
    setTimeout(() => {
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 120);
  })).catch(() => {});
  Promise.resolve(Keyboard.addListener('keyboardWillHide', () => {
    document.body.classList.remove('kb-open');
    document.documentElement.style.setProperty('--keyboard-height', '0px');
  })).catch(() => {});

  // Tap anywhere that isn't a form control or button → dismiss the keyboard
  // (the native-app gesture users expect). Buttons/links are excluded so the
  // blur never eats their tap, and taps inside a focused field keep focus.
  document.addEventListener('touchend', (e) => {
    const el = document.activeElement;
    if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
    const t = e.target;
    if (el.contains(t)) return; // tapping the field itself
    if (t.closest && t.closest('input, textarea, select, button, a, label, [contenteditable]')) return;
    el.blur();
  }, { passive: true });

  // ---- Session restore + persistence ----
  let token = null;
  let cachedUser = null;
  try {
    token = (await Preferences.get({ key: TOKEN_KEY })).value;
    const cu = (await Preferences.get({ key: USER_KEY })).value;
    if (cu) cachedUser = JSON.parse(cu);
  } catch { /* first run */ }
  if (token) setAuthToken(token);
  session.onToken = (t) => {
    setAuthToken(t);
    token = t;
    Preferences.set({ key: TOKEN_KEY, value: t }).catch(() => {});
  };
  session.onExpired = () => {
    setAuthToken(null);
    token = null;
    cachedUser = null;
    Preferences.remove({ key: TOKEN_KEY }).catch(() => {});
    Preferences.remove({ key: USER_KEY }).catch(() => {});
  };
  // Offline cold starts: AuthContext falls back to this when the session probe
  // fails with a NETWORK error (never for a real 401 — onExpired clears it).
  session.onUser = (user) => {
    cachedUser = user;
    Preferences.set({ key: USER_KEY, value: JSON.stringify(user) }).catch(() => {});
  };
  session.getCachedUser = () => (token ? cachedUser : null);

  // ---- Status bar follows the theme ----
  // Android: the WebView does NOT overlay the status bar (config overlaysWebView:false
  // + edge-to-edge opt-out in styles.xml), so we just tint it. iOS: overlays, with
  // safe-area padding handled by the .safe-top CSS.
  const setTheme = async (theme) => {
    try {
      // Style.Dark = light text (for our dark UI); Style.Light = dark text.
      await StatusBar.setStyle({ style: theme === 'light' ? Style.Light : Style.Dark });
      if (isAndroid) {
        await StatusBar.setBackgroundColor({ color: theme === 'light' ? '#f8fafc' : '#04091a' });
      }
    } catch { /* status bar unavailable (e.g. iPad multitasking) */ }
  };
  window.__setNativeTheme = setTheme;
  setTheme(document.documentElement.classList.contains('light') ? 'light' : 'dark');

  // ---- Splash: App.jsx hides it once the auth probe resolves ----
  window.__hideSplash = () => SplashScreen.hide().catch(() => {});
  // Backstop: never leave the splash stuck if the app fails before React mounts.
  setTimeout(() => SplashScreen.hide().catch(() => {}), 8000);

  // ---- External links → system browser ----
  // Capture-phase interceptor covers every <a target="_blank"> and external href in
  // the app (LinkedIn profiles, legal docs, user links, /uploads attachments) without
  // touching each page. Internal SPA links are untouched.
  nativeBridge.openExternal = (url) => Browser.open({ url }).catch(() => {});
  let siteHost = '';
  try { siteHost = new URL(API_BASE).host; } catch { /* no base configured */ }
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented) return;
    const href = a.getAttribute('href') || '';
    if (!/^https?:/i.test(a.href)) return; // mailto:, tel:, etc. → let the OS handle them
    const external = /^https?:\/\//i.test(href) || a.target === '_blank';
    const sameApp = a.href.startsWith(window.location.origin) && !/^https?:\/\//i.test(href);
    if (!external || sameApp) return;
    e.preventDefault();
    // Absolute links to our OWN site (share links, notification links) are app
    // content — route them inside the SPA instead of bouncing to the browser.
    // /uploads and /api paths stay external (raw files, not routable pages).
    try {
      const u = new URL(a.href);
      if (siteHost && u.host === siteHost && !/^\/(uploads|api)\//.test(u.pathname)) {
        window.dispatchEvent(new CustomEvent('app-navigate', { detail: u.pathname + u.search }));
        return;
      }
    } catch { /* malformed URL → treat as external */ }
    Browser.open({ url: a.href }).catch(() => {});
  }, true);

  // ---- Native share sheet ----
  nativeBridge.share = ({ title, url }) => Share.share({ title: title || 'Fundamental', url });

  // ---- Haptics (fire-and-forget; never block or throw into callers) ----
  nativeBridge.haptic = (style = 'light') => {
    const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
    Haptics.impact({ style: map[style] || ImpactStyle.Light }).catch(() => {});
  };

  // ---- Authenticated downloads → share sheet (open / save / AirDrop) ----
  nativeBridge.downloadFile = async (url, name) => {
    const safe = String(name || 'document').replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'document';
    try {
      const res = await Filesystem.downloadFile({
        url: apiUrl(url),
        path: safe,
        directory: Directory.Cache,
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      });
      const fileUrl = res.path && res.path.startsWith('file://') ? res.path : (await Filesystem.getUri({ path: safe, directory: Directory.Cache })).uri;
      await Share.share({ url: fileUrl });
    } catch (err) {
      if (!/cancel/i.test(String(err && err.message))) {
        window.dispatchEvent(new CustomEvent('native-download-error', { detail: String((err && err.message) || 'Download failed') }));
      }
    }
  };
}
