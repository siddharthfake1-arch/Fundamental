import { useEffect, useState } from 'react';

// Slim global banner shown while the device has no connectivity, so failed loads
// read as "offline" instead of empty pages. Uses the browser online/offline events,
// which fire inside the Capacitor WebView too.
export default function OfflineBanner() {
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="fixed top-0 inset-x-0 z-[70] safe-top bg-amber-500 text-black text-center text-xs font-semibold py-1.5">
      You&rsquo;re offline — some things won&rsquo;t load until you reconnect.
    </div>
  );
}
