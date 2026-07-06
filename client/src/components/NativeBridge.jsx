import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Router-coupled native behavior. Lazily rendered (only on device) inside
// BrowserRouter, so useNavigate/useLocation are available. Renders nothing.
//
// - Android hardware back: navigate back through the SPA history; on a root
//   screen, background the app instead of dead-ending.
// - appUrlOpen: deep links (https://fundamental.co.in/...) route in-app once
//   universal/app links are configured in the store consoles (fast-follow).
export default function NativeBridge() {
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    let sub, urlSub, cancelled = false;
    (async () => {
      const { App } = await import('@capacitor/app');
      if (cancelled) return;
      sub = await App.addListener('backButton', ({ canGoBack }) => {
        const roots = ['/', '/discover', '/login'];
        if (roots.includes(window.location.pathname) || !canGoBack) App.minimizeApp();
        else window.history.back();
      });
      urlSub = await App.addListener('appUrlOpen', ({ url }) => {
        try {
          const u = new URL(url);
          if (u.pathname && u.pathname !== '/') nav(u.pathname + u.search);
        } catch { /* not a routable URL */ }
      });
    })();
    return () => { cancelled = true; sub?.remove(); urlSub?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Surface native download failures through the app's own toast styling-free path:
  // keep it simple — an alert is honest and rare (download errors only).
  useEffect(() => {
    const onErr = (e) => { try { window.alert(e.detail || 'Download failed'); } catch { /* ignore */ } };
    window.addEventListener('native-download-error', onErr);
    return () => window.removeEventListener('native-download-error', onErr);
  }, []);

  useEffect(() => { /* keep location observed so back-button state stays fresh */ }, [loc]);

  return null;
}
