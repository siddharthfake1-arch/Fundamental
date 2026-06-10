import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, timeAgo } from '../api';
import { useAuth } from '../AuthContext';
import { Avatar, Empty, Spinner, VerifiedBadge, useToast } from '../components/ui';

const STATUSES = ['Tracking', 'Intro Call Done', 'Due Diligence', 'Term Sheet', 'Passed'];

export default function Watchlist() {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const toast = useToast();

  if (user.role !== 'investor') return <Navigate to="/dashboard" replace />;

  const load = () => api.get('/api/watchlist').then(d => setList(d.watchlist)).catch(e => toast(e.message, 'error'));
  useEffect(load, []);

  if (!list) return <Spinner />;

  return (
    <div className="max-w-4xl mx-auto fade-in">
      <h1 className="h-display text-2xl">Watchlist</h1>
      <p className="text-sm text-mist-400 mt-1 mb-6">Your tracked startups with private notes and live activity. Only you can see this.</p>

      {list.length === 0 ? (
        <Empty title="Your watchlist is empty" sub="Save startups from Discover to track their progress, keep notes and manage your pipeline status." />
      ) : (
        <div className="space-y-4">
          {list.map(s => <Row key={s.id} s={s} onChange={load} />)}
        </div>
      )}
    </div>
  );
}

function Row({ s, onChange }) {
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const toast = useToast();

  return (
    <div className="card p-5">
      <div className="flex items-start gap-4 flex-wrap">
        <Link to={`/startup/${s.id}`}><Avatar src={s.logo} name={s.name} size={13} square /></Link>
        <div className="flex-1 min-w-[180px]">
          <Link to={`/startup/${s.id}`} className="flex items-center gap-1.5 font-semibold text-mist-100 hover:text-gold-300">
            {s.name}{!!s.verified && <VerifiedBadge small />}
          </Link>
          <div className="text-xs text-mist-400 mt-0.5">{s.sector} · {s.stage} · {s.city}</div>
          <p className="text-xs text-mist-500 mt-1.5 line-clamp-1">{s.one_liner}</p>
          <div className="text-[11px] text-mist-500 mt-1">Saved {timeAgo(s.saved_at)}</div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <select className="input !w-auto !py-1.5 !text-xs" value={s.status}
            onChange={async (e) => {
              try { await api.post(`/api/startups/${s.id}/watchlist-status`, { status: e.target.value }); onChange(); }
              catch (er) { toast(er.message, 'error'); }
            }}>
            {STATUSES.map(st => <option key={st}>{st}</option>)}
          </select>
          {s.raising_status === 'Actively Raising' && <span className="chip-green">Raising</span>}
        </div>
      </div>

      {s.recent_activity.length > 0 && (
        <div className="mt-4 pt-3 border-t border-ink-700/50">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-mist-500 mb-1.5">Recent Activity</div>
          {s.recent_activity.map(a => (
            <div key={a.id} className="text-xs text-mist-400 py-0.5"><span className="text-gold-400/80">{a.type}</span> — {a.text} <span className="text-mist-600">· {timeAgo(a.created_at)}</span></div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-ink-700/50">
        <button className="text-[11px] font-semibold uppercase tracking-wider text-mist-500 hover:text-gold-300" onClick={() => setOpen(o => !o)}>
          Personal Notes ({s.notes.length}) {open ? '▾' : '▸'}
        </button>
        {open && (
          <div className="mt-2.5 space-y-2">
            {s.notes.map(n => (
              <div key={n.id} className="flex gap-3 bg-gold-500/5 border border-gold-500/20 rounded-xl px-3.5 py-2.5">
                <div className="flex-1">
                  <p className="text-sm text-mist-200">{n.text}</p>
                  <div className="text-[10px] text-mist-500 mt-0.5">{timeAgo(n.created_at)}</div>
                </div>
                <button className="text-mist-500 hover:text-red-400 text-xs" onClick={async () => { await api.del(`/api/startups/notes/${n.id}`); onChange(); }}>✕</button>
              </div>
            ))}
            <div className="flex gap-2">
              <input className="input !py-2" placeholder="Add a private note…" value={note} onChange={(e) => setNote(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && note.trim()) {
                    try { await api.post(`/api/startups/${s.id}/notes`, { text: note }); setNote(''); onChange(); }
                    catch (er) { toast(er.message, 'error'); }
                  }
                }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
