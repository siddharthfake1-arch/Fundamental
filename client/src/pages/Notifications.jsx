import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, timeAgo } from '../api';
import { Empty, Spinner, useToast } from '../components/ui';

const TYPES = ['Profile Viewed', 'Upvote Received', 'Connection Request', 'Connection Accepted', 'Collateral Request', 'Access Approved', 'New Message', 'Deal Alert'];
const ICONS = { 'Profile Viewed': '👁', 'Upvote Received': '▲', 'Connection Request': '⇄', 'Connection Accepted': '✓', 'Collateral Request': '🔒', 'Access Approved': '🔓', 'New Message': '✉', 'Deal Alert': '⚡' };

export default function Notifications() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const toast = useToast();
  const nav = useNavigate();

  const load = () => api.get('/api/notifications' + (filter ? `?type=${encodeURIComponent(filter)}` : ''))
    .then(setData).catch(e => toast(e.message, 'error'));
  useEffect(load, [filter]);

  if (!data) return <Spinner />;
  const shown = data.notifications.filter(n => !q || n.text.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="max-w-2xl mx-auto fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="h-display text-2xl">Notifications</h1>
          <p className="text-sm text-mist-400 mt-1">{data.unread} unread</p>
        </div>
        <div className="flex gap-2">
          <input className="input !w-40 !py-2 !text-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input !w-auto !py-2 !text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All types</option>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <button className="btn-ghost btn-sm" disabled={!data.unread}
            onClick={async () => { await api.post('/api/notifications/read'); load(); }}>Mark all as read</button>
        </div>
      </div>

      {shown.length === 0 ? (
        <Empty title="All quiet" sub="Profile views, upvotes, connection and data room activity will appear here." />
      ) : (
        <div className="card overflow-hidden">
          {shown.map(n => (
            <button key={n.id}
              onClick={async () => { await api.post('/api/notifications/read', { id: n.id }); n.link ? nav(n.link) : load(); }}
              className={`w-full flex items-start gap-3.5 px-5 py-4 text-left border-b border-ink-700/40 last:border-0 transition-colors hover:bg-ink-850 ${n.read ? 'opacity-60' : ''}`}>
              <span className="w-9 h-9 rounded-xl bg-ink-800 border border-ink-600/60 flex items-center justify-center text-sm shrink-0">{ICONS[n.type] || '•'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gold-400/80">{n.type}</span>
                  {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-gold-400" />}
                </div>
                <div className="text-sm text-mist-200 mt-0.5">{n.text}</div>
                <div className="text-[11px] text-mist-500 mt-0.5">{timeAgo(n.created_at)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
