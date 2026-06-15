import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Flame, TrendingUp, Activity, Building2 } from 'lucide-react';
import { api } from '../api';
import { Spinner, Stat, useToast } from '../components/ui';

const Bar = ({ pct, color = 'rgb(var(--acc-500))' }) => (
  <div className="h-1.5 bg-ink-700/70 rounded-full overflow-hidden flex-1">
    <motion.div initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="h-full rounded-full" style={{ background: color }} />
  </div>
);

// Market Pulse — aggregate ecosystem intelligence. No confidential startup data.
export default function Pulse() {
  const [d, setD] = useState(null);
  const [q, setQ] = useState('');
  const toast = useToast();
  useEffect(() => { api.get('/api/pulse').then(setD).catch(e => toast(e.message, 'error')); }, []);
  if (!d) return <Spinner />;
  const match = (name) => !q || name.toLowerCase().includes(q.toLowerCase());

  const maxHeat = Math.max(...d.sectors.map(s => s.heat), 1);
  const maxStage = Math.max(...d.stages.map(s => s.c), 1);
  const maxCity = Math.max(...d.cities.map(c => c.c), 1);
  const maxInterest = Math.max(...d.sectors.map(s => s.pipeline_adds_30d + s.upvotes_30d), 1);

  return (
    <div className="fade-in space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="h-display text-2xl flex items-center gap-2"><Activity className="w-6 h-6 text-gold-400" /> Market Pulse</h1>
          <p className="text-sm text-mist-400 mt-1">Live signals from across Fundamental — aggregate trends only, never individual startup data.</p>
        </div>
        <input className="input !w-56" placeholder="Search sectors…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Listed Startups" value={d.totals.startups} />
        <Stat label="Open Rounds" value={d.totals.open_rounds} sub="Actively raising" />
        <Stat label="Active Investors" value={d.totals.investors} />
        <Stat label="Connections · 30d" value={d.totals.connections_30d} />
        <Stat label="Founder Updates · 30d" value={d.totals.updates_30d} />
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Sector heat */}
        <div className="card p-5 lg:col-span-3">
          <div className="flex items-center gap-2 mb-1">
            <Flame className="w-4 h-4 text-orange-400" />
            <span className="section-title !text-orange-400">Sector Heat</span>
          </div>
          <p className="text-xs text-mist-500 mb-4">A composite of investor conviction, pipeline adds, views, and open rounds.</p>
          <div className="space-y-3.5">
            {d.sectors.filter(s => match(s.sector)).map((s, i) => (
              <div key={s.sector} className="flex items-center gap-3">
                <span className="w-6 text-xs font-bold text-mist-500 tabular-nums">{i + 1}</span>
                <Link to={`/discover?sector=${encodeURIComponent(s.sector)}`} className="w-28 text-sm font-semibold text-mist-100 hover:text-gold-300 truncate">{s.sector}</Link>
                <Bar pct={(s.heat / maxHeat) * 100} color={i === 0 ? '#fb923c' : undefined} />
                <span className="text-[11px] text-mist-400 tabular-nums w-32 text-right shrink-0">
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
            <span className="section-title !text-emerald-400">Emerging Themes</span>
          </div>
          <p className="text-xs text-mist-500 mb-4">Sectors with the fastest-growing startups right now.</p>
          <div className="space-y-3">
            {d.emerging.filter(s => match(s.sector)).map(s => (
              <div key={s.sector} className="flex items-center justify-between bg-ink-850 border border-ink-700/50 rounded-xl px-4 py-3">
                <span className="text-sm font-semibold text-mist-100">{s.sector}</span>
                <span className="text-sm font-bold text-emerald-400 tabular-nums">+{s.avg_growth}% avg MoM</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Investor interest */}
        <div className="card p-5">
          <span className="section-title">Investor Interest · 30d</span>
          <p className="text-xs text-mist-500 mt-1 mb-4">Conviction votes and pipeline adds by sector.</p>
          <div className="space-y-3">
            {[...d.sectors].filter(s => match(s.sector)).sort((a, b) => (b.pipeline_adds_30d + b.upvotes_30d) - (a.pipeline_adds_30d + a.upvotes_30d)).slice(0, 6).map(s => (
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
          <span className="section-title">Stage Composition</span>
          <p className="text-xs text-mist-500 mt-1 mb-4">Where the ecosystem sits across the funding lifecycle.</p>
          <div className="space-y-3">
            {d.stages.map(s => (
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
            <span className="section-title">Geography</span>
          </div>
          <p className="text-xs text-mist-500 mt-1 mb-4">Where listed startups are based.</p>
          <div className="space-y-3">
            {d.cities.map(c => (
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
