import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { MoveRight, PlayCircle, ShieldCheck, FolderLock, TrendingUp, Globe2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Logo, useToast } from '../components/ui';

// Animated hero — adapted from the provided shadcn/framer-motion component
// into this codebase's native stack (motion/react + design tokens).
function RotatingTitle() {
  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(() => ['fundamental.', 'transparent.', 'serious.', '12 minutes.', 'global.'], []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setTitleNumber(titleNumber === titles.length - 1 ? 0 : titleNumber + 1);
    }, 2200);
    return () => clearTimeout(timeoutId);
  }, [titleNumber, titles]);

  return (
    <h1 className="h-display text-4xl lg:text-6xl leading-[1.08] tracking-tight">
      <span className="block text-mist-100">Fundraising should be</span>
      <span className="relative flex w-full overflow-hidden md:pb-3 md:pt-1 h-[1.35em]">
        {titles.map((title, index) => (
          <motion.span
            key={index}
            className="absolute font-display font-extrabold text-gradient"
            initial={{ opacity: 0, y: -100 }}
            transition={{ type: 'spring', stiffness: 50 }}
            animate={titleNumber === index ? { y: 0, opacity: 1 } : { y: titleNumber > index ? -150 : 150, opacity: 0 }}>
            {title}
          </motion.span>
        ))}
      </span>
    </h1>
  );
}

const FEATURES = [
  { icon: PlayCircle, t: '12-min pitch', s: 'Mandatory video on every startup' },
  { icon: FolderLock, t: 'Data rooms', s: 'Permissioned diligence collateral' },
  { icon: ShieldCheck, t: 'Verified', s: 'Founders, funds & real metrics' },
  { icon: Globe2, t: 'Global', s: 'Bengaluru to the Bay Area' },
];

export default function Auth() {
  const [mode, setMode] = useState('login');
  const [role, setRole] = useState('founder');
  const [form, setForm] = useState({ name: '', email: '', password: '', city: '' });
  const [busy, setBusy] = useState(false);
  const { setUser } = useAuth();
  const toast = useToast();
  const nav = useNavigate();

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { user } = mode === 'login'
        ? await api.post('/api/auth/login', { email: form.email, password: form.password })
        : await api.post('/api/auth/signup', { ...form, role });
      setUser(user);
      nav(user.onboarded ? '/discover' : '/onboarding');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    try { await api.post('/api/auth/google'); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row relative overflow-hidden">
      {/* Floating gradient orbs for depth */}
      <div className="orb animate-float w-[480px] h-[480px] -top-40 -left-32" style={{ background: 'radial-gradient(circle, rgb(var(--acc2-500)), transparent 65%)' }} />
      <div className="orb animate-float-slow w-[420px] h-[420px] bottom-[-140px] left-[28%]" style={{ background: 'radial-gradient(circle, rgb(var(--acc-500)), transparent 65%)' }} />
      <div className="orb animate-float w-[300px] h-[300px] top-[12%] right-[-90px]" style={{ background: 'radial-gradient(circle, rgb(var(--acc-400)), transparent 65%)', animationDelay: '-4s' }} />

      {/* Brand panel */}
      <div className="lg:w-[52%] relative flex flex-col justify-between p-8 lg:p-14 border-b lg:border-b-0 lg:border-r border-ink-700/50">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Logo className="h-9" />
        </motion.div>

        <div className="relative py-12 lg:py-0">
          <motion.span
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
            className="chip-gold !text-xs !px-3 !py-1.5 mb-6 inline-flex">
            <TrendingUp className="w-3.5 h-3.5" /> The serious fundraising marketplace
          </motion.span>

          <RotatingTitle />

          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.25 }}
            className="mt-6 text-mist-300 max-w-lg leading-relaxed text-[15px]">
            Where founders raise and investors do real diligence. Every startup opens with a
            <span className="text-gold-300 font-semibold"> 12-minute video pitch</span>, structured metrics and a
            permissioned data room — from Bengaluru and Mumbai to London and San Francisco.
          </motion.p>

          <div className="mt-9 grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-2xl">
            {FEATURES.map(({ icon: Icon, t, s }, i) => (
              <motion.div key={t}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.35 + i * 0.08 }}
                className="card ring-gradient p-3.5">
                <Icon className="w-4.5 h-4.5 w-[18px] h-[18px] text-gold-400 mb-2" />
                <div className="font-display font-bold text-mist-100 text-sm">{t}</div>
                <div className="text-[11px] text-mist-400 mt-0.5 leading-snug">{s}</div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
            className="mt-9 flex items-center gap-6 text-xs text-mist-400">
            <span><span className="font-display font-bold text-mist-100 text-base">8+</span> startups raising</span>
            <span><span className="font-display font-bold text-mist-100 text-base">$39M+</span> in open rounds</span>
            <span><span className="font-display font-bold text-mist-100 text-base">5</span> active funds</span>
          </motion.div>
        </div>

        <div className="relative text-xs text-mist-500 hidden lg:block">A professional network for founders and investors. No noise. No casual posting.</div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-14 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full max-w-md">
          <div className="flex rounded-xl bg-ink-850 border border-ink-600/60 p-1 mb-7">
            {['login', 'signup'].map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${mode === m ? 'bg-ink-700 text-mist-100' : 'text-mist-400 hover:text-mist-200'}`}>
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <span className="label">I am a</span>
                <div className="grid grid-cols-2 gap-3">
                  {[['founder', 'Founder', 'Raising capital for my startup'], ['investor', 'Investor', 'Sourcing and evaluating deals']].map(([v, t, s]) => (
                    <button type="button" key={v} onClick={() => setRole(v)}
                      className={`rounded-xl border p-4 text-left transition-all ${role === v ? 'border-gold-500/70 bg-gold-500/10' : 'border-ink-600/70 bg-ink-850 hover:border-ink-500'}`}>
                      <div className={`font-display font-bold text-sm ${role === v ? 'text-gold-300' : 'text-mist-100'}`}>{t}</div>
                      <div className="text-[11px] text-mist-400 mt-1 leading-snug">{s}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mode === 'signup' && (
              <div><span className="label">Full Name</span><input className="input" value={form.name} onChange={set('name')} placeholder="Your full name" required /></div>
            )}
            <div><span className="label">Email</span><input type="email" className="input" value={form.email} onChange={set('email')} placeholder="you@firm.com" required /></div>
            <div><span className="label">Password</span><input type="password" className="input" value={form.password} onChange={set('password')} placeholder={mode === 'signup' ? 'Minimum 8 characters' : '••••••••'} required /></div>
            {mode === 'signup' && (
              <div><span className="label">City</span><input className="input" value={form.city} onChange={set('city')} placeholder="e.g. Bengaluru, Mumbai, London…" /></div>
            )}
            <button disabled={busy} className="btn-primary w-full !py-3 group">
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : `Create ${role === 'founder' ? 'Founder' : 'Investor'} Account`}
              <MoveRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
          </form>

          <div className="flex items-center gap-3 my-5 text-[11px] text-mist-500 uppercase tracking-widest">
            <div className="divider flex-1" />or<div className="divider flex-1" />
          </div>
          <button onClick={google} className="btn-ghost w-full !py-3">
            <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.97 10.97 0 001 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
            Sign in with Google
          </button>

          {mode === 'login' && (
            <div className="mt-6 card p-4 text-xs text-mist-400 leading-relaxed">
              <span className="text-mist-300 font-semibold">Demo accounts</span> (password <code className="text-gold-300">demo1234</code>):<br />
              Founder — <code className="text-mist-200">founder1@demo.app</code> · Investor — <code className="text-mist-200">investor1@demo.app</code> · Admin — <code className="text-mist-200">admin@fundamental.app</code>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
