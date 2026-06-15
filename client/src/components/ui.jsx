import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../api';

export function Avatar({ src, name, size = 10, square = false }) {
  const px = size * 4;
  const cls = `${square ? 'rounded-xl' : 'rounded-full'} object-cover bg-ink-700 border border-ink-600/60 shrink-0`;
  if (src) return <img src={src} alt={name} style={{ width: px, height: px }} className={cls} />;
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
    <span title={t.label} className={`inline-flex items-center justify-center rounded-full ${t.bg} text-white shrink-0 ${small ? 'w-3.5 h-3.5' : 'w-[18px] h-[18px]'}`}>
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
          <img ref={ref} src={cover} alt="" className="absolute inset-0 w-full h-full object-cover will-change-transform" style={{ transform: 'scale(1.06)' }} />
        ) : (
          <div ref={ref} className="absolute inset-0 will-change-transform" style={{ transform: 'scale(1.06)', background: `linear-gradient(120deg, hsl(${hue} 55% 24%), hsl(${(hue + 50) % 360} 65% 40%))` }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgb(var(--ink-900)) 2%, rgb(var(--ink-900) / 0.45) 35%, transparent 70%)' }} />
      </div>
      <div className="px-5 sm:px-6 pb-5 sm:pb-6">{children}</div>
    </div>
  );
}

export const Spinner = ({ className = '' }) => (
  <div className={`flex justify-center py-12 ${className}`}>
    <div className="w-7 h-7 rounded-full border-2 border-ink-600 border-t-gold-400 animate-spin" />
  </div>
);

export const Empty = ({ icon = '◇', title, sub }) => (
  <div className="card p-10 text-center fade-in">
    <div className="text-3xl mb-3 text-mist-500">{icon}</div>
    <div className="h-display text-base">{title}</div>
    {sub && <div className="text-sm text-mist-400 mt-1.5 max-w-sm mx-auto">{sub}</div>}
  </div>
);

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    const fn = (e) => e.key === 'Escape' && onClose();
    if (open) { document.addEventListener('keydown', fn); document.body.style.overflow = 'hidden'; }
    return () => { document.removeEventListener('keydown', fn); document.body.style.overflow = ''; };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/70 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className={`card w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto p-6 rounded-b-none sm:rounded-2xl`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="h-display text-lg">{title}</h3>
              <button onClick={onClose} className="text-mist-400 hover:text-mist-100 text-xl leading-none px-1">×</button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---- Toast system ----
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, kind = 'info') => {
    const id = Math.random();
    setToasts(t => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[92%] max-w-md pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div key={t.id}
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
export function FileUpload({ label, accept, onUploaded, hint, currentUrl }) {
  const [progress, setProgress] = useState(null);
  const toast = useToast();
  const handle = async (file) => {
    if (!file) return;
    try {
      setProgress(0);
      const data = await api.upload(file, setProgress);
      onUploaded(data, file);
      toast('Upload complete', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setProgress(null);
    }
  };
  return (
    <div>
      {label && <span className="label">{label}</span>}
      <label className="block cursor-pointer border-2 border-dashed border-ink-600/80 hover:border-gold-500/50 rounded-xl p-4 text-center transition-colors bg-ink-850/50">
        <input type="file" accept={accept} className="hidden" onChange={(e) => handle(e.target.files[0])} />
        {progress !== null ? (
          <div>
            <div className="text-xs text-mist-400 mb-2">Uploading… {progress}%</div>
            <div className="h-1.5 bg-ink-700 rounded-full overflow-hidden"><div className="h-full bg-gold-400 transition-all" style={{ width: progress + '%' }} /></div>
          </div>
        ) : currentUrl ? (
          <div className="text-sm text-emerald-300 font-medium">✓ Uploaded — click to replace</div>
        ) : (
          <div className="text-sm text-mist-400">Click to upload{hint && <div className="text-xs text-mist-500 mt-1">{hint}</div>}</div>
        )}
      </label>
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
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
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
      <div className="flex h-3 rounded-full overflow-hidden border border-ink-600/50">
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
      <svg width={size} height={size} className="-rotate-90">
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

// Brand mark: a faceted violet-glass emblem (downward prism of stacked bars) +
// the wordmark. The mark reads on any background; the wordmark uses currentColor
// so it stays legible in both light and dark mode wherever the Logo is placed.
export const Logo = ({ className = 'h-7' }) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`}>
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
        {/* left spine + stacked glass bars */}
        <rect x="6" y="14" width="17" height="74" fill="url(#fnd-band)" opacity="0.9" />
        <rect x="0" y="15" width="100" height="14" fill="url(#fnd-band)" />
        <rect x="0" y="35" width="100" height="12" fill="url(#fnd-band)" opacity="0.82" />
        <rect x="0" y="53" width="100" height="10" fill="url(#fnd-band)" opacity="0.64" />
        {/* facet gaps */}
        <rect x="0" y="29" width="100" height="2.4" fill="#2a155e" opacity="0.5" />
        <rect x="0" y="47" width="100" height="2.4" fill="#2a155e" opacity="0.5" />
        <rect x="0" y="63" width="100" height="2.4" fill="#2a155e" opacity="0.5" />
        {/* gloss highlights */}
        <rect x="0" y="15" width="100" height="2" fill="#ffffff" opacity="0.5" />
        <rect x="0" y="35" width="100" height="1.6" fill="#ffffff" opacity="0.32" />
      </g>
      <path d="M10 14 H90 L50 88 Z" fill="none" stroke="#c9b6ff" strokeWidth="1.6" opacity="0.4" />
    </svg>
    <span className="font-display font-bold tracking-tight text-lg">Fundamental</span>
  </span>
);
