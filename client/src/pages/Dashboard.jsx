import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, asArray, asObject, timeAgo } from '../api';
import { useAuth } from '../AuthContext';
import { Avatar, Empty, LineChart, Spinner, Stat, VerifiedBadge, useToast } from '../components/ui';

export default function Dashboard() {
  const { user } = useAuth();
  if (user.role === 'admin') return <AdminRedirect />;
  return user.role === 'founder' ? <FounderDash /> : <InvestorDash />;
}

function AdminRedirect() {
  const nav = useNavigate();
  useEffect(() => { nav('/admin'); }, []);
  return <Spinner />; // never a blank frame while the redirect lands
}

function FounderDash() {
  const [d, setD] = useState(null);
  const [an, setAn] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const toast = useToast();
  const load = () => api.get('/api/dashboard/founder')
    .then(x => { setLoadErr(null); setD(x); })
    .catch(e => { if (d) toast(e.message, 'error'); else setLoadErr(e.message); });
  useEffect(() => {
    load();
    api.get('/api/dashboard/founder/analytics').then(setAn).catch(() => {});
  }, []);
  // Per-row busy set so Approve/Reject/Accept can't double-fire mid-flight.
  const [busyKeys, setBusyKeys] = useState(() => new Set());
  if (loadErr && !d) {
    return <Empty icon="⚠" title="Couldn't load your dashboard" sub={loadErr}
      action={<button className="btn-primary btn-sm" onClick={load}>Try again</button>} />;
  }
  if (!d) return <Spinner />;

  const act = async (key, fn) => {
    if (busyKeys.has(key)) return;
    setBusyKeys(s => new Set(s).add(key));
    try { await fn(); await load(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusyKeys(s => { const n = new Set(s); n.delete(key); return n; }); }
  };

  const connectionRequests = asArray(d.connection_requests);
  const pendingAccess = asArray(d.pending_access);
  const interestedInvestors = asArray(d.interested_investors);
  const viewsTrend = asArray(d.views_trend);
  const raise = asObject(d.raise);
  const viewers = asArray(an?.viewers);
  const docs = asArray(an?.docs);

  return (
    <div className="fade-in space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Founder dashboard</h1>
          <p className="text-sm text-mist-400 mt-1">{d.startup ? `Tracking ${d.startup.name}` : 'Set up your startup to begin tracking'}</p>
        </div>
        {d.startup && <Link to={`/startup/${d.startup.id}`} className="btn-ghost btn-sm">View public profile</Link>}
      </div>

      {/* Profile completion */}
      <div className="card p-5 min-w-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="section-title">Profile completion</h2>
          <span className="font-display font-bold text-gold-300 tabular-nums">{d.completion}%</span>
        </div>
        <div className="h-2 bg-ink-700 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-gold-500 to-gold-300 transition-all" style={{ width: d.completion + '%' }} /></div>
        {d.completion < 100 && <div className="text-xs text-mist-400 mt-2">A complete profile draws more investor views. Add what's missing in <Link to="/settings" className="text-gold-300">Settings</Link>.</div>}
      </div>

      {!d.startup ? (
        <Empty title="No startup yet" sub="Finish onboarding to list your startup on Fundamental." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            <Stat label="Startup views" value={(d.views ?? 0).toLocaleString()} />
            <Stat label="Video views" value={(d.video_views ?? 0).toLocaleString()} sub="Pitch plays" />
            <Stat label="Followers" value={d.followers ?? 0} sub="Tracking your startup" />
            <Stat label="Interest" value={d.interest_count ?? 0} sub="Interested investors" />
            <Stat label="Collateral requests" value={d.collateral_requests ?? 0} />
            <Stat label="Upvotes" value={d.upvotes ?? 0} sub="One per investor" />
            <Stat label="Connection requests" value={connectionRequests.length} />
          </div>

          {interestedInvestors.length > 0 && (
            <div className="card p-5 min-w-0">
              <h2 className="section-title">Investors interested in you</h2>
              <div className="text-xs text-mist-500 mt-1">These investors signaled interest — reach out while it's fresh.</div>
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                {interestedInvestors.map(v => (
                  <div key={v.id} className="flex items-center gap-3 bg-ink-850 border border-ink-700/50 rounded-xl px-3.5 py-2.5">
                    <Avatar src={v.photo} name={v.name} size={9} />
                    <div className="flex-1 min-w-0">
                      <Link to={`/profile/${v.id}`} className="flex items-center gap-1.5 text-sm font-semibold text-mist-100 hover:text-gold-300">
                        {v.name}{!!v.verified && <VerifiedBadge small />}
                      </Link>
                      <div className="text-[11px] text-mist-500 truncate">{v.fund || v.headline} · {timeAgo(v.created_at)}</div>
                    </div>
                    <span className="chip-green">Interested</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewsTrend.length > 1 && (
            <div className="card p-5 min-w-0">
              <h2 className="section-title">Views — last 14 days</h2>
              <div className="mt-3"><LineChart data={viewsTrend} xKey="d" yKey="c" height={120} format={(v) => v} /></div>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Raise progress tracker */}
            <div className="card p-5 min-w-0">
              <h2 className="section-title">Raise progress</h2>
              <div className="mt-4 flex items-center gap-3">
                <span className={raise.status === 'Actively Raising' ? 'chip-green' : raise.status === 'Round Closing' ? 'chip-gold' : 'chip'}>{raise.status}</span>
                {raise.amount && <span className="font-display font-bold text-mist-100">{raise.amount}</span>}
              </div>
              <div className="mt-4 flex items-center">
                {['Open', 'Conversations', 'Diligence', 'Closing'].map((step, i) => {
                  const idx = raise.status === 'Not Raising' ? -1 : raise.status === 'Round Closing' ? 3 : Math.min(1 + Math.floor(d.collateral_requests > 0 ? 2 : d.upvotes > 0 ? 1 : 0), 3);
                  return (
                    <div key={step} className="flex-1 flex flex-col items-center gap-1.5 relative">
                      {i > 0 && <div className={`absolute top-[7px] right-1/2 w-full h-0.5 ${i <= idx ? 'bg-gold-400' : 'bg-ink-600'}`} style={{ zIndex: 0 }} />}
                      <span className={`relative z-10 w-4 h-4 rounded-full border-2 ${i <= idx ? 'bg-gold-400 border-gold-400' : 'bg-ink-800 border-ink-500'}`} />
                      <span className={`text-[10px] font-semibold ${i <= idx ? 'text-gold-300' : 'text-mist-500'}`}>{step}</span>
                    </div>
                  );
                })}
              </div>
              <div className="text-xs text-mist-400 mt-4">Update your raise status in <Link to="/settings?tab=startup" className="text-gold-300">Startup settings</Link>.</div>
            </div>

            {/* Pending access requests */}
            <div className="card p-5 min-w-0">
              <h2 className="section-title">Pending data room requests</h2>
              {pendingAccess.length === 0 ? <div className="text-sm text-mist-500 mt-3">No pending requests.</div> : (
                <div className="space-y-2 mt-3">
                  {pendingAccess.map(r => (
                    <div key={r.id} className="flex items-center gap-3 bg-ink-850 border border-ink-700/60 rounded-xl px-3.5 py-2.5">
                      <Link to={`/profile/${r.investor_id}`} className="text-sm font-medium text-mist-100 hover:text-gold-300 truncate">{r.investor_name}</Link>
                      <span className="text-xs text-mist-500 flex-1 truncate">→ {r.title}</span>
                      <button className="btn-primary btn-sm" disabled={busyKeys.has(`a${r.id}`)} onClick={() => act(`a${r.id}`, () => api.post(`/api/startups/access-requests/${r.id}/approve`))}>Approve</button>
                      <button className="btn-danger btn-sm" disabled={busyKeys.has(`a${r.id}`)} onClick={() => act(`a${r.id}`, () => api.post(`/api/startups/access-requests/${r.id}/reject`))}>Reject</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Founder analytics: who's looking + data room engagement */}
          {an && (viewers.length > 0 || docs.length > 0) && (
            <div className="grid lg:grid-cols-2 gap-5">
              <div className="card p-5 min-w-0">
                <h2 className="section-title">Investors looking at you</h2>
                <div className="text-xs text-mist-500 mt-1">Investors who recently viewed your profile.</div>
                {viewers.length === 0 ? <div className="text-sm text-mist-500 mt-3">No investor views yet.</div> : (
                  <div className="space-y-2 mt-3">
                    {viewers.slice(0, 6).map(v => (
                      <div key={v.id} className="flex items-center gap-3 bg-ink-850 border border-ink-700/50 rounded-xl px-3.5 py-2.5">
                        <Avatar src={v.photo} name={v.name} size={9} />
                        <div className="flex-1 min-w-0">
                          <Link to={`/profile/${v.id}`} className="flex items-center gap-1.5 text-sm font-semibold text-mist-100 hover:text-gold-300">
                            {v.name}{!!v.verified && <VerifiedBadge small />}
                          </Link>
                          <div className="text-[11px] text-mist-500 truncate">{v.fund || v.headline} · viewed {v.views}× · {timeAgo(v.last_view)}</div>
                        </div>
                        {v.connected ? <span className="chip-green">Connected</span> : <span className="chip">Lead</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="card p-5 min-w-0">
                <h2 className="section-title">Data room engagement</h2>
                <div className="text-xs text-mist-500 mt-1">Which documents investors are opening.</div>
                {docs.length === 0 ? <div className="text-sm text-mist-500 mt-3">No documents yet.</div> : (
                  <div className="space-y-2 mt-3">
                    {docs.map(doc => (
                      <div key={doc.id} className="flex items-center gap-3 bg-ink-850 border border-ink-700/50 rounded-xl px-3.5 py-2.5">
                        <span className="chip-blue shrink-0">{doc.type}</span>
                        <span className="text-sm text-mist-100 flex-1 truncate">{doc.title}</span>
                        <span className="text-[11px] text-mist-400 tabular-nums shrink-0">{doc.downloads} views · {doc.requests} requests</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Connection requests */}
          {connectionRequests.length > 0 && (
            <div className="card p-5 min-w-0">
              <h2 className="section-title">Connection requests</h2>
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                {connectionRequests.map(p => (
                  <div key={p.id} className="flex items-center gap-3 bg-ink-850 border border-ink-700/60 rounded-xl p-3">
                    <Avatar src={p.photo} name={p.name} size={10} />
                    <div className="flex-1 min-w-0">
                      <Link to={`/profile/${p.user_id}`} className="text-sm font-semibold text-mist-100 hover:text-gold-300">{p.name}</Link>
                      <div className="text-xs text-mist-400 truncate">{p.headline}</div>
                    </div>
                    <button className="btn-primary btn-sm" disabled={busyKeys.has(`c${p.id}`)} onClick={() => act(`c${p.id}`, () => api.post(`/api/users/connections/${p.id}/accept`))}>Accept</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function InvestorDash() {
  const [d, setD] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const load = () => api.get('/api/dashboard/investor').then(x => { setLoadErr(null); setD(x); }).catch(e => setLoadErr(e.message));
  useEffect(() => { load(); }, []);
  if (loadErr && !d) {
    return <Empty icon="⚠" title="Couldn't load your dashboard" sub={loadErr}
      action={<button className="btn-primary btn-sm" onClick={load}>Try again</button>} />;
  }
  if (!d) return <Spinner />;

  const watchlist = asArray(d.watchlist);
  const requested = asArray(d.requested);
  const suggested = asArray(d.suggested);

  return (
    <div className="fade-in space-y-5">
      <div>
        <h1 className="page-title">Investor dashboard</h1>
        <p className="text-sm text-mist-400 mt-1">Your pipeline at a glance.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Saved startups" value={watchlist.length} sub="In your pipeline" />
        <Stat label="Requested access" value={requested.length} sub="Data room requests" />
        <Stat label="Approved" value={requested.filter(r => r.status === 'approved').length} sub="Data rooms unlocked" />
        <Stat label="Active conversations" value={d.active_conversations ?? 0} />
        <Stat label="Interests sent" value={d.interests_count ?? 0} sub="Founders notified" />
        <Stat label="Shared with you" value={d.shared_count ?? 0} sub="By co-investors" />
      </div>
      {d.shared_count > 0 && (
        <div className="text-xs text-mist-400 -mt-2">Co-investors shared {d.shared_count} deal{d.shared_count !== 1 ? 's' : ''} with you — find {d.shared_count !== 1 ? 'them' : 'it'} in your <Link to="/watchlist" className="text-gold-300 hover:text-gold-200">Pipeline →</Link></div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-5 min-w-0">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Watchlist</h2>
            <Link to="/watchlist" className="text-xs text-gold-300 hover:text-gold-200">Open pipeline →</Link>
          </div>
          {watchlist.length === 0 ? <div className="text-sm text-mist-500 mt-3">Save startups from Discover to track them here.</div> : (
            <div className="space-y-2 mt-3">
              {watchlist.slice(0, 6).map(s => (
                <Link key={s.id} to={`/startup/${s.id}`} className="flex items-center gap-3 bg-ink-850 border border-ink-700/60 rounded-xl p-3 hover:border-ink-500 transition-colors">
                  <Avatar src={s.logo} name={s.name} size={9} square />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-mist-100">{s.name}</div>
                    <div className="text-xs text-mist-400">{s.sector} · {s.stage}</div>
                  </div>
                  <span className="chip">{s.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5 min-w-0">
          <h2 className="section-title">Requested access</h2>
          {requested.length === 0 ? <div className="text-sm text-mist-500 mt-3">No data room requests yet.</div> : (
            <div className="space-y-2 mt-3">
              {requested.slice(0, 6).map((r, i) => (
                <Link key={i} to={`/startup/${r.startup_id}`} className="flex items-center gap-3 bg-ink-850 border border-ink-700/60 rounded-xl p-3 hover:border-ink-500 transition-colors">
                  <Avatar src={r.logo} name={r.startup_name} size={9} square />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-mist-100 truncate">{r.title}</div>
                    <div className="text-xs text-mist-400">{r.startup_name} · {timeAgo(r.created_at)}</div>
                  </div>
                  <span className={r.status === 'approved' ? 'chip-green' : r.status === 'pending' ? 'chip-gold' : 'chip-red'}>{r.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5 min-w-0">
        <h2 className="section-title">Suggested startups</h2>
        <div className="text-xs text-mist-500 mt-1">Matched to your sector and stage focus.</div>
        {suggested.length === 0 ? <div className="text-sm text-mist-500 mt-3">No new suggestions right now.</div> : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            {suggested.map(s => (
              <Link key={s.id} to={`/startup/${s.id}`} className="bg-ink-850 border border-ink-700/60 rounded-xl p-4 hover:border-gold-500/40 transition-colors">
                <div className="flex items-center gap-3">
                  <Avatar src={s.logo} name={s.name} size={10} square />
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-mist-100">{s.name}{!!s.verified && <VerifiedBadge small />}</div>
                    <div className="text-xs text-mist-400">{s.sector} · {s.stage}</div>
                  </div>
                </div>
                <p className="text-xs text-mist-400 mt-2.5 line-clamp-2">{s.one_liner}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
