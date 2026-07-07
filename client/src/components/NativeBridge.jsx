import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from './ui';

// Router-coupled native behavior. Lazily rendered (only on device) inside
// BrowserRouter + ToastProvider, so useNavigate/useToast are available. Renders nothing.
//
// - Android hardware back: an open overlay (modal/menu) consumes it first via the
//   cancellable 'app-back' event; otherwise navigate back, or background the app
//   on a root screen instead of dead-ending.
// - appUrlOpen: deep links (https://fundamental.co.in/...) route in-app.
// - appStateChange: returning to the foreground refreshes badges and page polls.
// - session-expired: in-app transition to /login (no full WebView reload).
// - native-download-error: surfaced through the app's own toast system.
export default function NativeBridge() {
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();

  useEffect(() => {
    let backSub, urlSub, stateSub, cancelled = false;
    (async () => {
      const { App } = await import('@capacitor/app');
      if (cancelled) return;
      backSub = await App.addListener('backButton', ({ canGoBack }) => {
        // Give open overlays (modals, menus, search) first right of refusal.
        const ev = new CustomEvent('app-back', { cancelable: true });
        window.dispatchEvent(ev);
        if (ev.defaultPrevented) return;
        const path = window.location.pathname;
        // Home roots background the app; other bottom tabs step back to Discover
        // first (standard Android tab behavior), everything else pops history.
        const homeRoots = ['/', '/discover', '/login'];
        const tabRoots = ['/network', '/social', '/messages', '/menu'];
        if (homeRoots.includes(path)) return App.minimizeApp();
        if (tabRoots.includes(path) && !window.location.search) return nav('/discover');
        if (!canGoBack) return App.minimizeApp();
        window.history.back();
      });
      urlSub = await App.addListener('appUrlOpen', ({ url }) => {
        try {
          const u = new URL(url);
          if (u.pathname && u.pathname !== '/') nav(u.pathname + u.search);
        } catch { /* not a routable URL */ }
      });
      stateSub = await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          // Wake the pollers immediately — badges/threads must not stay stale
          // for up to a full poll interval after returning to the app.
          window.dispatchEvent(new Event('badge-refresh'));
          window.dispatchEvent(new Event('app-resumed'));
        }
      });
    })();
    return () => { cancelled = true; backSub?.remove(); urlSub?.remove(); stateSub?.remove(); };
  }, []);

  // Session expiry (from api.js): an in-app route change, not a WebView reload.
  useEffect(() => {
    const onExpired = () => nav('/login');
    window.addEventListener('session-expired', onExpired);
    return () => window.removeEventListener('session-expired', onExpired);
  }, []);

  // Absolute links to our own site (from native.js's interceptor) route in-app.
  useEffect(() => {
    const onNavigate = (e) => { if (e.detail) nav(e.detail); };
    window.addEventListener('app-navigate', onNavigate);
    return () => window.removeEventListener('app-navigate', onNavigate);
  }, []);

  // Download failures surface as a normal error toast.
  useEffect(() => {
    const onErr = (e) => toast(e.detail || 'Download failed', 'error');
    window.addEventListener('native-download-error', onErr);
    return () => window.removeEventListener('native-download-error', onErr);
  }, []);

  useEffect(() => { /* keep location observed so back-button state stays fresh */ }, [loc]);

  return null;
}
