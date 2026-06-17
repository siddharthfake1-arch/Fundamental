import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, asArray, fmtMoney } from '../api';
import { useAuth } from '../AuthContext';
import { Avatar, Empty, Spinner, VerifiedBadge } from '../components/ui';

// Index of all listed startups — a denser, institutional view next to Discover's tiles.
export default function Startups() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [mine, setMine] = useState(null);
  const [q, setQ] = useState('');
  const nav = useNavigate();

  useEffect(() => {
    api.get('/api/startups?sort=upvoted').then(setData).catch(() => setData({ startups: [] }));
    if (user.role === 'founder') api.get('/api/startups/mine').then(d => setMine(d.startup)).catch(() => {});
  }, []);

  if (!data) return <Spinner />;
  const list = asArray(data.startups).filter(s => String((s.name || '') + (s.sector || '') + (s.city || '')).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="h-display text-2xl">Startups</h1>
          <p className="text-sm text-mist-400 mt-1">Every listed company, ranked by investor conviction.</p>
        </div>
        <input className="input !w-64" aria-label="Search" placeholder="Search by name, sector, or city" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {user.role === 'founder' && (
        <div className="card p-4 mb-6 flex items-center gap-4 border-gold-500/25">
          {mine ? (
            <>
              <Avatar src={mine.logo} name={mine.name} size={10} square />
              <div className="flex-1">
                <div className="font-semibold text-mist-100">{mine.name}</div>
                <div className="text-xs text-mist-400">Your startup{!mine.video_url && ' — add your pitch to list in Discover'}</div>
              </div>
              <Link to={`/startup/${mine.id}`} className="btn-ghost btn-sm">View profile</Link>
              <button className="btn-primary btn-sm" onClick={() => nav('/settings?tab=startup')}>Manage</button>
            </>
          ) : (
            <>
              <div className="flex-1 text-sm text-mist-300">You haven't set up your startup yet.</div>
              <button className="btn-primary btn-sm" onClick={() => nav('/onboarding')}>Set up startup</button>
            </>
          )}
        </div>
      )}

      {list.length === 0 ? <Empty title="No startups found" /> : (
        <div className="card overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_120px_110px_110px_90px_80px] gap-3 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-mist-500 border-b border-ink-700/60">
            <span>Startup</span><span>Sector</span><span>Stage</span><span>Revenue</span><span>Status</span><span className="text-right">Upvotes</span>
          </div>
          {list.map(s => (
            <Link key={s.id} to={`/startup/${s.id}`}
              className="grid md:grid-cols-[1fr_120px_110px_110px_90px_80px] gap-1 md:gap-3 px-5 py-3.5 items-center border-b border-ink-700/40 last:border-0 hover:bg-ink-850 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar src={s.logo} name={s.name} size={9} square />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-semibold text-mist-100 text-sm">{s.name}{!!s.verified && <VerifiedBadge small />}</div>
                  <div className="text-xs text-mist-500 truncate">{s.one_liner}</div>
                </div>
              </div>
              <span className="text-xs text-mist-300 hidden md:block">{s.sector}</span>
              <span className="text-xs text-mist-300 hidden md:block">{s.stage}</span>
              <span className="text-xs text-mist-200 font-medium tabular-nums hidden md:block">{s.arr ? fmtMoney(s.arr) + ' ARR' : s.mrr ? fmtMoney(s.mrr) + ' MRR' : '—'}</span>
              <span className="hidden md:block">{s.raising_status === 'Actively Raising' ? <span className="chip-green">Raising</span> : <span className="chip">{s.raising_status}</span>}</span>
              <span className="text-sm font-semibold text-gold-300 tabular-nums md:text-right">▲ {s.upvotes}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
