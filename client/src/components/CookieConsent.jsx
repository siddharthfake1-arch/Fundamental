import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IS_NATIVE } from '../config';

// Minimal, accessible cookie/consent disclosure. The session cookie is essential
// (no third-party tracking), so this is a disclosure + acknowledgement.
export default function CookieConsent() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('cookie_ack') === '1'; } catch { return false; }
  });
  // The native app doesn't use cookies at all (bearer token in device storage).
  if (IS_NATIVE || dismissed) return null;
  const ack = () => { try { localStorage.setItem('cookie_ack', '1'); } catch { /* ignore */ } setDismissed(true); };
  return (
    <div role="region" aria-label="Cookie notice"
      className="fixed bottom-20 lg:bottom-4 inset-x-3 z-[60] md:left-auto md:right-4 md:max-w-sm card p-4 shadow-lift safe-bottom">
      <p className="text-xs text-mist-300 leading-relaxed">
        Fundamental uses an essential session cookie to keep you signed in. We don't use
        third-party tracking cookies. See our <Link to="/legal/privacy" className="text-gold-300 hover:text-gold-200">Privacy Policy</Link>.
      </p>
      <div className="flex justify-end mt-3">
        <button className="btn-primary btn-sm" onClick={ack}>Got it</button>
      </div>
    </div>
  );
}
