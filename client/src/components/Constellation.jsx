import { useEffect, useRef } from 'react';

// A constellation of tiny geometric primitives (triangles, circles, diamonds,
// squares) that clusters into a sequence of world-changing macro-forms. Forms
// are sampled from glyph/path silhouettes rendered to an offscreen canvas —
// the particles then spring toward their sampled targets, so every morph is
// organic. Reused on the landing page, the login page and inside the app.

const PALETTE = ['#8052ff', '#8052ff', '#8052ff', '#ffb829', '#15846e', '#ffffff'];

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

export const SHAPES = [
  { draw: drawEmoji('🧠'), kicker: 'IDEAS', label: 'Deeptech & AI' },
  { draw: drawEmoji('🚀'), kicker: 'VELOCITY', label: 'Space & Mobility' },
  { draw: drawEmoji('⚛️'), kicker: 'ENERGY', label: 'Fusion & Nuclear' },
  { draw: drawChip, kicker: 'COMPUTE', label: 'Semiconductors' },
  { draw: drawEmoji('🦾'), kicker: 'AUTOMATION', label: 'Robotics' },
  { draw: drawEmoji('🌱'), kicker: 'PLANET', label: 'Climatetech' },
  { draw: drawEmoji('🧬'), kicker: 'BIOLOGY', label: 'Biotech & Genomics' },
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

export default function Constellation({ count = 1500, cycleMs = 3400, onShape, className = 'w-full h-full' }) {
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

    // Sample every shape up front; skip any that failed to rasterize.
    // The procedural chip always succeeds, so the cycle is never empty.
    const shapes = SHAPES.map(s => ({ ...s, pts: samplePoints(s.draw, count) })).filter(s => s.pts);

    const parts = Array.from({ length: count }, (_, i) => ({
      x: Math.random(), y: Math.random(),
      tx: 0.5, ty: 0.5,
      color: PALETTE[i % PALETTE.length],
      size: 1.5 + Math.random() * 2.5,
      kind: i % 4, // 0 circle · 1 triangle · 2 diamond · 3 square
      phase: Math.random() * Math.PI * 2,
      drift: 0.0035 + Math.random() * 0.004, // idle wobble amplitude
      speed: 0.05 + Math.random() * 0.06,
    }));

    let shapeIdx = -1;
    const setShape = () => {
      shapeIdx = (shapeIdx + 1) % shapes.length;
      const pts = shapes[shapeIdx].pts;
      for (let i = 0; i < count; i++) {
        const [px, py] = pts[i];
        parts[i].tx = 0.5 + px * 0.92;
        parts[i].ty = 0.5 + py * 0.92;
      }
      onShapeRef.current?.(shapes[shapeIdx]);
    };
    setShape();
    const cycle = setInterval(setShape, cycleMs);

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
        const wx = reduced ? 0 : Math.sin(t * 1.6 + p.phase) * p.drift;
        const wy = reduced ? 0 : Math.cos(t * 1.3 + p.phase * 1.7) * p.drift;
        const x = ox + (p.x + wx) * R;
        const y = oy + (p.y + wy) * R;
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
  }, [count, cycleMs]);

  return <canvas ref={ref} className={`${className} block`} aria-hidden="true" />;
}
