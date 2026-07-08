import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api, asArray, timeAgo } from '../api';
import { useAuth } from '../AuthContext';
import { Empty, LineChart, Spinner, Stat, useConfirm, useToast } from '../components/ui';

const TAB_KEYS = ['analytics', 'users', 'startups', 'communities', 'content', 'reports', 'audit', 'errors'];

export default function Admin() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  // Deep-linkable tab (e.g. the "Community Review" notification links to ?tab=communities).
  const tab = TAB_KEYS.includes(params.get('tab')) ? params.get('tab') : 'analytics';
  const setTab = (t) => setParams({ tab: t });
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;

  const tabs = [['analytics', 'Platform analytics'], ['users', 'Verify users'], ['startups', 'Verify startups'], ['communities', 'Communities'], ['content', 'Moderate content'], ['reports', 'Reports'], ['audit', 'Audit log'], ['errors', 'Errors']];
  return (
    <div className="fade-in">
      <h1 className="page-title mb-1">Admin</h1>
      <p className="text-sm text-mist-400 mb-5">Verification, moderation, and platform health.</p>
      <div className="flex gap-1 mb-6 overflow-x-auto rounded-xl bg-ink-850 border border-ink-600/60 p-1 w-fit max-w-full">
        {tabs.map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${tab === t ? 'bg-ink-700 text-mist-100' : 'text-mist-400 hover:text-mist-200'}`}>{l}</button>
        ))}
      </div>
      {tab === 'analytics' && <Analytics />}
      {tab === 'users' && <Users />}
      {tab === 'startups' && <StartupsAdmin />}
      {tab === 'communities' && <CommunitiesAdmin />}
      {tab === 'content' && <Content />}
      {tab === 'reports' && <Reports />}
      {tab === 'audit' && <AuditLog />}
      {tab === 'errors' && <ClientErrors />}
    </div>
  );
}

// Failed sub-tab loads must say so and offer a retry — never an infinite spinner.
function LoadError({ msg, onRetry }) {
  return (
    <div className="card p-10 text-center fade-in">
      <div className="h-display text-base">Couldn't load this tab</div>
      <div className="text-sm text-mist-400 mt-1.5">{msg}</div>
      <button className="btn-ghost btn-sm mt-4" onClick={onRetry}>Retry</button>
    </div>
  );
}

function Analytics() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.get('/api/admin/overview').then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <Empty title="Couldn't load analytics" sub={err} />;
  if (!d) return <Spinner />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total users" value={d.users} sub={`${d.founders} founders · ${d.investors} investors`} />
        <Stat label="Startups listed" value={d.startups} />
        <Stat label="Connections made" value={d.connections} />
        <Stat label="Open reports" value={d.open_reports} />
        <Stat label="Posts" value={d.posts} />
        <Stat label="Messages sent" value={d.messages} />
        <Stat label="Total upvotes" value={d.upvotes} />
      </div>
      {d.signups_trend?.length > 1 && (
        <div className="card p-5">
          <span className="section-title">Signups</span>
          <div className="mt-3"><LineChart data={d.signups_trend} xKey="d" yKey="c" height={120} format={(v) => v} /></div>
        </div>
      )}
    </div>
  );
}

function Users() {
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState('');
  const toast = useToast();
  const confirm = useConfirm();
  const [loadErr, setLoadErr] = useState(null);
  const load = () => api.get('/api/admin/users').then(d => { setLoadErr(null); setUsers(asArray(d.users)); }).catch(e => setLoadErr(e.message));
  useEffect(() => { load(); }, []);
  if (loadErr && !users) return <LoadError msg={loadErr} onRetry={load} />;
  if (!users) return <Spinner />;
  const shown = users.filter(u => String((u.name || '') + ' ' + (u.email || '') + ' ' + (u.role || '') + ' ' + (u.city || '')).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <input className="input !w-72 mb-4" aria-label="Search" placeholder="Search users by name, email, role…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mist-500 border-b border-ink-700/60">
          {['Name', 'Email', 'Role', 'City', 'Joined', 'Status', 'Actions'].map(h => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}
        </tr></thead>
        <tbody>
          {shown.map(u => (
            <tr key={u.id} className="border-b border-ink-700/40 last:border-0 hover:bg-ink-850">
              <td className="px-4 py-3"><Link to={`/profile/${u.id}`} className="font-medium text-mist-100 hover:text-gold-300">{u.name}</Link></td>
              <td className="px-4 py-3 text-mist-400">{u.email}</td>
              <td className="px-4 py-3 capitalize text-mist-300">{u.role}</td>
              <td className="px-4 py-3 text-mist-400">{u.city || '—'}</td>
              <td className="px-4 py-3 text-mist-500 text-xs">{timeAgo(u.created_at)}</td>
              <td className="px-4 py-3">
                {u.verified === 1 && <span className="chip-blue mr-1">Verified</span>}
                {u.verified === 2 && <span className="chip-gold mr-1">Enhanced</span>}
                {u.verified === 3 && <span className="chip mr-1 !border-violet-500/40 !text-violet-400">Institution</span>}
                {u.role === 'investor' && (u.investor_approved ? <span className="chip-green mr-1">Approved</span> : <span className="chip mr-1">Pending</span>)}
                {u.status === 'suspended' && <span className="chip-red mr-1">Suspended</span>}
                {!!u.flagged && <span className="chip-red">Flagged</span>}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2 flex-wrap">
                  <button className="btn-ghost btn-sm" title="Cycle: None → Verified → Enhanced → Institution"
                    onClick={async () => { await api.post(`/api/admin/verify-user/${u.id}`); load(); toast('Verification tier updated', 'success'); }}>
                    Tier ↻
                  </button>
                  {u.role === 'investor' && (
                    <button className="btn-ghost btn-sm" onClick={async () => { const r = await api.post(`/api/admin/approve-investor/${u.id}`); load(); toast(r.investor_approved ? 'Investor approved' : 'Approval revoked', 'success'); }}>
                      {u.investor_approved ? 'Revoke' : 'Approve'}
                    </button>
                  )}
                  <button className="btn-ghost btn-sm" onClick={async () => { if (u.status !== 'suspended' && !await confirm({ title: `Suspend ${u.name}?`, body: 'They will be signed out immediately and blocked until reinstated. Their startup and content disappear from the platform.', danger: true, confirmLabel: 'Suspend' })) return; const r = await api.post(`/api/admin/suspend-user/${u.id}`); load(); toast(r.status === 'suspended' ? 'Account suspended' : 'Account reinstated', 'success'); }}>
                    {u.status === 'suspended' ? 'Reinstate' : 'Suspend'}
                  </button>
                  <button className="btn-danger btn-sm" onClick={async () => { if (!u.flagged && !await confirm({ title: `Flag ${u.name} as fraudulent?`, body: 'They will be blocked from the platform until unflagged.', danger: true, confirmLabel: 'Flag' })) return; await api.post(`/api/admin/flag-user/${u.id}`); load(); }}>
                    {u.flagged ? 'Unflag' : 'Flag'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function StartupsAdmin() {
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const toast = useToast();
  const confirm = useConfirm();
  const [loadErr, setLoadErr] = useState(null);
  const load = () => api.get('/api/admin/startups').then(d => { setLoadErr(null); setList(asArray(d.startups)); }).catch(e => setLoadErr(e.message));
  useEffect(() => { load(); }, []);
  if (loadErr && !list) return <LoadError msg={loadErr} onRetry={load} />;
  if (!list) return <Spinner />;
  const shown = list.filter(s => String((s.name || '') + ' ' + (s.sector || '') + ' ' + (s.stage || '')).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <input className="input !w-72 mb-4" aria-label="Search" placeholder="Search startups by name, sector, stage…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mist-500 border-b border-ink-700/60">
          {['Startup', 'Sector', 'Stage', 'Pitch Video', 'Views', 'Status', 'Action'].map(h => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}
        </tr></thead>
        <tbody>
          {shown.map(s => (
            <tr key={s.id} className="border-b border-ink-700/40 last:border-0 hover:bg-ink-850">
              <td className="px-4 py-3"><Link to={`/startup/${s.id}`} className="font-medium text-mist-100 hover:text-gold-300">{s.name}</Link></td>
              <td className="px-4 py-3 text-mist-300">{s.sector}</td>
              <td className="px-4 py-3 text-mist-300">{s.stage}</td>
              <td className="px-4 py-3">{s.video_url ? <span className="chip-green">✓ Uploaded</span> : <span className="chip-red">Missing — unlisted</span>}</td>
              <td className="px-4 py-3 text-mist-400 tabular-nums">{s.views}</td>
              <td className="px-4 py-3">
                {s.verified === 0 && <span className="chip">Unverified</span>}
                {s.verified === 1 && <span className="chip-blue">Verified</span>}
                {s.verified === 2 && <span className="chip-gold">Enhanced</span>}
                {s.verified === 3 && <span className="chip !border-violet-500/40 !text-violet-400">Institution</span>}
                {!!s.hidden && <span className="chip-red ml-1">Hidden</span>}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button className="btn-ghost btn-sm" title="Cycle verification tier"
                    onClick={async () => { await api.post(`/api/admin/verify-startup/${s.id}`); load(); toast('Tier updated', 'success'); }}>
                    Tier ↻
                  </button>
                  <button className="btn-ghost btn-sm" onClick={async () => { if (!s.hidden && !await confirm({ title: `Hide ${s.name}?`, body: 'It and its documents will be removed from the marketplace until restored.', danger: true, confirmLabel: 'Hide' })) return; const r = await api.post(`/api/admin/hide-startup/${s.id}`); load(); toast(r.hidden ? 'Startup hidden' : 'Startup restored', 'success'); }}>
                    {s.hidden ? 'Unhide' : 'Hide'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function Content() {
  const [posts, setPosts] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();
  const [loadErr, setLoadErr] = useState(null);
  const load = () => api.get('/api/admin/posts').then(d => { setLoadErr(null); setPosts(asArray(d.posts)); }).catch(e => setLoadErr(e.message));
  useEffect(() => { load(); }, []);
  if (loadErr && !posts) return <LoadError msg={loadErr} onRetry={load} />;
  if (!posts) return <Spinner />;
  return posts.length === 0 ? <Empty title="No content to review" /> : (
    <div className="space-y-3 max-w-3xl">
      {posts.map(p => (
        <div key={p.id} className={`card p-4 flex gap-4 items-start ${p.removed ? 'opacity-50' : ''}`}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-mist-100">{p.author}</span>
              <span className="chip">{p.type}</span>
              {!!p.removed && <span className="chip-red">Removed</span>}
              <span className="text-[11px] text-mist-500">{timeAgo(p.created_at)}</span>
            </div>
            <p className="text-sm text-mist-300 mt-1.5 line-clamp-3">{p.text}</p>
          </div>
          <button className={p.removed ? 'btn-ghost btn-sm' : 'btn-danger btn-sm'}
            onClick={async () => { if (!p.removed && !await confirm({ title: 'Remove this post from the feed?', danger: true, confirmLabel: 'Remove' })) return; await api.post(`/api/admin/posts/${p.id}/remove`); load(); toast(p.removed ? 'Post restored' : 'Post removed', 'success'); }}>
            {p.removed ? 'Restore' : 'Remove'}
          </button>
        </div>
      ))}
    </div>
  );
}

function Reports() {
  const [reports, setReports] = useState(null);
  const toast = useToast();
  const [loadErr, setLoadErr] = useState(null);
  const load = () => api.get('/api/admin/reports').then(d => { setLoadErr(null); setReports(asArray(d.reports)); }).catch(e => setLoadErr(e.message));
  useEffect(() => { load(); }, []);
  if (loadErr && !reports) return <LoadError msg={loadErr} onRetry={load} />;
  if (!reports) return <Spinner />;
  return reports.length === 0 ? <Empty title="No reports" sub="User reports of fraudulent or inappropriate activity appear here." /> : (
    <div className="space-y-3 max-w-3xl">
      {reports.map(r => (
        <div key={r.id} className="card p-4 flex gap-4 items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={r.status === 'open' ? 'chip-red' : 'chip'}>{r.status}</span>
              <span className="text-sm font-semibold text-mist-100 capitalize">{r.target_type} #{r.target_id}</span>
              <span className="text-[11px] text-mist-500">reported by {r.reporter_name} · {timeAgo(r.created_at)}</span>
            </div>
            <p className="text-sm text-mist-300 mt-1.5">{r.reason}</p>
          </div>
          {r.status === 'open' && (
            <div className="flex gap-2">
              <button className="btn-primary btn-sm" onClick={async () => { await api.post(`/api/admin/reports/${r.id}/resolve`); load(); toast('Resolved', 'success'); }}>Resolve</button>
              <button className="btn-ghost btn-sm" onClick={async () => { await api.post(`/api/admin/reports/${r.id}/dismiss`); load(); }}>Dismiss</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CommunitiesAdmin() {
  const [list, setList] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();
  const [loadErr, setLoadErr] = useState(null);
  const load = () => api.get('/api/admin/communities').then(d => { setLoadErr(null); setList(asArray(d.communities)); }).catch(e => setLoadErr(e.message));
  useEffect(() => { load(); }, []);
  if (loadErr && !list) return <LoadError msg={loadErr} onRetry={load} />;
  if (!list) return <Spinner />;
  return list.length === 0 ? <Empty title="No communities yet" sub="Member-submitted communities will appear here for review." /> : (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mist-500 border-b border-ink-700/60">
          {['Community', 'Type', 'Created by', 'Members', 'Posts', 'Status', 'Actions'].map(h => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}
        </tr></thead>
        <tbody>
          {list.map(c => (
            <tr key={c.id} className="border-b border-ink-700/40 last:border-0 hover:bg-ink-850">
              <td className="px-4 py-3">
                <Link to={`/communities/${c.slug}`} className="font-medium text-mist-100 hover:text-gold-300">{c.name}</Link>
                {c.description && <div className="text-[11px] text-mist-500 max-w-xs truncate">{c.description}</div>}
              </td>
              <td className="px-4 py-3 capitalize text-mist-300">{c.kind}</td>
              <td className="px-4 py-3 text-mist-400">{c.creator_name || '—'}</td>
              <td className="px-4 py-3 text-mist-400 tabular-nums">{c.members}</td>
              <td className="px-4 py-3 text-mist-400 tabular-nums">{c.posts}</td>
              <td className="px-4 py-3">
                {c.status === 'pending' ? <span className="chip-gold">Pending</span> : <span className="chip-green">Live</span>}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  {c.status === 'pending' && (
                    <button className="btn-primary btn-sm" onClick={async () => { await api.post(`/api/admin/communities/${c.id}/approve`); load(); toast('Community approved — now live', 'success'); }}>Approve</button>
                  )}
                  <button className="btn-danger btn-sm" onClick={async () => {
                    if (!await confirm({ title: `${c.status === 'pending' ? 'Decline' : 'Delete'} "${c.name}"?`, body: c.status === 'pending' ? 'The creator will be notified.' : 'This removes the community and all its discussions.', danger: true, confirmLabel: c.status === 'pending' ? 'Decline' : 'Delete' })) return;
                    await api.post(`/api/admin/communities/${c.id}/delete`); load(); toast(c.status === 'pending' ? 'Community declined' : 'Community deleted', 'success');
                  }}>{c.status === 'pending' ? 'Decline' : 'Delete'}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Read-only browser for client-side render errors captured from the ErrorBoundary.
function ClientErrors() {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null); // id of the expanded row
  useEffect(() => { api.get('/api/admin/client-errors').then(setD).catch(() => setD({ errors: [], total: 0 })); }, []);
  if (!d) return <Spinner />;
  const errors = asArray(d.errors);
  return errors.length === 0 ? <Empty title="No client errors" sub="Render crashes captured from users' browsers will appear here." /> : (
    <div className="space-y-2 max-w-3xl">
      <p className="text-xs text-mist-500">{d.total} captured · showing the {errors.length} most recent. Auto-pruned after 30 days.</p>
      {errors.map(e => (
        <div key={e.id} className="card p-4">
          <button className="w-full text-left" onClick={() => setOpen(o => o === e.id ? null : e.id)}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="chip-red">error</span>
              <code className="text-xs text-mist-300">{e.path || '—'}</code>
              <span className="text-[11px] text-mist-500 ml-auto">{e.user_name ? `${e.user_name} · ` : ''}{timeAgo(e.created_at)}</span>
            </div>
            <p className="text-sm text-mist-100 mt-1.5 break-words">{e.message || '(no message)'}</p>
          </button>
          {open === e.id && (
            <div className="mt-3 pt-3 border-t border-ink-700/50 space-y-2">
              {e.component_stack && (
                <div><div className="text-[11px] font-semibold uppercase tracking-wider text-mist-500 mb-1">Component stack</div>
                  <pre className="text-[11px] text-mist-400 whitespace-pre-wrap break-words bg-ink-900 rounded-lg p-2.5 max-h-48 overflow-auto">{e.component_stack}</pre></div>
              )}
              {e.stack && (
                <div><div className="text-[11px] font-semibold uppercase tracking-wider text-mist-500 mb-1">Stack</div>
                  <pre className="text-[11px] text-mist-400 whitespace-pre-wrap break-words bg-ink-900 rounded-lg p-2.5 max-h-48 overflow-auto">{e.stack}</pre></div>
              )}
              <div className="text-[11px] text-mist-500 break-words">{e.user_agent || '—'}{e.ip ? ` · ${e.ip}` : ''}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Read-only browser for the append-only audit trail: admin actions, moderation,
// verification, data-room access decisions, blocks, and password resets.
function AuditLog() {
  const [d, setD] = useState(null);
  const [action, setAction] = useState('');
  const load = (a = action) => api.get(`/api/admin/audit-logs${a ? `?action=${encodeURIComponent(a)}` : ''}`)
    .then(setD).catch(() => setD({ logs: [], total: 0, actions: [] }));
  useEffect(() => { load(); }, [action]);
  if (!d) return <Spinner />;
  const logs = asArray(d.logs);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <select className="input !w-auto !py-2 !text-xs" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
          <option value="">All actions</option>
          {asArray(d.actions).map(a => <option key={a}>{a}</option>)}
        </select>
        <span className="text-xs text-mist-500">{d.total} entries · append-only, never edited by app code</span>
      </div>
      {logs.length === 0 ? <Empty title="No audit entries" sub="Sensitive actions are recorded here as they happen." /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mist-500 border-b border-ink-700/60">
              {['When', 'Actor', 'Action', 'Target', 'Detail', 'IP'].map(h => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b border-ink-700/40 last:border-0 hover:bg-ink-850">
                  <td className="px-4 py-2.5 text-mist-500 text-xs whitespace-nowrap">{timeAgo(l.created_at)}</td>
                  <td className="px-4 py-2.5 text-mist-300">{l.actor_name || (l.actor_id ? `#${l.actor_id}` : 'system')}</td>
                  <td className="px-4 py-2.5"><code className="text-xs text-gold-300">{l.action}</code></td>
                  <td className="px-4 py-2.5 text-mist-400 text-xs">{l.target_type ? `${l.target_type} #${l.target_id ?? ''}` : '—'}</td>
                  <td className="px-4 py-2.5 text-mist-400 text-xs max-w-[220px] truncate" title={l.detail}>{l.detail || '—'}</td>
                  <td className="px-4 py-2.5 text-mist-500 text-xs">{l.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
