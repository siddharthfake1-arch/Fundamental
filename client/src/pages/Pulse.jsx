import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Flame, TrendingUp, Activity, Building2 } from 'lucide-react';
import { api, asArray, asObject } from '../api';
import { Empty, Spinner, Stat } from '../components/ui';

const Bar = ({ pct, color = 'rgb(var(--acc-500))' }) => {
  // Width is a layout animation the CSS reduced-motion rule can't reach — with
  // dozens of bars on screen, honor the preference here in JS.
  const reduced = useReducedMotion();
  return (
    <div className="h-1.5 bg-ink-700/70 rounded-full overflow-hidden flex-1">
      <motion.div initial={reduced ? false : { width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }}
        transition={{ duration: reduced ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] }} className="h-full rounded-full" style={{ background: color }} />
    </div>
  );
};

// Market Pulse — aggregate ecosystem intelligence. No confidential startup data.
export default function Pulse() {
  const [d, setD] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [q, setQ] = useState('');
  // A failed load must end in a retryable error state — not a spinner that
  // keeps spinning long after the toast has faded.
  const load = () => api.get('/api/pulse').then(x => { setLoadErr(null); setD(x); }).catch(e => setLoadErr(e.message));
  useEffect(() => { load(); }, []);
  if (loadErr && !d) {
    return <Empty icon="⚠" title="Couldn't load Market Pulse" sub={loadErr}
      action={<button className="btn-primary btn-sm" onClick={load}>Try again</button>} />;
  }
  if (!d) return <Spinner />;
  const match = (name) => !q || String(name || '').toLowerCase().includes(q.toLowerCase());

  const sectors = asArray(d.sectors);
  const stages = asArray(d.stages);
  const cities = asArray(d.cities);
  const emerging = asArray(d.emerging);
  const totals = asObject(d.totals);

  const maxHeat = Math.max(...sectors.map(s => s.heat), 1);
  const maxStage = Math.max(...stages.map(s => s.c), 1);
  const maxCity = Math.max(...cities.map(c => c.c), 1);
  const maxInterest = Math.max(...sectors.map(s => s.pipeline_adds_30d + s.upvotes_30d), 1);

  return (
    <div className="fade-in space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><Activity className="w-6 h-6 text-gold-400" /> Market Pulse</h1>
          <p className="text-sm text-mist-400 mt-1 page-sub">Live signals from across Fundamental — aggregate trends only, never individual startup data.</p>
        </div>
        <input className="input !w-56" aria-label="Search sectors" placeholder="Search sectors…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Listed Startups" value={totals.startups ?? 0} />
        <Stat label="Open Rounds" value={totals.open_rounds ?? 0} sub="Actively raising" />
        <Stat label="Active Investors" value={totals.investors ?? 0} />
        <Stat label="Connections · 30d" value={totals.connections_30d ?? 0} />
        <Stat label="Founder Updates · 30d" value={totals.updates_30d ?? 0} />
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Sector heat */}
        <div className="card p-5 lg:col-span-3">
          <div className="flex items-center gap-2 mb-1">
            <Flame className="w-4 h-4 text-orange-400" />
            <h2 className="section-title !text-orange-400">Sector Heat</h2>
          </div>
          <p className="text-xs text-mist-500 mb-4">A composite of investor conviction, pipeline adds, views, and open rounds.</p>
          <div className="space-y-3.5">
            {q && sectors.filter(s => match(s.sector)).length === 0 && (
              <p className="text-sm text-mist-500 py-2">No sectors match “{q}”.</p>
            )}
            {sectors.filter(s => match(s.sector)).map((s, i) => (
              <div key={s.sector} className="flex items-center gap-3">
                <span className="w-6 text-xs font-bold text-mist-500 tabular-nums">{i + 1}</span>
                <Link to={`/discover?sector=${encodeURIComponent(s.sector)}`} className="w-20 sm:w-28 shrink-0 text-sm font-semibold text-mist-100 hover:text-gold-300 truncate">{s.sector}</Link>
                <Bar pct={(s.heat / maxHeat) * 100} color={i === 0 ? '#fb923c' : undefined} />
                <span className="text-[11px] text-mist-400 tabular-nums w-24 sm:w-32 text-right shrink-0 leading-tight">
                  {s.startups} listed · {s.raising} raising
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Emerging themes */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h2 className="section-title !text-emerald-400">Emerging Themes</h2>
          </div>
          <p className="text-xs text-mist-500 mb-4">Sectors with the fastest-growing startups right now.</p>
          <div className="space-y-3">
            {emerging.filter(s => match(s.sector)).map(s => (
              <div key={s.sector} className="flex items-center justify-between gap-2 bg-ink-850 border border-ink-700/50 rounded-xl px-4 py-3">
                <span className="text-sm font-semibold text-mist-100 truncate min-w-0">{s.sector}</span>
                <span className="text-sm font-bold text-emerald-400 tabular-nums shrink-0">+{s.avg_growth}% avg MoM</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Investor interest */}
        <div className="card p-5">
          <h2 className="section-title">Investor Interest · 30d</h2>
          <p className="text-xs text-mist-500 mt-1 mb-4">Conviction votes and pipeline adds by sector.</p>
          <div className="space-y-3">
            {[...sectors].filter(s => match(s.sector)).sort((a, b) => (b.pipeline_adds_30d + b.upvotes_30d) - (a.pipeline_adds_30d + a.upvotes_30d)).slice(0, 6).map(s => (
              <div key={s.sector} className="flex items-center gap-3">
                <span className="w-24 text-xs font-medium text-mist-300 truncate">{s.sector}</span>
                <Bar pct={((s.pipeline_adds_30d + s.upvotes_30d) / maxInterest) * 100} color="rgb(var(--acc2-500))" />
                <span className="text-[11px] text-mist-500 tabular-nums w-6 text-right">{s.pipeline_adds_30d + s.upvotes_30d}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stage composition */}
        <div className="card p-5">
          <h2 className="section-title">Stage Composition</h2>
          <p className="text-xs text-mist-500 mt-1 mb-4">Where the ecosystem sits across the funding lifecycle.</p>
          <div className="space-y-3">
            {stages.map(s => (
              <div key={s.stage} className="flex items-center gap-3">
                <span className="w-24 text-xs font-medium text-mist-300">{s.stage}</span>
                <Bar pct={(s.c / maxStage) * 100} color="#34d399" />
                <span className="text-[11px] text-mist-500 tabular-nums w-6 text-right">{s.c}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Geography */}
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gold-400" />
            <h2 className="section-title">Geography</h2>
          </div>
          <p className="text-xs text-mist-500 mt-1 mb-4">Where listed startups are based.</p>
          <div className="space-y-3">
            {cities.map(c => (
              <div key={c.city} className="flex items-center gap-3">
                <Link to={`/discover?geography=${encodeURIComponent(c.city)}`} className="w-24 text-xs font-medium text-mist-300 hover:text-gold-300 truncate">{c.city}</Link>
                <Bar pct={(c.c / maxCity) * 100} color="#a78bfa" />
                <span className="text-[11px] text-mist-500 tabular-nums w-6 text-right">{c.c}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
