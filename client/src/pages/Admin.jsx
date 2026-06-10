import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, timeAgo } from '../api';
import { useAuth } from '../AuthContext';
import { Empty, LineChart, Spinner, Stat, useToast } from '../components/ui';

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState('analytics');
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;

  const tabs = [['analytics', 'Platform Analytics'], ['users', 'Verify Users'], ['startups', 'Verify Startups'], ['content', 'Moderate Content'], ['reports', 'Reports']];
  return (
    <div className="fade-in">
      <h1 className="h-display text-2xl mb-1">Admin Panel</h1>
      <p className="text-sm text-mist-400 mb-5">Verification, moderation and platform health.</p>
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
    </div>
  );
}

function Analytics() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get('/api/admin/overview').then(setD).catch(() => {}); }, []);
  if (!d) return <Spinner />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total Users" value={d.users} sub={`${d.founders} founders · ${d.investors} investors`} />
        <Stat label="Startups Listed" value={d.startups} />
        <Stat label="Connections Made" value={d.connections} />
        <Stat label="Open Reports" value={d.open_reports} />
        <Stat label="Posts" value={d.posts} />
        <Stat label="Messages Sent" value={d.messages} />
        <Stat label="Total Upvotes" value={d.upvotes} />
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
  const toast = useToast();
  const load = () => api.get('/api/admin/users').then(d => setUsers(d.users)).catch(() => {});
  useEffect(load, []);
  if (!users) return <Spinner />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mist-500 border-b border-ink-700/60">
          {['Name', 'Email', 'Role', 'City', 'Joined', 'Status', 'Actions'].map(h => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}
        </tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className="border-b border-ink-700/40 last:border-0 hover:bg-ink-850">
              <td className="px-4 py-3"><Link to={`/profile/${u.id}`} className="font-medium text-mist-100 hover:text-gold-300">{u.name}</Link></td>
              <td className="px-4 py-3 text-mist-400">{u.email}</td>
              <td className="px-4 py-3 capitalize text-mist-300">{u.role}</td>
              <td className="px-4 py-3 text-mist-400">{u.city || '—'}</td>
              <td className="px-4 py-3 text-mist-500 text-xs">{timeAgo(u.created_at)}</td>
              <td className="px-4 py-3">
                {!!u.verified && <span className="chip-green mr-1">Verified</span>}
                {!!u.flagged && <span className="chip-red">Flagged</span>}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button className="btn-ghost btn-sm" onClick={async () => { await api.post(`/api/admin/verify-user/${u.id}`); load(); toast(u.verified ? 'Verification removed' : 'User verified', 'success'); }}>
                    {u.verified ? 'Unverify' : 'Verify'}
                  </button>
                  <button className="btn-danger btn-sm" onClick={async () => { await api.post(`/api/admin/flag-user/${u.id}`); load(); }}>
                    {u.flagged ? 'Unflag' : 'Flag Fraud'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StartupsAdmin() {
  const [list, setList] = useState(null);
  const toast = useToast();
  const load = () => api.get('/api/admin/startups').then(d => setList(d.startups)).catch(() => {});
  useEffect(load, []);
  if (!list) return <Spinner />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mist-500 border-b border-ink-700/60">
          {['Startup', 'Sector', 'Stage', 'Pitch Video', 'Views', 'Status', 'Action'].map(h => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}
        </tr></thead>
        <tbody>
          {list.map(s => (
            <tr key={s.id} className="border-b border-ink-700/40 last:border-0 hover:bg-ink-850">
              <td className="px-4 py-3"><Link to={`/startup/${s.id}`} className="font-medium text-mist-100 hover:text-gold-300">{s.name}</Link></td>
              <td className="px-4 py-3 text-mist-300">{s.sector}</td>
              <td className="px-4 py-3 text-mist-300">{s.stage}</td>
              <td className="px-4 py-3">{s.video_url ? <span className="chip-green">✓ Uploaded</span> : <span className="chip-red">Missing — unlisted</span>}</td>
              <td className="px-4 py-3 text-mist-400 tabular-nums">{s.views}</td>
              <td className="px-4 py-3">{s.verified ? <span className="chip-green">Verified</span> : <span className="chip">Unverified</span>}</td>
              <td className="px-4 py-3">
                <button className="btn-ghost btn-sm" onClick={async () => { await api.post(`/api/admin/verify-startup/${s.id}`); load(); toast('Updated', 'success'); }}>
                  {s.verified ? 'Unverify' : 'Verify'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Content() {
  const [posts, setPosts] = useState(null);
  const toast = useToast();
  const load = () => api.get('/api/admin/posts').then(d => setPosts(d.posts)).catch(() => {});
  useEffect(load, []);
  if (!posts) return <Spinner />;
  return posts.length === 0 ? <Empty title="No content" /> : (
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
            onClick={async () => { await api.post(`/api/admin/posts/${p.id}/remove`); load(); toast(p.removed ? 'Post restored' : 'Post removed', 'success'); }}>
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
  const load = () => api.get('/api/admin/reports').then(d => setReports(d.reports)).catch(() => {});
  useEffect(load, []);
  if (!reports) return <Spinner />;
  return reports.length === 0 ? <Empty title="No reports" sub="User reports of fraudulent or inappropriate activity land here." /> : (
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
