import { useEffect, useRef } from 'react';

// A constellation of tiny geometric primitives (triangles, circles, diamonds,
// squares) that clusters into a sequence of world-changing macro-forms. Forms
// are sampled from glyph/path silhouettes rendered to an offscreen canvas. The
// particles run a real spring + velocity simulation, so every morph DETONATES
// the cloud outward and lets it reassemble organically. The whole formed shape
// gently sways, bobs and breathes, and the field reacts to the pointer —
// repelling under the cursor and exploding on click/tap. Reused on the landing
// page, the login page and inside the app.

const PALETTE = ['#8052ff', '#8052ff', '#9b6bff', '#8052ff', '#ffb829', '#15846e', '#ffffff'];

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

function drawQuantum(c, S) {
  // Quantum: a nucleus with three crossed elliptical orbits (no good emoji exists)
  const u = S / 300, cx = S / 2, cy = S / 2;
  c.strokeStyle = '#fff';
  c.lineWidth = 12 * u;
  for (let k = 0; k < 3; k++) {
    c.save();
    c.translate(cx, cy);
    c.rotate((k * Math.PI) / 3);
    c.beginPath();
    c.ellipse(0, 0, 120 * u, 46 * u, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(cx, cy, 26 * u, 0, Math.PI * 2);
  c.fill();
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
  { draw: drawQuantum, kicker: 'SUPERPOSITION', label: 'Quantum' },
  { draw: drawEmoji('🦾'), kicker: 'AUTOMATION', label: 'Robotics' },
  { draw: drawEmoji('🛡️'), kicker: 'DEFENSE', label: 'Cyber & Defense' },
  { draw: drawEmoji('💳'), kicker: 'CAPITAL', label: 'Fintech' },
  { draw: drawEmoji('🌱'), kicker: 'PLANET', label: 'Climatetech' },
  { draw: drawEmoji('🔋'), kicker: 'STORAGE', label: 'Energy Storage' },
  { draw: drawEmoji('🧬'), kicker: 'BIOLOGY', label: 'Biotech & Genomics' },
  { draw: drawEmoji('💎'), kicker: 'MATTER', label: 'Advanced Materials' },
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

export default function Constellation({ count = 1500, cycleMs = 3400, onShape, className = 'w-full h-full', interactive = true }) {
  const ref = useRef(null);
  const onShapeRef = useRef(onShape);
  onShapeRef.current = onShape;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf, w, h, dpr, R, ox, oy;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(w, h); ox = (w - R) / 2; oy = (h - R) / 2;
    };
    resize();
    window.addEventListener('resize', resize);

    // Sample every shape up front; skip any that failed to rasterize.
    // The procedural chip/quantum always succeed, so the cycle is never empty.
    const shapes = SHAPES.map(s => ({ ...s, pts: samplePoints(s.draw, count) })).filter(s => s.pts);

    // Each particle keeps a base target (the sampled shape point, centred on 0).
    // The live target tx/ty is that base re-posed every frame by the global
    // sway/bob/breathe transform, so the assembled form is always in motion.
    const parts = Array.from({ length: count }, (_, i) => ({
      x: Math.random(), y: Math.random(),
      vx: 0, vy: 0,
      bx: 0, by: 0,       // base (shape-space) target
      tx: 0.5, ty: 0.5,   // live (posed) target
      color: PALETTE[i % PALETTE.length],
      size: 1.4 + Math.random() * 2.6,
      kind: i % 4,        // 0 circle · 1 triangle · 2 diamond · 3 square
      phase: Math.random() * Math.PI * 2,
      drift: 0.0025 + Math.random() * 0.004,
      twinkle: 0.6 + Math.random() * 1.8,
    }));

    const SPRING = 0.055, DAMP = 0.82;

    // Detonate the cloud radially from a centre point, then let the spring reel
    // it back into the (new) shape. This is the "explode the dots" moment.
    // `focused` kicks hardest at the centre and fades out (used for click/tap);
    // otherwise it's a roughly uniform burst (used between morphs).
    const detonate = (cx, cy, power, focused) => {
      if (reduced) return;
      for (const p of parts) {
        const dx = p.x - cx, dy = p.y - cy;
        const d = Math.hypot(dx, dy) || 0.0001;
        let f;
        if (focused) {
          const rad = 0.45;
          if (d > rad) continue;
          f = power * (1 - d / rad);
        } else {
          f = power * (0.6 + Math.random() * 0.7);
        }
        p.vx += (dx / d) * f - (dy / d) * f * 0.25; // a little swirl
        p.vy += (dy / d) * f + (dx / d) * f * 0.25;
      }
    };

    let shapeIdx = -1;
    const setShape = () => {
      shapeIdx = (shapeIdx + 1) % shapes.length;
      const pts = shapes[shapeIdx].pts;
      for (let i = 0; i < count; i++) {
        parts[i].bx = pts[i][0] * 0.92;
        parts[i].by = pts[i][1] * 0.92;
      }
      detonate(0.5, 0.5, 0.07, false); // burst outward, reassemble into the new form
      onShapeRef.current?.(shapes[shapeIdx]);
    };
    setShape();
    const cycle = setInterval(setShape, cycleMs);

    // ---- Pointer interactivity ----
    const pointer = { x: 0, y: 0, active: false };
    const toNorm = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      return [((clientX - rect.left) - ox) / R, ((clientY - rect.top) - oy) / R];
    };
    const onMove = (e) => {
      const t = e.touches ? e.touches[0] : e;
      if (!t) return;
      [pointer.x, pointer.y] = toNorm(t.clientX, t.clientY);
      pointer.active = true;
    };
    const onLeave = () => { pointer.active = false; };
    const onDown = (e) => {
      const t = e.touches ? e.touches[0] : e;
      if (!t) return;
      const [cx, cy] = toNorm(t.clientX, t.clientY);
      detonate(cx, cy, 0.32, true); // click/tap = a sharp local explosion
    };
    if (interactive && !reduced) {
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerleave', onLeave);
      canvas.addEventListener('pointerdown', onDown);
    }

    let t = 0;
    const frame = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);

      // Global pose for the assembled form: slow sway (rotation), bob and breathe.
      const ang = reduced ? 0 : Math.sin(t * 0.22) * 0.16;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const breathe = reduced ? 1 : 1 + Math.sin(t * 0.5) * 0.025;
      const bobX = reduced ? 0 : Math.sin(t * 0.4) * 0.012;
      const bobY = reduced ? 0 : Math.cos(t * 0.33) * 0.016;

      ctx.globalCompositeOperation = 'lighter'; // additive glow on the void
      for (const p of parts) {
        // Re-pose the base target through the live transform.
        const rx = (ca * p.bx - sa * p.by) * breathe;
        const ry = (sa * p.bx + ca * p.by) * breathe;
        p.tx = 0.5 + rx + bobX;
        p.ty = 0.5 + ry + bobY;

        if (reduced) { p.x = p.tx; p.y = p.ty; }
        else {
          // Spring toward target.
          p.vx += (p.tx - p.x) * SPRING;
          p.vy += (p.ty - p.y) * SPRING;
          // Cursor repulsion.
          if (pointer.active) {
            const dx = p.x - pointer.x, dy = p.y - pointer.y;
            const d2 = dx * dx + dy * dy;
            const rad = 0.14;
            if (d2 < rad * rad) {
              const d = Math.sqrt(d2) || 0.0001;
              const f = (1 - d / rad) * 0.02;
              p.vx += (dx / d) * f;
              p.vy += (dy / d) * f;
            }
          }
          p.vx *= DAMP; p.vy *= DAMP;
          p.x += p.vx; p.y += p.vy;
        }

        const wx = reduced ? 0 : Math.sin(t * 1.6 + p.phase) * p.drift;
        const wy = reduced ? 0 : Math.cos(t * 1.3 + p.phase * 1.7) * p.drift;
        const x = ox + (p.x + wx) * R;
        const y = oy + (p.y + wy) * R;

        // Speed-reactive: fast (exploding / cursor-pushed) particles flare brighter
        // and a touch bigger, so the burst reads as energy.
        const speed = reduced ? 0 : Math.min(1, (Math.abs(p.vx) + Math.abs(p.vy)) * 26);
        const tw = reduced ? 0.85 : 0.5 + 0.32 * Math.sin(t * p.twinkle + p.phase);
        const s = p.size * (1 + speed * 0.9);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.min(1, 0.45 + tw * 0.45 + speed * 0.4);

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
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf); clearInterval(cycle);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
    };
  }, [count, cycleMs, interactive]);

  return <canvas ref={ref} className={`${className} block`} aria-hidden="true" />;
}
