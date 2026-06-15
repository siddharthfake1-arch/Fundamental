import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { MoveRight, PlayCircle } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Avatar, Logo, ScoreRing, Spinner, VerifiedBadge } from '../components/ui';

// Public, shareable startup snapshot — the platform's top-of-funnel.
export default function PublicStartup() {
  const { id } = useParams();
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(`/api/public/startup/${id}`).then(setD).catch(e => setErr(e.message));
  }, [id]);

  if (err) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <Logo /><div className="text-mist-300">{err}</div>
      <Link to="/" className="btn-primary btn-sm">Go to Fundamental</Link>
    </div>
  );
  if (!d) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>;
  const { startup: s, founder } = d;

  return (
    <div className="min-h-screen relative overflow-hidden bg-ink-950">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(55% 45% at 15% 0%, rgba(128,82,255,0.12), transparent 70%), radial-gradient(50% 40% at 90% 100%, rgba(128,82,255,0.10), transparent 70%)' }} />

      <header className="relative max-w-3xl mx-auto px-4 py-5 flex items-center justify-between">
        <Link to="/"><Logo /></Link>
        <Link to={user ? `/startup/${s.id}` : '/'} className="btn-ghost btn-sm">
          {user ? 'View full profile' : 'Sign in for full access'}
        </Link>
      </header>

      <motion.main initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="relative max-w-3xl mx-auto px-4 pb-16 space-y-5">
        <div className="card ring-gradient p-6">
          <div className="flex flex-col sm:flex-row gap-5 items-start">
            <Avatar src={s.logo} name={s.name} size={18} square />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="h-display text-3xl">{s.name}</h1>
                {s.verified && <VerifiedBadge />}
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-2 text-sm text-mist-400">
                <span className="chip">{s.sector}</span><span className="chip">{s.stage}</span>
                <span>{s.city}</span>{s.founded_year && <span>· Founded {s.founded_year}</span>}
              </div>
              <p className="text-[15px] text-mist-200 leading-relaxed mt-3">{s.one_liner}</p>
              <div className="flex items-center gap-3 mt-4 flex-wrap">
                {s.raising_status === 'Actively Raising' && <span className="chip-green">● Actively raising{s.raising_amount && ` — ${s.raising_amount}`}</span>}
                <span className="chip-gold">▲ {s.upvotes} investor upvotes</span>
              </div>
            </div>
            <ScoreRing score={s.score} size={72} label="Fundamental Score" />
          </div>
        </div>

        <div className="card p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <PlayCircle className="w-4 h-4 text-gold-400" />
            <span className="section-title">The 12-minute pitch</span>
          </div>
          <video src={s.video_url} controls playsInline preload="metadata" className="w-full aspect-video rounded-xl bg-black border border-ink-600/50" />
          {founder && (
            <div className="flex items-center gap-2 mt-4 text-sm text-mist-400">
              Pitched by <span className="font-semibold text-mist-100">{founder.name}</span>
              {!!founder.verified && <VerifiedBadge small />}
              {founder.headline && <span className="hidden sm:inline">— {founder.headline}</span>}
            </div>
          )}
        </div>

        {!user && (
          <div className="card p-6 text-center">
            <h2 className="h-display text-xl">Metrics, the data room, and the full diligence picture</h2>
            <p className="text-sm text-mist-400 mt-2 max-w-md mx-auto">
              Investors on Fundamental see {s.name}'s revenue trends, unit economics, permissioned data room, and founder updates — and connect directly.
            </p>
            <Link to="/" className="btn-primary mt-5 inline-flex">Join Fundamental <MoveRight className="w-4 h-4" /></Link>
          </div>
        )}
      </motion.main>
    </div>
  );
}
