import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, asArray } from '../api';
import { Avatar, Empty, Spinner, VerifiedBadge, useToast } from '../components/ui';
import { nativeBridge } from '../config';

const SECTORS = ['Fintech', 'Healthtech', 'Edtech', 'Logistics', 'Marketplace', 'SaaS', 'Climate', 'Insurtech', 'Deeptech', 'Consumer'];
const STAGES = ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Growth'];

export default function Network() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'directory';
  const [filters, setFilters] = useState({ role: '', sector: '', stage: '', geography: '', active: false, q: '' });
  const [users, setUsers] = useState(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [conns, setConns] = useState(null);
  const toast = useToast();

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    return p.toString();
  }, [filters]);

  const load = () => {
    api.get('/api/users/network?' + qs).then(d => { setUsers(asArray(d.users)); setTotal(d.total || 0); }).catch(e => toast(e.message, 'error'));
    api.get('/api/users/connections').then(d => setConns({ pending: asArray(d.pending), accepted: asArray(d.accepted) })).catch(() => {});
  };
  useEffect(() => { load(); }, [qs]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const d = await api.get(`/api/users/network?${qs}${qs ? '&' : ''}offset=${users.length}`);
      setUsers(u => [...u, ...asArray(d.users)]);
      setTotal(d.total || 0);
    } catch (e) { toast(e.message, 'error'); } finally { setLoadingMore(false); }
  };

  const set = (k) => (e) => setFilters(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const act = async (fn, ok) => { try { await fn(); nativeBridge.haptic?.('light'); ok && toast(ok, 'success'); load(); } catch (e) { toast(e.message, 'error'); } };

  return (
    <div className="fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="h-display text-2xl">Network</h1>
          <p className="text-sm text-mist-400 mt-1">Founders, investors, angels, and operators. Messaging opens once a connection is accepted.</p>
        </div>
        <div className="flex rounded-xl bg-ink-850 border border-ink-600/60 p-1">
          {[['directory', 'Directory'], ['requests', `Requests${conns?.pending.length ? ` (${conns.pending.length})` : ''}`], ['connections', 'Connections']].map(([t, l]) => (
            <button key={t} onClick={() => setParams({ tab: t })}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${tab === t ? 'bg-ink-700 text-mist-100' : 'text-mist-400 hover:text-mist-200'}`}>{l}</button>
          ))}
        </div>
      </div>

      {tab === 'directory' && (
        <>
          <div className="card p-4 mb-5 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <div className="col-span-2 md:col-span-1"><span className="label">Search</span><input aria-label="Search people" className="input" value={filters.q} onChange={set('q')} placeholder="Name…" /></div>
            <div><span className="label">Role</span>
              <select aria-label="Role filter" className="input" value={filters.role} onChange={set('role')}>
                <option value="">All</option><option value="founder">Founder</option><option value="investor">Investor</option>
              </select></div>
            <div><span className="label">Sector focus</span>
              <select aria-label="Sector focus filter" className="input" value={filters.sector} onChange={set('sector')}><option value="">All</option>{SECTORS.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><span className="label">Stage focus</span>
              <select aria-label="Stage focus filter" className="input" value={filters.stage} onChange={set('stage')}><option value="">All</option>{STAGES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><span className="label">Geography</span><input aria-label="Geography filter" className="input" value={filters.geography} onChange={set('geography')} placeholder="City" /></div>
            <label className="flex items-center gap-2 cursor-pointer pb-2.5">
              <input type="checkbox" checked={filters.active} onChange={set('active')} className="accent-gold-400 w-4 h-4" />
              <span className="text-sm text-mist-300">Active recently</span>
            </label>
          </div>

          {!users ? <Spinner /> : users.length === 0 ? <Empty title="No one matches these filters" sub="Adjust your filters to widen the search." /> : (
            <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.map((u, i) => (
                <motion.div key={u.id} className="card card-hover p-5"
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }}>
                  <Link to={`/profile/${u.id}`} className="flex items-start gap-3.5 group">
                    <Avatar src={u.photo} name={u.name} size={12} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-semibold text-mist-100 text-sm group-hover:text-gold-300 transition-colors">{u.name}{!!u.verified && <VerifiedBadge small />}</div>
                      <div className="text-xs text-mist-400 capitalize mt-0.5">{u.role}{u.city && ` · ${u.city}`}</div>
                      {u.company && <div className="text-xs text-gold-300/80 font-medium mt-0.5 truncate">{u.company}</div>}
                    </div>
                  </Link>
                  {u.headline && <p className="text-xs text-mist-400 mt-3 line-clamp-2">{u.headline}</p>}
                  <div className="flex gap-2 mt-4">
                    {u.connection === 'accepted' ? <span className="chip-green flex-1 justify-center !py-1.5">✓ Connected</span>
                      : u.connection === 'pending' && u.connection_direction === 'incoming' ? (
                        <>
                          <button className="btn-primary btn-sm flex-1" onClick={() => act(() => api.post(`/api/users/connections/${u.connection_id}/accept`), 'Connected')}>Accept</button>
                          <button className="btn-danger btn-sm" onClick={() => act(() => api.post(`/api/users/connections/${u.connection_id}/reject`))}>Reject</button>
                        </>
                      ) : u.connection === 'pending' ? <span className="chip flex-1 justify-center !py-1.5">Pending</span>
                        : u.connection === 'rejected' ? <button className="btn-ghost btn-sm flex-1" onClick={() => act(() => api.post(`/api/users/connect/${u.id}`), 'Connection request sent')}>Connect again</button>
                          : <button className="btn-primary btn-sm flex-1" onClick={() => act(() => api.post(`/api/users/connect/${u.id}`), 'Connection request sent')}>Connect</button>}
                    <button className={`btn-ghost btn-sm ${u.following ? '!text-gold-300 !border-gold-500/40' : ''}`}
                      onClick={() => act(() => api.post(`/api/users/follow/${u.id}`))}>{u.following ? '✓' : 'Follow'}</button>
                  </div>
                </motion.div>
              ))}
            </div>
            {users.length < total && (
              <div className="text-center mt-6">
                <button className="btn-ghost" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : `Load more (${users.length} of ${total})`}
                </button>
              </div>
            )}
            </>
          )}
        </>
      )}

      {tab === 'requests' && (!conns ? <Spinner /> : conns.pending.length === 0 ? (
        <Empty title="No pending requests" sub="Connection requests appear here. Accepting opens messaging both ways." />
      ) : (
        <div className="max-w-2xl space-y-3">
          {conns.pending.map(p => (
            <div key={p.id} className="card p-4 flex items-center gap-4">
              <Avatar src={p.photo} name={p.name} size={12} />
              <div className="flex-1 min-w-0">
                <Link to={`/profile/${p.user_id}`} className="flex items-center gap-1.5 font-semibold text-mist-100 hover:text-gold-300">{p.name}{!!p.verified && <VerifiedBadge small />}</Link>
                <div className="text-xs text-mist-400 capitalize">{p.role}{p.headline && ` — ${p.headline}`}</div>
              </div>
              <button className="btn-primary btn-sm" onClick={() => act(() => api.post(`/api/users/connections/${p.id}/accept`), 'Connected — messaging is now open')}>Accept</button>
              <button className="btn-danger btn-sm" onClick={() => act(() => api.post(`/api/users/connections/${p.id}/reject`))}>Reject</button>
            </div>
          ))}
        </div>
      ))}

      {tab === 'connections' && (!conns ? <Spinner /> : conns.accepted.length === 0 ? (
        <Empty title="No connections yet" sub="Browse the directory and start building your network." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {conns.accepted.map(p => (
            <Link key={p.id} to={`/profile/${p.user_id}`} className="card card-hover p-4 flex items-center gap-3.5">
              <Avatar src={p.photo} name={p.name} size={11} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-semibold text-mist-100 text-sm">{p.name}{!!p.verified && <VerifiedBadge small />}</div>
                <div className="text-xs text-mist-400 capitalize truncate">{p.role}{p.headline && ` — ${p.headline}`}</div>
              </div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
