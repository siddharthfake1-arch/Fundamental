import { useRef, useState } from 'react';

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function VideoPlayer({ src, chapters = [], onFirstPlay, views }) {
  const ref = useRef();
  const [speed, setSpeed] = useState(1);
  const [active, setActive] = useState(-1);
  const [started, setStarted] = useState(false);

  const seek = (t, i) => {
    if (!ref.current) return;
    ref.current.currentTime = t;
    ref.current.play();
    setActive(i);
  };

  const changeSpeed = () => {
    const speeds = [1, 1.25, 1.5, 1.75, 2];
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(next);
    if (ref.current) ref.current.playbackRate = next;
  };

  return (
    <div>
      <div className="relative rounded-xl overflow-hidden border border-ink-600/60 bg-black">
        <video
          ref={ref}
          src={src}
          controls
          playsInline
          preload="metadata"
          className="w-full aspect-video"
          onPlay={() => { if (!started) { setStarted(true); onFirstPlay && onFirstPlay(); } }}
          onTimeUpdate={(e) => {
            const t = e.target.currentTime;
            let idx = -1;
            chapters.forEach((c, i) => { if (t >= c.t) idx = i; });
            setActive(idx);
          }}
        />
      </div>
      <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
        <div className="text-xs text-mist-400">{views != null && <span className="font-medium text-mist-300">{views.toLocaleString()} views</span>}</div>
        <button onClick={changeSpeed} className="btn-ghost btn-sm tabular-nums" title="Playback speed">{speed}× speed</button>
      </div>
      {chapters.length > 0 && (
        <div className="mt-3">
          <div className="label">Chapters</div>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {chapters.map((c, i) => (
              <button key={i} onClick={() => seek(c.t, i)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-colors
                  ${active === i ? 'border-gold-500/60 bg-gold-500/10 text-gold-200' : 'border-ink-600/70 bg-ink-850 text-mist-300 hover:border-ink-500'}`}>
                <div className="text-[10px] tabular-nums opacity-70">{fmt(c.t)}</div>
                <div className="text-xs font-medium whitespace-nowrap">{c.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
