import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Bookmark, ChevronUp } from 'lucide-react';
import { api, fmtMoney } from '../api';
import { useAuth } from '../AuthContext';
import { Avatar, VerifiedBadge, useToast } from './ui';

export default function StartupCard({ s }) {
  const { user } = useAuth();
  const toast = useToast();
  const [saved, setSaved] = useState(s.saved);
  const [upvoted, setUpvoted] = useState(s.upvoted);
  const [upvotes, setUpvotes] = useState(s.upvotes);
  const [burst, setBurst] = useState(0);

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
      if (r.upvoted) setBurst(b => b + 1);
    } catch (err) { toast(err.message, 'error'); }
  };

  const hot = s.momentum >= 40;

  return (
    <Link to={`/startup/${s.id}`} className="card card-hover p-5 flex flex-col gap-4 h-full group relative overflow-hidden">
      {hot && (
        <span className="absolute top-0 right-0 flex items-center gap-1 rounded-bl-xl px-2.5 py-1 text-[10px] font-bold text-white"
          style={{ background: 'linear-gradient(120deg, #f97316, #f43f5e)' }}>
          <Flame className="w-3 h-3" /> HOT
        </span>
      )}
      <div className="flex items-start gap-3.5">
        <Avatar src={s.logo} name={s.name} size={12} square />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="h-display text-base truncate group-hover:text-gold-300 transition-colors">{s.name}</span>
            {!!s.verified && <VerifiedBadge small />}
          </div>
          <div className="text-xs text-mist-400 mt-0.5">{s.sector} · {s.stage} · {s.city}</div>
        </div>
        <button onClick={toggleSave} title={saved ? 'Remove from watchlist' : 'Save to watchlist'}
          className={`p-1.5 rounded-lg transition-colors ${saved ? 'text-gold-400' : 'text-mist-500 hover:text-mist-200'} ${hot ? 'mt-4' : ''}`}>
          <Bookmark className="w-5 h-5" fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>

      {s.one_liner && <p className="text-sm text-mist-300 leading-relaxed line-clamp-2">{s.one_liner}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        {s.has_video && <span className="chip-gold">▸ 12-min Pitch</span>}
        {s.has_collateral && <span className="chip-blue">Data Room</span>}
        {s.raising_status === 'Actively Raising' && <span className="chip-green">Raising</span>}
      </div>

      <div className="divider -mx-5 mt-auto" />
      <div className="flex items-center justify-between -my-1">
        <div className="text-sm">
          <span className="text-mist-500 text-xs">{s.arr ? 'ARR ' : s.mrr ? 'MRR ' : ''}</span>
          <span className="font-semibold text-mist-100 tabular-nums">{s.arr ? fmtMoney(s.arr) : s.mrr ? fmtMoney(s.mrr) : 'Pre-revenue'}</span>
        </div>
        <button onClick={user.role === 'investor' ? toggleUpvote : (e) => e.preventDefault()}
          title={user.role === 'investor' ? 'One upvote per investor' : 'Investors can upvote'}
          className={`relative flex items-center gap-1.5 text-sm rounded-lg px-2.5 py-1 transition-colors
            ${upvoted ? 'text-gold-300 bg-gold-500/10' : 'text-mist-400'} ${user.role === 'investor' ? 'hover:bg-ink-700' : 'cursor-default'}`}>
          {burst > 0 && <span key={burst} className="upvote-burst absolute inset-0 rounded-lg border-2 border-gold-400" />}
          <ChevronUp className="w-4 h-4" strokeWidth={upvoted ? 3 : 2} />
          <span className="font-semibold tabular-nums">{upvotes}</span>
        </button>
      </div>
    </Link>
  );
}
