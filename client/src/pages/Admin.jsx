import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, asArray, timeAgo } from '../api';
import { useAuth } from '../AuthContext';
import { Empty, LineChart, Spinner, Stat, useToast } from '../components/ui';

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState('analytics');
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;

  const tabs = [['analytics', 'Platform analytics'], ['users', 'Verify users'], ['startups', 'Verify startups'], ['content', 'Moderate content'], ['reports', 'Reports'], ['errors', 'Errors']];
  return (
    <div className="fade-in">
      <h1 className="h-display text-2xl mb-1">Admin</h1>
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
      {tab === 'content' && <Content />}
      {tab === 'reports' && <Reports />}
      {tab === 'errors' && <ClientErrors />}
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
  const load = () => api.get('/api/admin/users').then(d => setUsers(asArray(d.users))).catch(() => {});
  useEffect(() => { load(); }, []);
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
                  <button className="btn-ghost btn-sm" onClick={async () => { if (u.status !== 'suspended' && !window.confirm(`Suspend ${u.name}? They will be signed out and blocked until reinstated.`)) return; const r = await api.post(`/api/admin/suspend-user/${u.id}`); load(); toast(r.status === 'suspended' ? 'Account suspended' : 'Account reinstated', 'success'); }}>
                    {u.status === 'suspended' ? 'Reinstate' : 'Suspend'}
                  </button>
                  <button className="btn-danger btn-sm" onClick={async () => { if (!u.flagged && !window.confirm(`Flag ${u.name} as fraudulent? They will be blocked from the platform.`)) return; await api.post(`/api/admin/flag-user/${u.id}`); load(); }}>
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
  const load = () => api.get('/api/admin/startups').then(d => setList(asArray(d.startups))).catch(() => {});
  useEffect(() => { load(); }, []);
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
                  <button className="btn-ghost btn-sm" onClick={async () => { if (!s.hidden && !window.confirm(`Hide ${s.name}? It and its documents will be removed from the marketplace.`)) return; const r = await api.post(`/api/admin/hide-startup/${s.id}`); load(); toast(r.hidden ? 'Startup hidden' : 'Startup restored', 'success'); }}>
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
  const load = () => api.get('/api/admin/posts').then(d => setPosts(asArray(d.posts))).catch(() => {});
  useEffect(() => { load(); }, []);
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
            onClick={async () => { if (!p.removed && !window.confirm('Remove this post from the feed?')) return; await api.post(`/api/admin/posts/${p.id}/remove`); load(); toast(p.removed ? 'Post restored' : 'Post removed', 'success'); }}>
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
  const load = () => api.get('/api/admin/reports').then(d => setReports(asArray(d.reports))).catch(() => {});
  useEffect(() => { load(); }, []);
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
