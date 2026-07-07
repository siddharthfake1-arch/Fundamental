import { useRef, useState, useCallback } from 'react';
import { IS_NATIVE } from '../config';

const THRESHOLD = 70; // px drag needed to trigger

export default function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0);   // 0–THRESHOLD px translated
  const [spin, setSpin] = useState(false);
  const startY = useRef(null);
  const pulling = useRef(false);
  const containerRef = useRef();

  const onTouchStart = useCallback((e) => {
    const el = containerRef.current;
    if (!el) return;
    // Only start a pull when the scroll container is at the top.
    if (el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!pulling.current || startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) { pulling.current = false; return; }
    // Rubber-band resistance: full drag at 1:1 initially, slowing above threshold.
    const clamped = Math.min(dy * 0.5, THRESHOLD);
    setPull(clamped);
    if (clamped > 10) e.preventDefault(); // prevent page scroll while pulling
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    startY.current = null;
    if (pull >= THRESHOLD) {
      setSpin(true); setPull(0);
      try { await onRefresh?.(); } finally { setSpin(false); }
    } else {
      setPull(0);
    }
  }, [pull, onRefresh]);

  if (!IS_NATIVE) return children;

  return (
    <div ref={containerRef} style={{ overflowY: 'auto', height: '100%' }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div style={{ transform: `translateY(${spin ? 36 : pull}px)`, transition: pulling.current ? 'none' : 'transform 0.25s ease' }}>
        {(pull > 0 || spin) && (
          <div className="flex justify-center absolute left-0 right-0 -top-9">
            <div className={`w-7 h-7 rounded-full border-2 border-ink-600 border-t-gold-400 ${spin ? 'animate-spin' : ''}`}
              style={{ opacity: pull / THRESHOLD }} />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
