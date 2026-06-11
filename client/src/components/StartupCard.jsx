import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Bookmark, ChevronUp, PlayCircle, FolderLock, Target } from 'lucide-react';
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
      toast(r.saved ? 'Saved to pipeline' : 'Removed from pipeline', 'success');
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
  const scoreColor = s.score >= 75 ? 'text-emerald-400' : s.score >= 50 ? 'text-gold-300' : 'text-mist-400';

  return (
    <Link to={`/startup/${s.id}`} className="card card-hover p-5 flex flex-col gap-3.5 h-full group relative">
      <div className="flex items-start gap-3.5">
        <Avatar src={s.logo} name={s.name} size={12} square />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="h-display text-[15px] truncate group-hover:text-gold-300 transition-colors">{s.name}</span>
            {!!s.verified && <VerifiedBadge small />}
            {hot && <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" title={`Momentum ${s.momentum}`} />}
          </div>
          <div className="text-xs text-mist-400 mt-0.5 truncate">{s.sector} · {s.stage} · {s.city}</div>
        </div>
        <button onClick={toggleSave} title={saved ? 'Remove from pipeline' : 'Save to pipeline'}
          className={`p-1.5 -m-1 rounded-lg transition-colors ${saved ? 'text-gold-400' : 'text-mist-500 hover:text-mist-200'}`}>
          <Bookmark className="w-[18px] h-[18px]" fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>

      {s.one_liner && <p className="text-sm text-mist-300 leading-relaxed line-clamp-2">{s.one_liner}</p>}

      <div className="divider -mx-5 mt-auto" />
      <div className="flex items-center justify-between text-xs -mb-1">
        <div className="flex items-center gap-3 text-mist-400 min-w-0">
          <span className="font-semibold text-mist-100 text-sm tabular-nums shrink-0">
            {s.arr ? fmtMoney(s.arr) : s.mrr ? fmtMoney(s.mrr) : 'Pre-rev'}
            <span className="text-mist-500 font-normal text-[10px] ml-1">{s.arr ? 'ARR' : s.mrr ? 'MRR' : ''}</span>
          </span>
          <span className={`font-bold tabular-nums ${scoreColor}`} title="Fundamental Score">◉ {s.score}</span>
          {s.fit != null && s.fit >= 60 && (
            <span className="flex items-center gap-1 text-gold-300 font-semibold shrink-0" title="Match with your thesis">
              <Target className="w-3 h-3" /> {s.fit}% fit
            </span>
          )}
          {s.raising_status === 'Actively Raising' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Actively raising" />}
        </div>
        <button onClick={user.role === 'investor' ? toggleUpvote : (e) => e.preventDefault()}
          title={user.role === 'investor' ? 'One upvote per investor' : 'Investors can upvote'}
          className={`relative flex items-center gap-1 text-sm rounded-lg px-2 py-1 transition-colors shrink-0
            ${upvoted ? 'text-gold-300 bg-gold-500/10' : 'text-mist-400'} ${user.role === 'investor' ? 'hover:bg-ink-700' : 'cursor-default'}`}>
          {burst > 0 && <span key={burst} className="upvote-burst absolute inset-0 rounded-lg border-2 border-gold-400" />}
          <ChevronUp className="w-4 h-4" strokeWidth={upvoted ? 3 : 2} />
          <span className="font-semibold tabular-nums">{upvotes}</span>
        </button>
      </div>
    </Link>
  );
}
