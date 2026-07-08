import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { NATIVE_PLATFORM } from '../config';

// iOS-only interactive edge-swipe-back. The Capacitor WebView doesn't provide the
// native edge-pan for SPA history, so we synthesize it: a touch that STARTS within
// EDGE px of the left edge and drags right slides the screen and pops history on
// release. Arming only in the left gutter is what keeps it clear of horizontal
// carousels, tab strips, and sliders (their drags never begin at x≈0). Vertical
// scrolling is untouched — we only claim the gesture once it's decided horizontal.
const EDGE = 24;
const NO_BACK = new Set(['/', '/login', '/discover']); // roots: nothing to pop

export default function EdgeSwipeBack() {
  const nav = useNavigate();
  useEffect(() => {
    if (NATIVE_PLATFORM !== 'ios') return; // iOS-only; inert on Android + web
    const body = document.body;
    let active = false, startX = 0, startY = 0, dx = 0, decided = false, horizontal = false;

    const clearTransform = () => { body.style.transition = ''; body.style.transform = ''; body.style.willChange = ''; };
    const springBack = () => {
      body.style.transition = 'transform .22s cubic-bezier(0.22,1,0.36,1)';
      body.style.transform = '';
      setTimeout(clearTransform, 240);
    };

    const onStart = (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX > EDGE) return;
      if (window.history.length <= 1 || NO_BACK.has(window.location.pathname)) return;
      active = true; decided = false; horizontal = false; dx = 0;
      startX = t.clientX; startY = t.clientY;
    };
    const onMove = (e) => {
      if (!active) return;
      const t = e.touches[0];
      dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        horizontal = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.3;
        decided = true;
        if (!horizontal) { active = false; return; } // it was a vertical scroll
        body.style.willChange = 'transform';
      }
      if (horizontal) {
        e.preventDefault(); // claim the gesture from the scroller
        body.style.transition = '';
        body.style.transform = `translateX(${Math.max(0, dx) * 0.92}px)`;
      }
    };
    const onEnd = () => {
      if (!active || !horizontal) { active = false; return; }
      const commit = dx > window.innerWidth * 0.32 || dx > 120;
      active = false; decided = false; horizontal = false;
      if (commit) {
        body.style.transition = 'transform .17s ease-out';
        body.style.transform = `translateX(${window.innerWidth}px)`;
        setTimeout(() => { clearTransform(); nav(-1); }, 165);
      } else {
        springBack();
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      clearTransform();
    };
  }, [nav]);
  return null;
}
