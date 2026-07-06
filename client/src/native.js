// Native (Capacitor) runtime — loaded ONLY on device via dynamic import in main.jsx,
// so none of this (or the Capacitor packages) ever lands in the web bundle.
//
// Responsibilities:
//   - restore the bearer session from device storage BEFORE React renders
//   - persist/clear tokens via the api.js session hooks
//   - status bar style follows the app theme; splash hides when the session probe resolves
//   - external links open in the system browser, not inside the WebView
//   - authenticated file downloads land in the OS share sheet
import { setAuthToken, session } from './api';
import { apiUrl, nativeBridge } from './config';

const TOKEN_KEY = 'auth_token';

export async function initNative() {
  const { Preferences } = await import('@capacitor/preferences');
  const { StatusBar, Style } = await import('@capacitor/status-bar');
  const { SplashScreen } = await import('@capacitor/splash-screen');
  const { Browser } = await import('@capacitor/browser');
  const { Share } = await import('@capacitor/share');
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Capacitor } = await import('@capacitor/core');

  // ---- Session restore + persistence ----
  let token = null;
  try { token = (await Preferences.get({ key: TOKEN_KEY })).value; } catch { /* first run */ }
  if (token) setAuthToken(token);
  session.onToken = (t) => {
    setAuthToken(t);
    token = t;
    Preferences.set({ key: TOKEN_KEY, value: t }).catch(() => {});
  };
  session.onExpired = () => {
    setAuthToken(null);
    token = null;
    Preferences.remove({ key: TOKEN_KEY }).catch(() => {});
  };

  // ---- Status bar follows the theme ----
  const setTheme = async (theme) => {
    try {
      // Style.Dark = light text (for our dark UI); Style.Light = dark text.
      await StatusBar.setStyle({ style: theme === 'light' ? Style.Light : Style.Dark });
      if (Capacitor.getPlatform() === 'android') {
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
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented) return;
    const href = a.getAttribute('href') || '';
    if (!/^https?:/i.test(a.href)) return; // mailto:, tel:, etc. → let the OS handle them
    const external = /^https?:\/\//i.test(href) || a.target === '_blank';
    const sameApp = a.href.startsWith(window.location.origin) && !/^https?:\/\//i.test(href);
    if (external && !sameApp) {
      e.preventDefault();
      Browser.open({ url: a.href }).catch(() => {});
    }
  }, true);

  // ---- Native share sheet ----
  nativeBridge.share = ({ title, url }) => Share.share({ title: title || 'Fundamental', url });

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
