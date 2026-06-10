import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtMoney } from '../api';
import { useAuth } from '../AuthContext';
import { Avatar, VerifiedBadge, useToast } from './ui';

export default function StartupCard({ s }) {
  const { user } = useAuth();
  const toast = useToast();
  const [saved, setSaved] = useState(s.saved);
  const [upvoted, setUpvoted] = useState(s.upvoted);
  const [upvotes, setUpvotes] = useState(s.upvotes);

  const toggleSave = async (e) => {
    e.preventDefault();
    try {
      const r = await api.post(`/api/startups/${s.id}/save`);
      setSaved(r.saved);
      toast(r.saved ? 'Saved to watchlist' : 'Removed from watchlist', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const toggleUpvote = async (e) => {
    e.preventDefault();
    try {
      const r = await api.post(`/api/startups/${s.id}/upvote`);
      setUpvoted(r.upvoted); setUpvotes(r.upvotes);
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <Link to={`/startup/${s.id}`} className="card card-hover p-5 flex flex-col gap-4 h-full group">
      <div className="flex items-start gap-3.5">
        <Avatar src={s.logo} name={s.name} size={12} square />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="h-display text-base truncate group-hover:text-gold-300 transition-colors">{s.name}</span>
            {!!s.verified && <VerifiedBadge small />}
          </div>
          <div className="text-xs text-mist-400 mt-0.5">{s.sector} · {s.stage}</div>
        </div>
        <button onClick={toggleSave} title={saved ? 'Remove from watchlist' : 'Save to watchlist'}
          className={`p-1.5 rounded-lg transition-colors ${saved ? 'text-gold-400' : 'text-mist-500 hover:text-mist-200'}`}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M17.6 3.75H6.4c-.36 0-.65.3-.65.66v15.18c0 .53.6.83 1.02.5l4.83-3.73c.24-.18.56-.18.8 0l4.83 3.74c.42.32 1.02.02 1.02-.51V4.4c0-.36-.3-.66-.65-.66z" /></svg>
        </button>
      </div>

      {s.one_liner && <p className="text-sm text-mist-300 leading-relaxed line-clamp-2">{s.one_liner}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        {s.has_video && <span className="chip-gold">▸ 12-min Pitch</span>}
        {s.has_collateral && <span className="chip-blue">Data Room</span>}
        {s.raising_status === 'Actively Raising' && <span className="chip-green">Raising</span>}
      </div>

      <div className="divider -mx-5" />
      <div className="flex items-center justify-between -my-1">
        <div className="text-sm">
          <span className="text-mist-500 text-xs">{s.arr ? 'ARR ' : s.mrr ? 'MRR ' : ''}</span>
          <span className="font-semibold text-mist-100 tabular-nums">{s.arr ? fmtMoney(s.arr) : s.mrr ? fmtMoney(s.mrr) : 'Pre-revenue'}</span>
        </div>
        <button onClick={user.role === 'investor' ? toggleUpvote : (e) => e.preventDefault()}
          title={user.role === 'investor' ? 'One upvote per investor' : 'Investors can upvote'}
          className={`flex items-center gap-1.5 text-sm rounded-lg px-2.5 py-1 transition-colors
            ${upvoted ? 'text-gold-300 bg-gold-500/10' : 'text-mist-400'} ${user.role === 'investor' ? 'hover:bg-ink-700' : 'cursor-default'}`}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill={upvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
          <span className="font-semibold tabular-nums">{upvotes}</span>
        </button>
      </div>
    </Link>
  );
}
