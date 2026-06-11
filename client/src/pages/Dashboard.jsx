import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, timeAgo } from '../api';
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
  return null;
}

function FounderDash() {
  const [d, setD] = useState(null);
  const [an, setAn] = useState(null);
  const toast = useToast();
  const load = () => api.get('/api/dashboard/founder').then(setD).catch(e => toast(e.message, 'error'));
  useEffect(() => {
    load();
    api.get('/api/dashboard/founder/analytics').then(setAn).catch(() => {});
  }, []);
  if (!d) return <Spinner />;

  const act = async (fn) => { try { await fn(); load(); } catch (e) { toast(e.message, 'error'); } };

  return (
    <div className="fade-in space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="h-display text-2xl">Founder Dashboard</h1>
          <p className="text-sm text-mist-400 mt-1">{d.startup ? `Tracking ${d.startup.name}` : 'Set up your startup to start tracking'}</p>
        </div>
        {d.startup && <Link to={`/startup/${d.startup.id}`} className="btn-ghost btn-sm">View Public Profile</Link>}
      </div>

      {/* Profile completion */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="section-title">Profile Completion</span>
          <span className="font-display font-bold text-gold-300 tabular-nums">{d.completion}%</span>
        </div>
        <div className="h-2 bg-ink-700 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-gold-500 to-gold-300 transition-all" style={{ width: d.completion + '%' }} /></div>
        {d.completion < 100 && <div className="text-xs text-mist-400 mt-2">Complete profiles get materially more investor views. Add missing items in <Link to="/settings" className="text-gold-300">Settings</Link>.</div>}
      </div>

      {!d.startup ? (
        <Empty title="No startup yet" sub="Complete onboarding to list your startup in the marketplace." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat label="Startup Views" value={d.views.toLocaleString()} />
            <Stat label="Video Views" value={d.video_views.toLocaleString()} sub="12-min pitch plays" />
            <Stat label="Collateral Requests" value={d.collateral_requests} />
            <Stat label="Upvotes" value={d.upvotes} sub="One per investor" />
            <Stat label="Connection Requests" value={d.connection_requests.length} />
          </div>

          {d.views_trend?.length > 1 && (
            <div className="card p-5">
              <span className="section-title">Views — last 14 days</span>
              <div className="mt-3"><LineChart data={d.views_trend} xKey="d" yKey="c" height={120} format={(v) => v} /></div>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Raise progress tracker */}
            <div className="card p-5">
              <span className="section-title">Raise Progress Tracker</span>
              <div className="mt-4 flex items-center gap-3">
                <span className={d.raise.status === 'Actively Raising' ? 'chip-green' : d.raise.status === 'Round Closing' ? 'chip-gold' : 'chip'}>{d.raise.status}</span>
                {d.raise.amount && <span className="font-display font-bold text-mist-100">{d.raise.amount}</span>}
              </div>
              <div className="mt-4 flex items-center">
                {['Open', 'Conversations', 'Diligence', 'Closing'].map((step, i) => {
                  const idx = d.raise.status === 'Not Raising' ? -1 : d.raise.status === 'Round Closing' ? 3 : Math.min(1 + Math.floor(d.collateral_requests > 0 ? 2 : d.upvotes > 0 ? 1 : 0), 3);
                  return (
                    <div key={step} className="flex-1 flex flex-col items-center gap-1.5 relative">
                      {i > 0 && <div className={`absolute top-[7px] right-1/2 w-full h-0.5 ${i <= idx ? 'bg-gold-400' : 'bg-ink-600'}`} style={{ zIndex: 0 }} />}
                      <span className={`relative z-10 w-4 h-4 rounded-full border-2 ${i <= idx ? 'bg-gold-400 border-gold-400' : 'bg-ink-800 border-ink-500'}`} />
                      <span className={`text-[10px] font-semibold ${i <= idx ? 'text-gold-300' : 'text-mist-500'}`}>{step}</span>
                    </div>
                  );
                })}
              </div>
              <div className="text-xs text-mist-400 mt-4">Toggle your raising status in <Link to="/settings?tab=startup" className="text-gold-300">Startup Settings</Link>.</div>
            </div>

            {/* Pending access requests */}
            <div className="card p-5">
              <span className="section-title">Pending Data Room Requests</span>
              {d.pending_access.length === 0 ? <div className="text-sm text-mist-500 mt-3">No pending requests.</div> : (
                <div className="space-y-2 mt-3">
                  {d.pending_access.map(r => (
                    <div key={r.id} className="flex items-center gap-3 bg-ink-850 border border-ink-700/60 rounded-xl px-3.5 py-2.5">
                      <Link to={`/profile/${r.investor_id}`} className="text-sm font-medium text-mist-100 hover:text-gold-300 truncate">{r.investor_name}</Link>
                      <span className="text-xs text-mist-500 flex-1 truncate">→ {r.title}</span>
                      <button className="btn-primary btn-sm" onClick={() => act(() => api.post(`/api/startups/access-requests/${r.id}/approve`))}>Approve</button>
                      <button className="btn-danger btn-sm" onClick={() => act(() => api.post(`/api/startups/access-requests/${r.id}/reject`))}>Reject</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Founder analytics: who's looking + data room engagement */}
          {an && (an.viewers.length > 0 || an.docs.length > 0) && (
            <div className="grid lg:grid-cols-2 gap-5">
              <div className="card p-5">
                <span className="section-title">Investors Looking at You</span>
                <div className="text-xs text-mist-500 mt-1">Recent profile viewers — your warmest leads.</div>
                {an.viewers.length === 0 ? <div className="text-sm text-mist-500 mt-3">No investor views yet.</div> : (
                  <div className="space-y-2 mt-3">
                    {an.viewers.slice(0, 6).map(v => (
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
              <div className="card p-5">
                <span className="section-title">Data Room Engagement</span>
                <div className="text-xs text-mist-500 mt-1">Which documents investors actually open.</div>
                {an.docs.length === 0 ? <div className="text-sm text-mist-500 mt-3">No documents yet.</div> : (
                  <div className="space-y-2 mt-3">
                    {an.docs.map(doc => (
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
          {d.connection_requests.length > 0 && (
            <div className="card p-5">
              <span className="section-title">Connection Requests</span>
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                {d.connection_requests.map(p => (
                  <div key={p.id} className="flex items-center gap-3 bg-ink-850 border border-ink-700/60 rounded-xl p-3">
                    <Avatar src={p.photo} name={p.name} size={10} />
                    <div className="flex-1 min-w-0">
                      <Link to={`/profile/${p.user_id}`} className="text-sm font-semibold text-mist-100 hover:text-gold-300">{p.name}</Link>
                      <div className="text-xs text-mist-400 truncate">{p.headline}</div>
                    </div>
                    <button className="btn-primary btn-sm" onClick={() => act(() => api.post(`/api/users/connections/${p.id}/accept`))}>Accept</button>
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
  const toast = useToast();
  useEffect(() => { api.get('/api/dashboard/investor').then(setD).catch(e => toast(e.message, 'error')); }, []);
  if (!d) return <Spinner />;

  return (
    <div className="fade-in space-y-5">
      <div>
        <h1 className="h-display text-2xl">Investor Dashboard</h1>
        <p className="text-sm text-mist-400 mt-1">Your pipeline at a glance.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Saved Startups" value={d.watchlist.length} sub="In your watchlist" />
        <Stat label="Requested Access" value={d.requested.length} sub="Data room requests" />
        <Stat label="Approved" value={d.requested.filter(r => r.status === 'approved').length} sub="Documents unlocked" />
        <Stat label="Active Conversations" value={d.active_conversations} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <span className="section-title">Watchlist</span>
            <Link to="/watchlist" className="text-xs text-gold-300 hover:text-gold-200">Open Watchlist →</Link>
          </div>
          {d.watchlist.length === 0 ? <div className="text-sm text-mist-500 mt-3">Save startups from Discover to track them here.</div> : (
            <div className="space-y-2 mt-3">
              {d.watchlist.slice(0, 6).map(s => (
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

        <div className="card p-5">
          <span className="section-title">Requested Access</span>
          {d.requested.length === 0 ? <div className="text-sm text-mist-500 mt-3">No data room requests yet.</div> : (
            <div className="space-y-2 mt-3">
              {d.requested.slice(0, 6).map((r, i) => (
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

      <div className="card p-5">
        <span className="section-title">Suggested Startups</span>
        <div className="text-xs text-mist-500 mt-1">Matched to your sector and stage focus.</div>
        {d.suggested.length === 0 ? <div className="text-sm text-mist-500 mt-3">Nothing new to suggest right now.</div> : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            {d.suggested.map(s => (
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
