import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/ui';

// ------------------------------------------------------------------ particles
// A constellation of tiny geometric primitives (triangles, circles, diamonds,
// squares) that clusters into a sequence of macro-forms: brain → rocket →
// fusion → semiconductor → superfood → globe. The forms are sampled from
// glyph/path silhouettes rendered to an offscreen canvas — the particles then
// spring toward their sampled targets, so every morph is organic.

const PALETTE = ['#8052ff', '#8052ff', '#8052ff', '#ffb829', '#15846e', '#ffffff'];
const N = 900;

function drawChip(c, S) {
  // No chip emoji exists — draw the die + pins procedurally
  const u = S / 300;
  c.fillStyle = '#fff';
  c.fillRect(80 * u, 80 * u, 140 * u, 140 * u);
  c.clearRect(100 * u, 100 * u, 100 * u, 100 * u);
  c.fillRect(112 * u, 112 * u, 76 * u, 76 * u); // inner die
  for (let i = 0; i < 6; i++) {
    const p = (92 + i * 24) * u;
    c.fillRect(p, 48 * u, 10 * u, 26 * u);          // top pins
    c.fillRect(p, 226 * u, 10 * u, 26 * u);         // bottom pins
    c.fillRect(48 * u, p, 26 * u, 10 * u);          // left pins
    c.fillRect(226 * u, p, 26 * u, 10 * u);         // right pins
  }
}

function drawEmoji(glyph) {
  return (c, S) => {
    c.font = `${S * 0.8}px serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(glyph, S / 2, S * 0.54);
  };
}

const SHAPES = [
  { draw: drawEmoji('🧠'), kicker: 'IDEAS', label: 'Deeptech & AI' },
  { draw: drawEmoji('🚀'), kicker: 'VELOCITY', label: 'Space & Mobility' },
  { draw: drawEmoji('⚛️'), kicker: 'ENERGY', label: 'Fusion & Climate' },
  { draw: drawChip, kicker: 'COMPUTE', label: 'Semiconductors' },
  { draw: drawEmoji('🥦'), kicker: 'LIFE', label: 'Food & Health' },
  { draw: drawEmoji('🌍'), kicker: 'EVERYWHERE', label: 'Global Markets' },
];

function samplePoints(draw, count) {
  const S = 300;
  const off = document.createElement('canvas');
  off.width = off.height = S;
  const c = off.getContext('2d', { willReadFrequently: true });
  draw(c, S);
  const img = c.getImageData(0, 0, S, S).data;
  const pts = [];
  for (let y = 0; y < S; y += 2) {
    for (let x = 0; x < S; x += 2) {
      if (img[(y * S + x) * 4 + 3] > 100) pts.push([x / S - 0.5, y / S - 0.5]);
    }
  }
  if (pts.length < 40) return null; // glyph failed to render on this platform
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = pts[(Math.random() * pts.length) | 0];
  return out;
}

function Constellation({ onShape }) {
  const ref = useRef(null);
  const onShapeRef = useRef(onShape);
  onShapeRef.current = onShape;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf, w, h, dpr;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Sample every shape up front; skip any that failed to rasterize
    const shapes = SHAPES.map(s => ({ ...s, pts: samplePoints(s.draw, N) })).filter(s => s.pts);

    const parts = Array.from({ length: N }, (_, i) => ({
      x: Math.random(), y: Math.random(),
      tx: 0.5, ty: 0.5,
      color: PALETTE[i % PALETTE.length],
      size: 1.5 + Math.random() * 2.5,
      kind: i % 4, // 0 circle · 1 triangle · 2 diamond · 3 square
      phase: Math.random() * Math.PI * 2,
      speed: 0.045 + Math.random() * 0.05,
    }));

    let shapeIdx = -1;
    const setShape = () => {
      shapeIdx = (shapeIdx + 1) % shapes.length;
      const pts = shapes[shapeIdx].pts;
      for (let i = 0; i < N; i++) {
        const [px, py] = pts[i];
        parts[i].tx = 0.5 + px * 0.92;
        parts[i].ty = 0.5 + py * 0.92;
      }
      onShapeRef.current?.(shapes[shapeIdx]);
    };
    setShape();
    const cycle = setInterval(setShape, 3400, );

    let t = 0;
    const frame = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h);
      const ox = (w - R) / 2, oy = (h - R) / 2;
      for (const p of parts) {
        if (!reduced) {
          p.x += (p.tx - p.x) * p.speed;
          p.y += (p.ty - p.y) * p.speed;
        } else { p.x = p.tx; p.y = p.ty; }
        const wob = reduced ? 0 : Math.sin(t * 1.4 + p.phase) * 0.0022;
        const x = ox + (p.x + wob) * R;
        const y = oy + (p.y + Math.cos(t * 1.1 + p.phase) * (reduced ? 0 : 0.0022)) * R;
        const s = p.size;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.85;
        if (p.kind === 0) {
          ctx.beginPath(); ctx.arc(x, y, s / 2, 0, Math.PI * 2); ctx.fill();
        } else if (p.kind === 1) {
          ctx.beginPath(); ctx.moveTo(x, y - s / 2); ctx.lineTo(x + s / 2, y + s / 2); ctx.lineTo(x - s / 2, y + s / 2); ctx.closePath(); ctx.fill();
        } else if (p.kind === 2) {
          ctx.beginPath(); ctx.moveTo(x, y - s / 2); ctx.lineTo(x + s / 2, y); ctx.lineTo(x, y + s / 2); ctx.lineTo(x - s / 2, y); ctx.closePath(); ctx.fill();
        } else {
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => { cancelAnimationFrame(raf); clearInterval(cycle); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={ref} className="w-full h-full block" aria-hidden="true" />;
}

// ------------------------------------------------------------------- landing

const NAV_LINKS = [
  ['Discover', '/login'],
  ['For Founders', '#founders'],
  ['For Investors', '#investors'],
];

const PILLARS = [
  { n: '01', t: 'The 12-minute pitch', d: 'Every startup opens with a mandatory video pitch. No cold decks, no warm intros required — the work speaks first.' },
  { n: '02', t: 'Permissioned data rooms', d: 'Decks, models and cap tables behind founder-controlled access. Diligence happens on the platform, on the record.' },
  { n: '03', t: 'The Fundamental Score', d: 'An explainable 0–100 score across completeness, traction, engagement and trust. The market\'s shared language.' },
];

export default function Landing() {
  const [shape, setShape] = useState(SHAPES[0]);

  return (
    <div className="min-h-screen bg-black text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 bg-black/85">
        <div className="max-w-[1200px] mx-auto px-6 h-[72px] flex items-center justify-between">
          <Logo />
          <nav className="hidden md:flex items-center gap-9">
            {NAV_LINKS.map(([l, to]) => (
              to.startsWith('#')
                ? <a key={l} href={to} className="text-[14px] tracking-[0.021em] text-[#9a9a9a] hover:text-white transition-colors">{l}</a>
                : <Link key={l} to={to} className="text-[14px] tracking-[0.021em] text-[#9a9a9a] hover:text-white transition-colors">{l}</Link>
            ))}
          </nav>
          <Link to="/login"
            className="rounded-[24px] bg-[#8052ff] text-white text-[12px] font-semibold uppercase tracking-[0.05em] px-5 py-[12px] hover:bg-[#9066ff] transition-colors">
            Enter Fundamental
          </Link>
        </div>
      </header>

      {/* Hero — 50/50: text block on the void, constellation owning the right */}
      <section className="max-w-[1200px] mx-auto px-6 pt-[120px] min-h-screen grid lg:grid-cols-2 items-center gap-[36px]">
        <div className="max-w-[480px] order-2 lg:order-1 pb-[60px] lg:pb-0">
          <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[#8052ff] mb-[18px]">
            Stop pitching into the void. Start raising in it.
          </div>
          <h1 className="font-extralight text-[clamp(56px,9vw,113px)] leading-[0.85] tracking-[-0.04em]">
            Every idea<br />becomes<br />a company.
          </h1>
          <p className="mt-[30px] text-[15px] leading-[1.5] tracking-[0.025em] text-[#bdbdbd] max-w-[42ch]">
            Fundamental is the serious fundraising marketplace. A 12-minute video pitch,
            structured metrics and a permissioned data room on every startup — for investors
            who do real diligence, from first contact to term sheet.
          </p>
          <div className="mt-[36px] flex items-center gap-[15px] flex-wrap">
            <Link to="/login"
              className="rounded-[24px] bg-[#8052ff] text-white text-[12px] font-semibold uppercase tracking-[0.05em] px-6 py-[14px] hover:bg-[#9066ff] transition-colors">
              Raise or Invest
            </Link>
            <Link to="/login"
              className="rounded-[24px] border border-[#ffb829] text-[#ffb829] text-[12px] font-semibold uppercase tracking-[0.05em] px-6 py-[14px] hover:bg-[#ffb829]/10 transition-colors">
              Watch the pitches
            </Link>
          </div>
        </div>

        <div className="order-1 lg:order-2 relative h-[46vh] lg:h-[78vh]">
          <Constellation onShape={setShape} />
          <div key={shape.label} className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center fade-in">
            <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[#8052ff]">{shape.kicker}</div>
            <div className="text-[14px] tracking-[0.021em] text-[#9a9a9a] mt-1">{shape.label}</div>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section id="founders" className="max-w-[1200px] mx-auto px-6 py-[60px]">
        <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-white mb-[12px]">The system</div>
        <h2 className="font-extralight text-[clamp(36px,5vw,78px)] leading-[0.9] tracking-[-0.04em] mb-[60px]">
          Built for diligence,<br />not noise.
        </h2>
        <div className="grid md:grid-cols-3 gap-[24px]">
          {PILLARS.map(p => (
            <div key={p.n} className="rounded-[24px] border border-white/10 p-[24px]">
              <div className="text-[12px] font-semibold tracking-[0.05em] text-[#8052ff]">{p.n}</div>
              <h3 className="text-[24px] leading-[1.3] tracking-[0.021em] font-semibold mt-[18px]">{p.t}</h3>
              <p className="text-[15px] leading-[1.5] tracking-[0.025em] text-[#9a9a9a] mt-[12px]">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section id="investors" className="max-w-[1200px] mx-auto px-6 py-[60px]">
        <div className="rounded-[24px] border border-white/10 p-[36px] grid sm:grid-cols-3 gap-[30px] text-center">
          {[['8+', 'startups raising now'], ['$39M+', 'in open rounds'], ['12 min', 'to know if it\'s a deal']].map(([v, l]) => (
            <div key={l}>
              <div className="font-extralight text-[48px] leading-[1.1] tracking-[-0.04em]">{v}</div>
              <div className="text-[12px] uppercase tracking-[0.05em] text-[#9a9a9a] mt-[6px]">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-[1200px] mx-auto px-6 py-[96px] text-center">
        <h2 className="font-extralight text-[clamp(42px,6vw,78px)] leading-[0.9] tracking-[-0.04em]">
          Fundraising?<br />Fundamental.
        </h2>
        <Link to="/login"
          className="inline-block mt-[36px] rounded-[24px] bg-[#8052ff] text-white text-[12px] font-semibold uppercase tracking-[0.05em] px-8 py-[14px] hover:bg-[#9066ff] transition-colors">
          Create your account
        </Link>
      </section>

      <footer className="border-t border-white/10">
        <div className="max-w-[1200px] mx-auto px-6 py-[30px] flex items-center justify-between flex-wrap gap-[12px]">
          <Logo />
          <div className="text-[12px] tracking-[0.05em] text-[#9a9a9a]">A professional network for founders and investors. No noise. No casual posting.</div>
        </div>
      </footer>
    </div>
  );
}
