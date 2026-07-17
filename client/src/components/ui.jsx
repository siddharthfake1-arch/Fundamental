import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../api';
import { absUrl, IS_NATIVE } from '../config';

export function Avatar({ src, name, size = 10, square = false }) {
  const px = size * 4;
  const cls = `${square ? 'rounded-xl' : 'rounded-full'} object-cover bg-ink-700 border border-ink-600/60 shrink-0`;
  if (src) {
    return <img src={absUrl(src)} alt={name} loading="lazy" style={{ width: px, height: px }}
      className={`${cls} img-fade`} onLoad={(e) => e.currentTarget.classList.add('loaded')}
      onError={(e) => e.currentTarget.classList.add('loaded')} />;
  }
  return (
    <div style={{ width: px, height: px, fontSize: px * 0.38 }}
      className={`${cls} flex items-center justify-center font-display font-bold text-mist-300`}>
      {(name || '?').split(' ').map(w => w[0]).slice(0, 2).join('')}
    </div>
  );
}

const TIERS = {
  1: { bg: 'bg-accent-500', label: 'Verified' },
  2: { bg: 'bg-gold-500', label: 'Enhanced — identity and metrics reviewed' },
  3: { bg: 'bg-violet-500', label: 'Institutional — vetted to institutional standard' },
};
export const VerifiedBadge = ({ small, tier = 1 }) => {
  const t = TIERS[Math.min(3, Math.max(1, Number(tier) || 1))];
  return (
    <span title={t.label} role="img" aria-label={t.label} className={`inline-flex items-center justify-center rounded-full ${t.bg} text-white shrink-0 ${small ? 'w-3.5 h-3.5' : 'w-[18px] h-[18px]'}`}>
      <svg viewBox="0 0 24 24" fill="none" className={small ? 'w-2.5 h-2.5' : 'w-3 h-3'}><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </span>
  );
};

// Tiny inline trend chart for cards — visual storytelling at a glance
export function Sparkline({ data, w = 110, h = 30 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const x = (i) => (i / (data.length - 1)) * (w - 4) + 2;
  const y = (v) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  const pts = data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const up = data[data.length - 1] >= data[0];
  const color = up ? '#34d399' : '#f87171';
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline points={`${pts} ${w - 2},${h - 1} 2,${h - 1}`} fill={color} opacity="0.10" stroke="none" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// LinkedIn-style cover hero with gradient overlay and gentle parallax
export function CoverHero({ cover, fallbackKey = '', height = 'h-44 sm:h-56', children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const yy = Math.min(160, window.scrollY);
        el.style.transform = `translateY(${yy * 0.28}px) scale(1.06)`;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, []);
  const hue = [...String(fallbackKey)].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div className="card overflow-hidden !rounded-2xl">
      <div className={`relative ${height} overflow-hidden`}>
        {cover ? (
          <img ref={ref} src={absUrl(cover)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} className="absolute inset-0 w-full h-full object-cover will-change-transform" style={{ transform: 'scale(1.06)' }} />
        ) : (
          <div ref={ref} className="absolute inset-0 will-change-transform" style={{ transform: 'scale(1.06)', background: `linear-gradient(120deg, hsl(${hue} 55% 24%), hsl(${(hue + 50) % 360} 65% 40%))` }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgb(var(--ink-900)) 2%, rgb(var(--ink-900) / 0.45) 35%, transparent 70%)' }} />
      </div>
      <div className="px-5 sm:px-6 pb-5 sm:pb-6">{children}</div>
    </div>
  );
}

// Content-shaped loading placeholders. A page that knows its final layout should
// show its silhouette (no jump when data lands), not a centered spinner.
export const Skeleton = ({ className = '' }) => <div className={`skeleton rounded-lg ${className}`} aria-hidden />;

export const SkeletonCard = () => (
  <div className="card p-5 space-y-3.5" aria-hidden>
    <div className="flex items-start gap-3.5">
      <Skeleton className="w-12 h-12 !rounded-xl" />
      <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
    </div>
    <Skeleton className="h-3 w-full" />
    <Skeleton className="h-3 w-5/6" />
    <div className="flex gap-2 pt-1"><Skeleton className="h-6 w-16 !rounded-full" /><Skeleton className="h-6 w-20 !rounded-full" /></div>
  </div>
);

export const SkeletonPost = () => (
  <div className="card p-5 space-y-3" aria-hidden>
    <div className="flex items-center gap-3">
      <Skeleton className="w-10 h-10 !rounded-full" />
      <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-24" /></div>
    </div>
    <Skeleton className="h-3.5 w-full" />
    <Skeleton className="h-3.5 w-4/5" />
  </div>
);

export const SkeletonRow = () => (
  <div className="card px-4 py-3.5 flex items-center gap-3" aria-hidden>
    <Skeleton className="w-10 h-10 !rounded-full shrink-0" />
    <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-3/5" /><Skeleton className="h-3 w-2/5" /></div>
  </div>
);

export const SkeletonList = ({ n = 4, kind = 'row' }) => {
  const K = kind === 'card' ? SkeletonCard : kind === 'post' ? SkeletonPost : SkeletonRow;
  return <div className={kind === 'card' ? 'grid sm:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-3'}>{Array.from({ length: n }, (_, i) => <K key={i} />)}</div>;
};

export const Spinner = ({ className = '' }) => (
  <div role="status" aria-label="Loading" className={`flex justify-center py-12 ${className}`}>
    <div className="w-7 h-7 rounded-full border-2 border-ink-600 border-t-gold-400 animate-spin" />
  </div>
);

// `action` renders below the copy — a retry button on error states, a CTA on
// genuinely empty ones — so dead ends always offer a way forward.
export const Empty = ({ icon = '◇', title, sub, action }) => (
  <div className="card p-10 text-center fade-in">
    <div className="text-3xl mb-3 text-mist-500" aria-hidden>{icon}</div>
    <div className="h-display text-base">{title}</div>
    {sub && <div className="text-sm text-mist-400 mt-1.5 max-w-sm mx-auto">{sub}</div>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export function Modal({ open, onClose, title, children, wide }) {
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Tab' && panelRef.current) {
        // Focus trap: keep Tab within the dialog.
        const els = panelRef.current.querySelectorAll('a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])');
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    // Native: the Android back button dismisses the dialog instead of navigating.
    const onBack = (e) => { e.preventDefault(); onClose(); };
    window.addEventListener('app-back', onBack);
    document.body.style.overflow = 'hidden';
    // Move focus into the dialog.
    setTimeout(() => panelRef.current?.querySelector('button,a,input,textarea,select')?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('app-back', onBack);
      document.body.style.overflow = '';
      if (prevFocus && prevFocus.focus) prevFocus.focus(); // return focus to trigger
    };
  }, [open, onClose]);
  // Portal to <body>: pages render inside a transformed motion.main, and a CSS
  // transform turns "fixed" into "fixed relative to the page" — the dialog would
  // sit under the bottom tab bar and mis-position on scroll. The portal escapes
  // that containing block so the sheet always covers the real viewport.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/70 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div
            ref={panelRef} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dialog'}
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className={`card w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[85dvh] sm:max-h-[90vh] overflow-y-auto p-6 !pt-0 rounded-b-none sm:rounded-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]`}
            style={{ overscrollBehavior: 'contain' }}>
            <div className="sheet-handle sm:!hidden" aria-hidden />
            <div className="flex items-center justify-between mb-4 sticky top-0 z-10 bg-inherit pt-6 pb-1 -mx-1 px-1">
              <h3 className="h-display text-lg">{title}</h3>
              <button onClick={onClose} aria-label="Close dialog" className="text-mist-400 hover:text-mist-100 text-xl leading-none px-1">×</button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// ---- Lightbox (full-screen image viewer) ----
// WhatsApp-style: tap a chat image to view it full screen on a dimmed backdrop.
// Escape, the Android back button, or a backdrop tap dismisses it.
export function Lightbox({ src, alt = '', onClose, onDownload }) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onBack = (e) => { e.preventDefault(); onClose(); };
    document.addEventListener('keydown', onKey);
    window.addEventListener('app-back', onBack);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('app-back', onBack);
      document.body.style.overflow = '';
    };
  }, [src, onClose]);
  return createPortal(
    <AnimatePresence>
      {src && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[70] bg-black/92 backdrop-blur-sm flex items-center justify-center p-3 sm:p-8"
          role="dialog" aria-modal="true" aria-label={alt || 'Image viewer'}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.img src={src} alt={alt}
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="max-h-full max-w-full object-contain rounded-lg select-none shadow-lift" draggable={false} />
          <div className="absolute top-0 inset-x-0 safe-top flex items-center justify-end gap-1 p-3">
            {onDownload && (
              <button onClick={onDownload} aria-label="Download image"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-black/50 text-white/90 hover:bg-black/70 hover:text-white transition-colors text-sm font-semibold px-3.5">
                ↓ Save
              </button>
            )}
            <button onClick={onClose} aria-label="Close image viewer"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-black/50 text-white/90 hover:bg-black/70 hover:text-white transition-colors text-xl leading-none">
              ×
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// ---- Toast system ----
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, kind = 'info') => {
    const id = Math.random();
    setToasts(t => [...t, { id, msg, kind }]);
    // Errors carry instructions the user may need to act on — give them longer.
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), kind === 'error' ? 6500 : 4200);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {/* F-026: announce toasts to assistive tech (errors assertively, rest politely). */}
      {/* bottom-20 on phones so toasts float above the bottom tab bar */}
      <div aria-live="polite" aria-atomic="true" className="fixed bottom-20 lg:bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[92%] max-w-md pointer-events-none safe-bottom">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm font-medium shadow-lift backdrop-blur
              ${t.kind === 'error' ? 'bg-red-950/90 border-red-800/60 text-red-200' : t.kind === 'success' ? 'bg-emerald-950/90 border-emerald-800/60 text-emerald-200' : 'bg-ink-800/95 border-ink-600 text-mist-200'}`}>
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---- File upload field with progress ----
// `private` routes the file to access-controlled storage and returns { key }
// instead of a public { url } — used for data-room collateral and attachments.
export function FileUpload({ label, accept, onUploaded, hint, currentUrl, uploaded, private: isPrivate, maxBytes }) {
  const [progress, setProgress] = useState(null);
  const toast = useToast();
  const handle = async (file) => {
    if (!file) return;
    // Fail fast on oversized files so the user isn't left waiting on a doomed upload.
    if (maxBytes && file.size > maxBytes) {
      toast(`That file is ${Math.ceil(file.size / 1048576)} MB. The limit is ${Math.round(maxBytes / 1048576)} MB.`, 'error');
      return;
    }
    // Big uploads pause if the OS backgrounds the app — warn once, up front.
    if (IS_NATIVE && file.size > 20 * 1048576) {
      toast('Keep the app open while your file uploads.', 'info');
    }
    try {
      setProgress(0);
      const data = await (isPrivate ? api.uploadPrivate(file, setProgress) : api.upload(file, setProgress));
      onUploaded(data, file);
      toast('Upload complete', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setProgress(null);
    }
  };
  const isDone = currentUrl || uploaded;
  return (
    <div>
      {label && <span className="label">{label}</span>}
      {/* F-025: focusable, keyboard-operable upload control (Enter/Space opens the picker). */}
      <label role="button" tabIndex={0} aria-label={`${label || 'Upload file'}${hint ? ` — ${hint}` : ''}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.querySelector('input[type=file]').click(); } }}
        className="block cursor-pointer border-2 border-dashed border-ink-600/80 hover:border-gold-500/50 focus-visible:border-gold-500/70 rounded-xl p-4 text-center transition-colors bg-ink-850/50">
        <input type="file" accept={accept} className="sr-only" onChange={(e) => handle(e.target.files[0])} />
        {progress !== null ? (
          <div>
            <div className="text-xs text-mist-400 mb-2">Uploading… {progress}%</div>
            <div className="h-1.5 bg-ink-700 rounded-full overflow-hidden"><div className="h-full bg-gold-400 transition-all" style={{ width: progress + '%' }} /></div>
          </div>
        ) : isDone ? (
          <div className="text-sm text-emerald-300 font-medium">✓ Uploaded — click to replace</div>
        ) : (
          <div className="text-sm text-mist-400">Click to upload{hint && <div className="text-xs text-mist-500 mt-1">{hint}</div>}</div>
        )}
      </label>
    </div>
  );
}

// ---- Searchable global city picker ("City, Country") ----
// Debounced autocomplete backed by /api/cities. Accepts free text too (so existing
// freeform city values keep working), but guides users to the normalized format.
export function CityInput({ value, onChange, placeholder = 'Search city…', className = '' }) {
  const [q, setQ] = useState(value || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  useEffect(() => { setQ(value || ''); }, [value]);
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try { const d = await api.get('/api/cities?q=' + encodeURIComponent(term)); setResults(Array.isArray(d.cities) ? d.cities : []); }
      catch { setResults([]); }
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const choose = (c) => { onChange(c); setQ(c); setOpen(false); setResults([]); setActive(-1); };
  return (
    <div className="relative" ref={boxRef}>
      <input className={`input ${className}`} value={q} placeholder={placeholder} autoComplete="off" aria-label="City"
        onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || results.length === 0) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(results[active]); }
          else if (e.key === 'Escape') setOpen(false);
        }} />
      {open && results.length > 0 && (
        <ul role="listbox" aria-label="City suggestions" className="absolute z-30 mt-1 w-full max-h-60 overflow-auto rounded-xl bg-ink-850 border border-ink-600/70 shadow-lift py-1">
          {results.map((c, i) => (
            <li key={c} role="option" aria-selected={i === active}>
              <button type="button" tabIndex={-1} onMouseEnter={() => setActive(i)} onClick={() => choose(c)}
                className={`w-full text-left px-3 py-2 text-sm ${i === active ? 'bg-ink-700 text-mist-100' : 'text-mist-300 hover:bg-ink-800'}`}>{c}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Reusable links editor ([{label,url}], up to `max`) ----
export function LinksEditor({ value, onChange, max = 10 }) {
  const links = Array.isArray(value) ? value : [];
  const setLink = (i, k, v) => onChange(links.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const add = () => { if (links.length < max) onChange([...links, { label: '', url: '' }]); };
  const remove = (i) => onChange(links.filter((_, j) => j !== i));
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="label !mb-0">Links</span>
        <span className="text-xs text-mist-500">{links.length}/{max}</span>
      </div>
      <p className="text-xs text-mist-500 mt-1 mb-3">Add up to {max} links — website, X, GitHub, deck, press, anything.</p>
      <div className="space-y-2">
        {links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input className="input !w-40" placeholder="Label (optional)" value={l.label || ''} onChange={(e) => setLink(i, 'label', e.target.value)} />
            <input className="input flex-1" placeholder="https://…" value={l.url || ''} onChange={(e) => setLink(i, 'url', e.target.value)} />
            <button type="button" className="btn-ghost btn-sm shrink-0" aria-label="Remove link" onClick={() => remove(i)}>Remove</button>
          </div>
        ))}
      </div>
      {links.length < max && <button type="button" className="btn-ghost btn-sm mt-2" onClick={add}>+ Add link</button>}
    </div>
  );
}

// ---- Reusable team-member editor (add / edit / remove) ----
export function TeamEditor({ value, onChange, max = 30 }) {
  const team = Array.isArray(value) ? value : [];
  const setM = (i, k, v) => onChange(team.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  const add = () => { if (team.length < max) onChange([...team, { name: '', role: '', bio: '', linkedin: '', photo: '' }]); };
  const remove = (i) => onChange(team.filter((_, j) => j !== i));
  return (
    <div className="space-y-3">
      {team.length === 0 && <p className="text-sm text-mist-500">No team members yet. Add your co-founders and key team.</p>}
      {team.map((m, i) => (
        <div key={i} className="rounded-xl border border-ink-700/60 bg-ink-850 p-3.5 space-y-2.5">
          <div className="flex items-center gap-3">
            <Avatar src={m.photo} name={m.name || '?'} size={11} />
            <div className="flex-1 grid sm:grid-cols-2 gap-2">
              <input className="input" placeholder="Name (required)" value={m.name || ''} onChange={(e) => setM(i, 'name', e.target.value)} />
              <input className="input" placeholder="Role — e.g. Co-founder & CTO" value={m.role || ''} onChange={(e) => setM(i, 'role', e.target.value)} />
            </div>
            <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => remove(i)}>Remove</button>
          </div>
          <textarea className="input min-h-[52px]" placeholder="Short bio (optional)" value={m.bio || ''} onChange={(e) => setM(i, 'bio', e.target.value)} />
          <div className="grid sm:grid-cols-2 gap-2 items-start">
            <input className="input" placeholder="LinkedIn / profile URL (optional)" value={m.linkedin || ''} onChange={(e) => setM(i, 'linkedin', e.target.value)} />
            <FileUpload accept="image/*" currentUrl={m.photo} hint="Photo (optional)" onUploaded={(d) => setM(i, 'photo', d.url)} />
          </div>
        </div>
      ))}
      {team.length < max && <button type="button" className="btn-ghost btn-sm" onClick={add}>+ Add team member</button>}
    </div>
  );
}

// ---- Simple SVG charts (no deps) ----
export function LineChart({ data, xKey, yKey, height = 160, format = (v) => v }) {
  if (!data || data.length < 2) return <div className="text-xs text-mist-500 py-8 text-center">Not enough data yet</div>;
  const w = 600, h = height, pad = 8;
  const ys = data.map(d => Number(d[yKey]) || 0);
  const max = Math.max(...ys) || 1, min = Math.min(...ys, 0);
  const x = (i) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const y = (v) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2 - 14);
  const path = ys.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const area = `${path} L${x(ys.length - 1)},${h - pad} L${x(0)},${h - pad} Z`;
  const summary = `Trend over ${data.length} points: from ${format(ys[0])} to ${format(ys[ys.length - 1])}, peak ${format(max)}.`;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" role="img" aria-label={summary}>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8052ff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#8052ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#lg)" />
        <path d={path} fill="none" stroke="#8052ff" strokeWidth="2.5" strokeLinejoin="round" />
        {ys.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="rgb(var(--ink-950))" stroke="#8052ff" strokeWidth="2" />)}
      </svg>
      <div className="flex justify-between text-[10px] text-mist-500 px-1 mt-1">
        {data.map((d, i) => <span key={i} className={data.length > 8 && i % 2 ? 'hidden sm:inline' : ''}>{d[xKey]}</span>)}
      </div>
      <div className="flex justify-between text-[10px] text-gold-400/80 px-1">
        <span>{format(ys[0])}</span><span>{format(ys[ys.length - 1])}</span>
      </div>
    </div>
  );
}

export function BarBreakdown({ items }) {
  const colors = ['#8052ff', '#ffb829', '#15846e', '#b79cff', '#f87171', '#34d399'];
  return (
    <div className="space-y-3">
      <div className="flex h-3 rounded-full overflow-hidden border border-ink-600/50" role="img" aria-label={`Breakdown: ${items.map(it => `${it.label} ${it.pct}%`).join(', ')}`}>
        {items.map((it, i) => (
          <div key={i} style={{ width: it.pct + '%', background: colors[i % colors.length] }} title={`${it.label} ${it.pct}%`} />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colors[i % colors.length] }} />
            <span className="text-mist-300 flex-1">{it.label}</span>
            <span className="text-mist-100 font-semibold tabular-nums">{it.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CountUp({ value }) {
  const target = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(target)) return;
    // F-023: respect reduced-motion — show the final value without the count-up.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(target); return; }
    let raf;
    const t0 = performance.now();
    const dur = 700;
    const step = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  if (!Number.isFinite(target)) return value;
  return n.toLocaleString();
}

// Fundamental Score gauge — explainable composite rating
export function ScoreRing({ score, size = 64, label = 'Score' }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 75 ? '#34d399' : pct >= 50 ? 'rgb(var(--acc-400))' : pct >= 30 ? '#fbbf24' : '#f87171';
  return (
    <div className="flex flex-col items-center gap-1" title={`Fundamental Score: ${pct}/100`}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${label}: ${pct} out of 100`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--ink-700))" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)' }} />
        <text x="50%" y="50%" transform={`rotate(90 ${size / 2} ${size / 2})`} textAnchor="middle" dominantBaseline="central"
          className="font-display" style={{ fill: 'rgb(var(--mist-100))', fontSize: size * 0.3, fontWeight: 700 }}>{pct}</text>
      </svg>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-mist-500">{label}</span>
    </div>
  );
}

export const Stat = ({ label, value, sub }) => (
  <div className="card card-hover p-4">
    <div className="text-[11px] font-semibold uppercase tracking-wider text-mist-500">{label}</div>
    <div className="stat-num mt-1"><CountUp value={value} /></div>
    {sub && <div className="text-xs text-mist-400 mt-0.5">{sub}</div>}
  </div>
);

// Brand mark. Uses the supplied raster lockup from /public when present
// (theme-aware: dark wordmark on light backgrounds, white wordmark on dark),
// and falls back to a scalable inline SVG if the images aren't available.
// `variant="dark"` forces the white-wordmark lockup for always-dark surfaces.
const LogoSvg = () => (
  <span className="inline-flex items-center gap-2.5 h-full">
    <svg viewBox="0 0 100 100" className="h-full w-auto" aria-hidden="true">
      <defs>
        <linearGradient id="fnd-fill" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#a786ff" />
          <stop offset="55%" stopColor="#7a4ef0" />
          <stop offset="100%" stopColor="#4f29bd" />
        </linearGradient>
        <linearGradient id="fnd-band" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dccaff" />
          <stop offset="100%" stopColor="#8a5cff" />
        </linearGradient>
        <clipPath id="fnd-tri"><path d="M10 14 H90 L50 88 Z" /></clipPath>
      </defs>
      <g clipPath="url(#fnd-tri)">
        <path d="M10 14 H90 L50 88 Z" fill="url(#fnd-fill)" />
        <rect x="6" y="14" width="17" height="74" fill="url(#fnd-band)" opacity="0.9" />
        <rect x="0" y="15" width="100" height="14" fill="url(#fnd-band)" />
        <rect x="0" y="35" width="100" height="12" fill="url(#fnd-band)" opacity="0.82" />
        <rect x="0" y="53" width="100" height="10" fill="url(#fnd-band)" opacity="0.64" />
        <rect x="0" y="29" width="100" height="2.4" fill="#2a155e" opacity="0.5" />
        <rect x="0" y="47" width="100" height="2.4" fill="#2a155e" opacity="0.5" />
        <rect x="0" y="63" width="100" height="2.4" fill="#2a155e" opacity="0.5" />
        <rect x="0" y="15" width="100" height="2" fill="#ffffff" opacity="0.5" />
        <rect x="0" y="35" width="100" height="1.6" fill="#ffffff" opacity="0.32" />
      </g>
      <path d="M10 14 H90 L50 88 Z" fill="none" stroke="#c9b6ff" strokeWidth="1.6" opacity="0.4" />
    </svg>
    <span className="font-display font-bold tracking-tight text-lg">Fundamental</span>
  </span>
);

export const Logo = ({ className = 'h-[52px]', variant = 'auto' }) => {
  const [failed, setFailed] = useState(false);
  const onErr = () => setFailed(true);
  return (
    <span className={`inline-flex items-center ${className}`}>
      {failed ? <LogoSvg /> : variant === 'dark' ? (
        <img src="/logo-dark.png" alt="Fundamental" onError={onErr} className="h-full w-auto object-contain" />
      ) : (
        <>
          {/* light mode → light-bg lockup; dark mode → dark-bg lockup */}
          <img src="/logo-white.png" alt="Fundamental" onError={onErr} className="h-full w-auto object-contain block dark:hidden" />
          <img src="/logo-dark.png" alt="Fundamental" onError={onErr} className="h-full w-auto object-contain hidden dark:block" />
        </>
      )}
    </span>
  );
};

// ---- Confirm dialog (branded replacement for window.confirm / window.prompt) ----
// Usage: const confirm = useConfirm();
//   if (!await confirm({ title: 'Delete post?', body: 'This cannot be undone.', danger: true })) return;
// Pass `typed: 'DELETE'` to require the user to type a phrase before confirming.
const ConfirmCtx = createContext(() => Promise.resolve(false));
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const [typedVal, setTypedVal] = useState('');
  const confirm = useCallback((opts) => new Promise((resolve) => {
    setTypedVal('');
    setState({ ...opts, resolve });
  }), []);
  const close = (val) => { const r = state?.resolve; setState(null); r && r(val); };
  const needsTyped = state?.typed && typedVal !== state.typed;
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title || 'Are you sure?'}>
        {state && (
          <div className="space-y-4">
            {state.body && <p className="text-sm text-mist-300 leading-relaxed">{state.body}</p>}
            {state.typed && (
              <div>
                <span className="label">Type <code className="text-gold-300">{state.typed}</code> to confirm</span>
                <input className="input" value={typedVal} onChange={(e) => setTypedVal(e.target.value)} autoFocus />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost btn-sm" onClick={() => close(false)}>Cancel</button>
              <button className={`${state.danger ? 'btn-danger' : 'btn-primary'} btn-sm`} disabled={needsTyped}
                autoFocus={!state.typed} onClick={() => close(true)}>
                {state.confirmLabel || (state.danger ? 'Delete' : 'Confirm')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

// ---- Report modal (any user-generated content) ----
// Structured category + optional detail, posted to the shared /report endpoint.
const REPORT_CATEGORIES = ['Spam', 'Harassment or abuse', 'Misleading or fraudulent', 'Inappropriate content', 'Other'];
export function ReportModal({ open, onClose, targetType, targetId, targetLabel }) {
  const [category, setCategory] = useState(REPORT_CATEGORIES[0]);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/api/users/report', {
        target_type: targetType, target_id: targetId,
        reason: detail.trim() ? `${category}: ${detail.trim()}` : category,
      });
      toast('Report sent to our moderation team', 'success');
      setDetail(''); setCategory(REPORT_CATEGORIES[0]);
      onClose();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Report ${targetLabel || targetType}`}>
      <div className="space-y-4">
        <div>
          <span className="label">What is the issue?</span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {REPORT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <span className="label">Details <span className="normal-case font-normal text-mist-500">(optional)</span></span>
          <textarea className="input min-h-[90px]" maxLength={2000} value={detail} onChange={(e) => setDetail(e.target.value)}
            placeholder="Anything that helps our team review this quickly." />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn-sm" disabled={busy} onClick={submit}>{busy ? 'Sending…' : 'Send report'}</button>
        </div>
      </div>
    </Modal>
  );
}
