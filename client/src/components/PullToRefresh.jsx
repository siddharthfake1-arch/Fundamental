import { useRef, useState } from 'react';
import { IS_NATIVE, nativeBridge } from '../config';

// Native-only pull-to-refresh: drag down from the top of the page to re-run the
// page's load(). On the web it renders children untouched. Pure touch/CSS — no
// plugin, works with the window scroller that all list pages use.
const THRESHOLD = 72;

export default function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const startY = useRef(null);

  if (!IS_NATIVE) return children;

  const onTouchStart = (e) => {
    if (window.scrollY > 0 || busy) return;
    startY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e) => {
    if (startY.current == null || busy) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && window.scrollY === 0) setPull(Math.min(dy * 0.45, THRESHOLD * 1.5));
    else setPull(0);
  };
  const onTouchEnd = async () => {
    const triggered = pull >= THRESHOLD;
    startY.current = null;
    if (!triggered) { setPull(0); return; }
    setBusy(true);
    setPull(THRESHOLD * 0.75);
    nativeBridge.haptic?.('medium');
    try { await onRefresh?.(); } catch { /* page shows its own errors */ }
    setBusy(false);
    setPull(0);
  };

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div aria-hidden className="flex justify-center overflow-hidden transition-[height]"
        style={{ height: pull ? pull : 0, transition: startY.current ? 'none' : 'height 0.2s ease' }}>
        <div className={`w-6 h-6 mt-2 rounded-full border-2 border-ink-600 border-t-gold-400 ${busy ? 'animate-spin' : ''}`}
          style={{ transform: busy ? undefined : `rotate(${pull * 3}deg)`, opacity: Math.min(pull / THRESHOLD, 1) }} />
      </div>
      {children}
    </div>
  );
}
