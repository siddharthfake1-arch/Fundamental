import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { MoveRight, PlayCircle, ShieldCheck, FolderLock, TrendingUp, Globe2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Logo, useToast } from '../components/ui';
import Constellation from '../components/Constellation';

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
  { icon: PlayCircle, t: '12-min pitch', s: 'A video pitch on every startup' },
  { icon: FolderLock, t: 'Data rooms', s: 'Permissioned diligence materials' },
  { icon: ShieldCheck, t: 'Verified', s: 'Real founders, funds, and metrics' },
  { icon: Globe2, t: 'Global', s: 'From Bengaluru to the Bay Area' },
];

export default function Auth() {
  const [mode, setMode] = useState('login');
  // Signup is a two-step flow: 'form' collects details, 'verify' confirms the email
  // via the OTP code before the account is created and onboarding opens.
  const [step, setStep] = useState('form');
  const [role, setRole] = useState('founder');
  const [form, setForm] = useState({ name: '', email: '', password: '', city: '', phone: '' });
  const [otp, setOtp] = useState({ sent: false, sending: false, code: '', demo_code: '' });
  // Forgot-password sub-flow (lives inside the login tab): request a code, then
  // confirm it with a new password.
  const [forgot, setForgot] = useState({ on: false, step: 'request', code: '', password: '', demo_code: '' });
  const [accepted, setAccepted] = useState(false);
  const [cfg, setCfg] = useState({ demo: false, google_enabled: false });
  const [busy, setBusy] = useState(false);
  const { setUser } = useAuth();
  const toast = useToast();
  const nav = useNavigate();

  useEffect(() => { api.get('/api/config').then(setCfg).catch(() => {}); }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // Switch tabs and reset the signup flow back to its first step.
  const switchMode = (m) => { setMode(m); setStep('form'); setOtp({ sent: false, sending: false, code: '', demo_code: '' }); setForgot({ on: false, step: 'request', code: '', password: '', demo_code: '' }); };

  // ---- Forgot password ----
  // Request a reset code. The server responds neutrally (it won't confirm whether
  // an account exists); in demo mode it returns the code so local testing works.
  const requestReset = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return toast('Enter the email on your account', 'error');
    setBusy(true);
    try {
      const d = await api.post('/api/auth/forgot-password', { email: form.email });
      setForgot(f => ({ ...f, step: 'confirm', demo_code: d.demo_code || '' }));
      toast(d.demo_code ? 'Demo mode — your reset code is shown below' : 'If that email has an account, a reset code is on its way', 'success');
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  const confirmReset = async () => {
    if (!forgot.code || forgot.code.length < 6) return toast('Enter the 6-digit code we emailed you', 'error');
    if (forgot.password.length < 8) return toast('Use a new password of at least 8 characters', 'error');
    setBusy(true);
    try {
      await api.post('/api/auth/reset-password', { email: form.email, code: forgot.code, password: forgot.password });
      toast('Password updated — please sign in with your new password', 'success');
      setForgot({ on: false, step: 'request', code: '', password: '', demo_code: '' });
      setForm(f => ({ ...f, password: '' }));
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  const goToDiscoverOrOnboarding = (user) => { setUser(user); nav(user.onboarded ? '/discover' : '/onboarding'); };

  const doLogin = async () => {
    setBusy(true);
    try {
      const { user } = await api.post('/api/auth/login', { email: form.email, password: form.password });
      goToDiscoverOrOnboarding(user);
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  // Step 1 → 2: validate the details, send the email code, advance to verification.
  const startVerification = async () => {
    if (!form.name.trim()) return toast('Enter your full name', 'error');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return toast('Enter a valid email address', 'error');
    if (form.password.length < 8) return toast('Use a password of at least 8 characters', 'error');
    if (!accepted) return toast('Please accept the Terms of Service and Privacy Policy to continue.', 'error');
    setBusy(true);
    try {
      const d = await api.post('/api/auth/send-otp', { channel: 'email', identifier: form.email });
      setOtp(o => ({ ...o, sent: true, demo_code: d.demo_code || '', code: '' }));
      setStep('verify');
      toast(d.demo ? 'Demo mode — your code is shown below' : 'We sent a 6-digit code to your email', 'success');
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  // Step 2: verify the code, create the account, then open onboarding.
  const finishSignup = async () => {
    if (!otp.code || otp.code.length < 6) return toast('Enter the 6-digit code we emailed you', 'error');
    setBusy(true);
    try {
      const { otp_token } = await api.post('/api/auth/verify-otp', { identifier: form.email, code: otp.code });
      const { user } = await api.post('/api/auth/signup', { ...form, role, otp_token, accept_terms: true });
      goToDiscoverOrOnboarding(user);
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  const resendCode = async () => {
    setOtp(o => ({ ...o, sending: true }));
    try {
      const d = await api.post('/api/auth/send-otp', { channel: 'email', identifier: form.email });
      setOtp(o => ({ ...o, sent: true, sending: false, demo_code: d.demo_code || '' }));
      toast(d.demo ? 'New code generated below' : 'A new code is on its way', 'success');
    } catch (err) {
      setOtp(o => ({ ...o, sending: false }));
      toast(err.message, 'error');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (mode === 'login') {
      if (forgot.on) return forgot.step === 'request' ? requestReset() : confirmReset();
      return doLogin();
    }
    if (step === 'form') return startVerification();
    return finishSignup();
  };

  const google = async () => {
    try { await api.post('/api/auth/google'); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row relative overflow-hidden bg-ink-950 safe-top safe-bottom">
      {/* Edgeless ambient glow for depth — no hard-edged orbs */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 50% at 22% 8%, rgba(128,82,255,0.12), transparent 70%), radial-gradient(55% 45% at 88% 92%, rgba(128,82,255,0.10), transparent 70%)' }} />

      {/* Brand panel */}
      <div className="lg:w-[52%] relative flex flex-col justify-between p-8 lg:p-14 border-b lg:border-b-0 lg:border-r border-ink-700/50 overflow-hidden">
        {/* The constellation lives behind the brand copy — masked to a soft nebula
            so it reads as intentional depth, never scattered noise behind the text */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.3]"
          style={{
            WebkitMaskImage: 'radial-gradient(ellipse 68% 60% at 50% 36%, #000 28%, transparent 80%)',
            maskImage: 'radial-gradient(ellipse 68% 60% at 50% 36%, #000 28%, transparent 80%)',
          }}>
          <Constellation count={820} cycleMs={6000} />
        </div>
        <motion.div className="relative" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Logo className="h-[69px]" />
        </motion.div>

        <div className="relative py-12 lg:py-0">
          <motion.span
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
            className="chip-gold !text-xs !px-3 !py-1.5 mb-6 inline-flex">
            <TrendingUp className="w-3.5 h-3.5" /> The serious fundraising platform
          </motion.span>

          <RotatingTitle />

          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.25 }}
            className="mt-6 text-mist-300 max-w-lg leading-relaxed text-[15px]">
            Where founders raise and investors do real diligence. Every startup opens with a
            <span className="text-gold-300 font-semibold"> 12-minute video pitch</span>, structured metrics, and a
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

        <div className="relative text-xs text-mist-500 hidden lg:block">The private-market network for founders and investors.</div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-14 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full max-w-md">
          <div className="flex rounded-xl bg-ink-850 border border-ink-600/60 p-1 mb-7">
            {['login', 'signup'].map(m => (
              <button key={m} onClick={() => switchMode(m)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${mode === m ? 'bg-ink-700 text-mist-100' : 'text-mist-400 hover:text-mist-200'}`}>
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          {/* Step indicator for the two-step signup */}
          {mode === 'signup' && (
            <div className="flex items-center gap-2 mb-5 text-[11px] font-semibold uppercase tracking-wider">
              <span className={step === 'form' ? 'text-gold-300' : 'text-mist-500'}>1 · Your details</span>
              <span className="flex-1 h-px bg-ink-700" />
              <span className={step === 'verify' ? 'text-gold-300' : 'text-mist-500'}>2 · Verify email</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {/* ---- Login ---- */}
            {mode === 'login' && !forgot.on && (
              <>
                <div><span className="label">Email</span><input aria-label="Email" type="email" className="input" value={form.email} onChange={set('email')} placeholder="you@firm.com" required /></div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="label !mb-0">Password</span>
                    <button type="button" className="text-xs text-gold-300 hover:text-gold-200 mb-1.5" onClick={() => setForgot(f => ({ ...f, on: true, step: 'request' }))}>Forgot password?</button>
                  </div>
                  <input aria-label="Password" type="password" className="input" value={form.password} onChange={set('password')} placeholder="••••••••" required />
                </div>
              </>
            )}

            {/* ---- Forgot password (inside the login tab) ---- */}
            {mode === 'login' && forgot.on && (
              <div className="card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-mist-100">Reset your password</span>
                  <button type="button" className="text-xs text-mist-400 hover:text-mist-200" onClick={() => setForgot({ on: false, step: 'request', code: '', password: '', demo_code: '' })}>← Back to sign in</button>
                </div>
                {forgot.step === 'request' ? (
                  <>
                    <p className="text-xs text-mist-400 leading-relaxed">Enter your account email and we'll send a 6-digit reset code.</p>
                    <input aria-label="Email" type="email" className="input" value={form.email} onChange={set('email')} placeholder="you@firm.com" required />
                  </>
                ) : (
                  <>
                    <p className="text-xs text-mist-400 leading-relaxed">Enter the code we sent to <span className="text-mist-200 font-medium">{form.email}</span> and choose a new password.</p>
                    <input aria-label="Reset code" className="input text-center tracking-[0.5em] text-lg" inputMode="numeric" maxLength={6} value={forgot.code}
                      onChange={(e) => setForgot(f => ({ ...f, code: e.target.value.replace(/\D/g, '') }))} placeholder="••••••" />
                    <input aria-label="New password" type="password" className="input" value={forgot.password} onChange={(e) => setForgot(f => ({ ...f, password: e.target.value }))} placeholder="New password — letters and numbers, 8+ chars" />
                    <button type="button" className="text-xs text-gold-300 hover:text-gold-200" onClick={requestReset} disabled={busy}>Resend code</button>
                    {forgot.demo_code && (
                      <div className="text-xs text-gold-300 bg-gold-500/10 border border-gold-500/30 rounded-lg px-3 py-2">
                        Demo mode — your reset code is <code className="font-bold">{forgot.demo_code}</code>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ---- Signup step 1: details ---- */}
            {mode === 'signup' && step === 'form' && (
              <>
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
                <div><span className="label">Full name</span><input aria-label="Full name" className="input" value={form.name} onChange={set('name')} placeholder="Your full name" required /></div>
                <div><span className="label">Email</span><input aria-label="Email" type="email" className="input" value={form.email} onChange={set('email')} placeholder="you@firm.com" required /></div>
                <div><span className="label">Password</span><input aria-label="Password" type="password" className="input" value={form.password} onChange={set('password')} placeholder="Minimum 8 characters" required /></div>
                <div><span className="label">City</span><input aria-label="City" className="input" value={form.city} onChange={set('city')} placeholder="e.g. Bengaluru, Mumbai, London…" /></div>
                <div><span className="label">Phone <span className="normal-case font-normal text-mist-500">(optional)</span></span><input aria-label="Phone" className="input" type="tel" value={form.phone} onChange={set('phone')} placeholder="With country code, e.g. +966 5x xxx xxxx" /></div>
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-mist-400 leading-relaxed">
                  <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="accent-gold-400 w-4 h-4 mt-0.5 shrink-0" />
                  <span>I agree to Fundamental's <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-gold-300 hover:text-gold-200">Terms of Service</a> and <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-gold-300 hover:text-gold-200">Privacy Policy</a>, and understand that information on the platform is not investment advice.</span>
                </label>
              </>
            )}

            {/* ---- Signup step 2: verify email ---- */}
            {mode === 'signup' && step === 'verify' && (
              <>
                <div className="card p-5 space-y-3">
                  <span className="text-sm font-semibold text-mist-100">Verify your email</span>
                  <p className="text-xs text-mist-400 leading-relaxed">We sent a 6-digit code to <span className="text-mist-200 font-medium">{form.email}</span>. Enter it below to confirm your account.</p>
                  <input aria-label="6-digit verification code" className="input text-center tracking-[0.5em] text-lg" inputMode="numeric" maxLength={6} autoFocus value={otp.code}
                    onChange={(e) => setOtp(o => ({ ...o, code: e.target.value.replace(/\D/g, '') }))}
                    placeholder="••••••" />
                  <div className="flex items-center justify-between text-xs">
                    <button type="button" className="text-mist-400 hover:text-mist-200" onClick={() => setStep('form')}>← Edit details</button>
                    <button type="button" className="text-gold-300 hover:text-gold-200 disabled:opacity-50" onClick={resendCode} disabled={otp.sending}>
                      {otp.sending ? 'Sending…' : 'Resend code'}
                    </button>
                  </div>
                  {otp.demo_code && (
                    <div className="text-xs text-gold-300 bg-gold-500/10 border border-gold-500/30 rounded-lg px-3 py-2">
                      Demo mode (no email provider configured) — your code is <code className="font-bold">{otp.demo_code}</code>
                    </div>
                  )}
                </div>
              </>
            )}

            <button disabled={busy} className="btn-primary w-full !py-3 group">
              {busy ? 'Please wait…'
                : mode === 'login'
                  ? (forgot.on ? (forgot.step === 'request' ? 'Send reset code' : 'Reset password') : 'Sign in')
                  : step === 'form' ? 'Continue'
                  : `Verify & create ${role === 'founder' ? 'founder' : 'investor'} account`}
              <MoveRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
          </form>

          {cfg.google_enabled && (
            <>
              <div className="flex items-center gap-3 my-5 text-[11px] text-mist-500 uppercase tracking-widest">
                <div className="divider flex-1" />or<div className="divider flex-1" />
              </div>
              <button onClick={google} className="btn-ghost w-full !py-3">
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.97 10.97 0 001 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                Sign in with Google
              </button>
            </>
          )}

          {mode === 'login' && cfg.demo && (
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
