import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Logo, useToast } from '../components/ui';

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
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Brand panel */}
      <div className="lg:w-[46%] relative flex flex-col justify-between p-8 lg:p-14 bg-ink-900 border-b lg:border-b-0 lg:border-r border-ink-700/60 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.35]" style={{ background: 'radial-gradient(60% 50% at 20% 10%, rgba(217,177,94,0.18), transparent), radial-gradient(50% 40% at 90% 90%, rgba(77,141,255,0.12), transparent)' }} />
        <div className="relative"><Logo className="h-9" /></div>
        <div className="relative py-10 lg:py-0">
          <h1 className="h-display text-4xl lg:text-5xl leading-[1.1] tracking-tight">
            Fundraising?<br /><span className="text-gold-400">Fundamental.</span>
          </h1>
          <p className="mt-5 text-mist-300 max-w-md leading-relaxed">
            The serious marketplace where startups raise capital. Every company opens with a mandatory <span className="text-gold-300 font-medium">12-minute video pitch</span>, structured metrics, and a verified data room — built for investors who do real diligence.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 max-w-md">
            {[['12-min', 'Video pitch on every profile'], ['Verified', 'Founders, funds & metrics'], ['Data Rooms', 'Permissioned collateral']].map(([t, s]) => (
              <div key={t} className="card p-3.5">
                <div className="font-display font-bold text-gold-300 text-sm">{t}</div>
                <div className="text-[11px] text-mist-400 mt-1 leading-snug">{s}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-xs text-mist-500 hidden lg:block">A professional network for founders and investors. No noise. No casual posting.</div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-14">
        <div className="w-full max-w-md fade-in">
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
              <div><span className="label">City</span><input className="input" value={form.city} onChange={set('city')} placeholder="e.g. Riyadh" /></div>
            )}
            <button disabled={busy} className="btn-primary w-full !py-3">
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : `Create ${role === 'founder' ? 'Founder' : 'Investor'} Account`}
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
        </div>
      </div>
    </div>
  );
}
