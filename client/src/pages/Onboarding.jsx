import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Logo, FileUpload, useToast } from '../components/ui';

const SECTORS = ['Fintech', 'Healthtech', 'Edtech', 'Logistics', 'Marketplace', 'SaaS', 'Climate', 'Insurtech', 'Deeptech', 'Consumer', 'Other'];
const STAGES = ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Growth'];
const COLLATERAL_TYPES = ['Deck', 'IM', 'Financial Model', 'Industry Overview', 'Product Demo', 'Cap Table'];

function videoDuration(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration); };
    v.onerror = () => resolve(null);
    v.src = URL.createObjectURL(file);
  });
}

export default function Onboarding() {
  const { user, refresh } = useAuth();
  return user.role === 'founder' ? <FounderFlow user={user} refresh={refresh} /> : <InvestorFlow user={user} refresh={refresh} />;
}

function Shell({ step, total, title, sub, children, completion }) {
  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <Logo />
        {completion != null && (
          <div className="text-right">
            <div className="text-[11px] text-mist-400 uppercase tracking-wider font-semibold">Profile completion</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-28 h-1.5 bg-ink-700 rounded-full overflow-hidden"><div className="h-full bg-gold-400 transition-all" style={{ width: completion + '%' }} /></div>
              <span className="text-xs font-bold text-gold-300 tabular-nums">{completion}%</span>
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-1.5 mb-6">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-gold-400' : 'bg-ink-700'}`} />
        ))}
      </div>
      <h1 className="h-display text-2xl">{title}</h1>
      <p className="text-sm text-mist-400 mt-1.5 mb-7">{sub}</p>
      <div className="fade-in" key={step}>{children}</div>
    </div>
  );
}

const Field = ({ label, hint, children }) => (
  <div>
    <span className="label">{label}{hint && <span className="text-mist-500 font-normal normal-case tracking-normal"> — {hint}</span>}</span>
    {children}
  </div>
);

const Optional = () => <span className="text-[10px] uppercase tracking-wider text-mist-500 ml-1.5">optional</span>;

// "About you" — the personal profile fields that show on /profile later.
function AboutYouStep({ me, setMe }) {
  const set = (k) => (e) => setMe(x => ({ ...x, [k]: e.target.value }));
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <FileUpload label="Profile photo" accept="image/*" currentUrl={me.photo} hint="Shown across Fundamental"
          onUploaded={(d) => setMe(x => ({ ...x, photo: d.url }))} />
        <FileUpload label="Cover image" accept="image/*" currentUrl={me.cover} hint="Banner on your profile"
          onUploaded={(d) => setMe(x => ({ ...x, cover: d.url }))} />
      </div>
      <Field label="Headline"><input className="input" value={me.headline} onChange={set('headline')} placeholder="e.g. Co-founder and CEO, PayLane" /></Field>
      <Field label="Bio"><textarea className="input min-h-[100px]" value={me.bio} onChange={set('bio')} placeholder="A few sentences on who you are. Investors and founders read this on your profile." /></Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="City"><input className="input" value={me.city} onChange={set('city')} placeholder="e.g. Riyadh, Bengaluru, London…" /></Field>
        <Field label="LinkedIn URL"><input className="input" value={me.linkedin} onChange={set('linkedin')} placeholder="https://linkedin.com/in/you" /></Field>
      </div>
      <Field label="Education"><input className="input" value={me.education} onChange={set('education')} placeholder="e.g. B.Tech CS, IIT Bombay" /></Field>
      <Field label="Experience"><input className="input" value={me.experience} onChange={set('experience')} placeholder="e.g. ex-Product at Stripe; two-time founder" /></Field>
    </div>
  );
}

const ME_FIELDS = ['photo', 'cover', 'headline', 'bio', 'city', 'linkedin', 'education', 'experience'];
const meFromUser = (user) => Object.fromEntries(ME_FIELDS.map(k => [k, user[k] || '']));
// Server only accepts real http(s) links — quietly add the protocol people omit.
const normalizeMe = (me) => ({
  ...me,
  linkedin: me.linkedin && !/^(https?:\/\/|\/uploads\/)/.test(me.linkedin) ? `https://${me.linkedin}` : me.linkedin,
});

// ---------------------------------------------------------------- Founder ----

const S_TEXT = ['name', 'sector', 'subsector', 'stage', 'city', 'raising_status', 'raising_amount', 'one_liner',
  'problem', 'solution', 'business_model', 'market_size', 'competitive_advantage', 'round_details',
  'deployment_timeline', 'strategic_objectives', 'logo', 'cover', 'video_url'];
const S_NUM = ['founded_year', 'arr', 'mrr', 'growth', 'gross_margin', 'burn', 'runway', 'cac', 'ltv'];

function emptyStartup() {
  const s = Object.fromEntries([...S_TEXT, ...S_NUM].map(k => [k, '']));
  s.raising_status = 'Actively Raising';
  s.video_minutes = null;
  return s;
}

function FounderFlow({ user, refresh }) {
  const draftKey = `onb_founder_${user.id}`;
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [me, setMe] = useState(meFromUser(user));
  const [s, setS] = useState(emptyStartup());
  const [docs, setDocs] = useState([]);
  const toast = useToast();
  const nav = useNavigate();
  const set = (k) => (e) => setS(x => ({ ...x, [k]: e.target.value }));

  // Resume a saved draft: server data is the source of truth, localStorage keeps
  // step position and not-yet-uploaded document list.
  useEffect(() => {
    (async () => {
      try {
        const { startup } = await api.get('/api/startups/mine');
        if (startup) {
          const next = emptyStartup();
          for (const k of S_TEXT) next[k] = startup[k] || (k === 'raising_status' ? 'Actively Raising' : '');
          for (const k of S_NUM) next[k] = startup[k] ? String(startup[k]) : '';
          setS(next);
        }
      } catch { /* no draft yet */ }
      try {
        const local = JSON.parse(localStorage.getItem(draftKey) || '{}');
        if (local.step) setStep(Math.min(local.step, 6));
        if (Array.isArray(local.docs)) setDocs(local.docs);
      } catch { /* no local draft */ }
      setLoaded(true);
    })();
  }, []);

  const startupPayload = () => ({
    ...Object.fromEntries(S_TEXT.map(k => [k, s[k]])),
    ...Object.fromEntries(S_NUM.map(k => [k, s[k] === '' ? 0 : Number(s[k]) || 0])),
    founded_year: Number(s.founded_year) || new Date().getFullYear(),
  });

  const saveDraft = async (silent = false) => {
    try {
      await api.put('/api/users/me', normalizeMe(me));
      if (s.name) await api.post('/api/startups/mine', startupPayload());
      localStorage.setItem(draftKey, JSON.stringify({ step, docs }));
      if (!silent) toast(s.name
        ? 'Progress saved. Sign out any time — you\'ll pick up where you left off.'
        : 'Profile saved. Add a startup name to save your startup draft too.', 'success');
    } catch (e) { if (!silent) toast(e.message, 'error'); }
  };

  const finish = async () => {
    if (!s.name.trim()) return toast('Add a startup name to continue.', 'error');
    if (!s.one_liner.trim()) return toast('Add a one-line description — it\'s how investors find you.', 'error');
    if (!s.video_url) return toast('The 12-minute pitch is required. Your startup won\'t be listed without it.', 'error');
    setBusy(true);
    try {
      await api.put('/api/users/me', normalizeMe(me));
      const { id } = await api.post('/api/startups/mine', startupPayload());
      for (const d of docs) await api.post(`/api/startups/${id}/collateral`, d);
      await api.put('/api/users/me', { onboarded: 1 });
      localStorage.removeItem(draftKey);
      await refresh();
      toast('Welcome to Fundamental. Your startup is live.', 'success');
      nav('/dashboard');
    } catch (e) {
      toast(e.message, 'error');
    } finally { setBusy(false); }
  };

  const filled = [...ME_FIELDS.map(k => me[k]), ...S_TEXT.map(k => s[k]), ...S_NUM.map(k => s[k])].filter(Boolean).length;
  const completion = Math.round((filled / (ME_FIELDS.length + S_TEXT.length + S_NUM.length)) * 100);

  const steps = [
    {
      title: 'About you', sub: 'All optional. This is your personal profile, shown alongside your startup. You can edit it later in Settings.',
      valid: true,
      body: <AboutYouStep me={me} setMe={setMe} />,
    },
    {
      title: 'Startup basics', sub: 'This becomes your public profile in Discover. Only the name and one-line description are required.',
      valid: !!s.name.trim(),
      body: (
        <div className="space-y-4">
          <Field label="Startup name"><input className="input" value={s.name} onChange={set('name')} placeholder="e.g. PayLane" /></Field>
          <Field label="One-line description" hint="required"><input className="input" maxLength={140} value={s.one_liner} onChange={set('one_liner')} placeholder="What you do, in one sentence" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={<>Sector<Optional /></>}>
              <select className="input" value={s.sector} onChange={set('sector')}><option value="">Select…</option>{SECTORS.map(x => <option key={x}>{x}</option>)}</select>
            </Field>
            <Field label={<>Sub-sector<Optional /></>}><input className="input" value={s.subsector} onChange={set('subsector')} placeholder="e.g. Payments, B2B SaaS" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={<>Stage<Optional /></>}>
              <select className="input" value={s.stage} onChange={set('stage')}><option value="">Select…</option>{STAGES.map(x => <option key={x}>{x}</option>)}</select>
            </Field>
            <Field label={<>Founded year<Optional /></>}><input type="number" className="input" value={s.founded_year} onChange={set('founded_year')} placeholder={String(new Date().getFullYear())} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={<>City<Optional /></>}><input className="input" value={s.city} onChange={set('city')} placeholder="e.g. Bengaluru, Riyadh, London…" /></Field>
            <Field label={<>Raising amount<Optional /></>}><input className="input" value={s.raising_amount} onChange={set('raising_amount')} placeholder="e.g. $3M" /></Field>
          </div>
          <Field label="Raising status">
            <select className="input" value={s.raising_status} onChange={set('raising_status')}>
              {['Actively Raising', 'Round Closing', 'Not Raising'].map(x => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <FileUpload label="Logo (optional)" accept="image/*" currentUrl={s.logo} hint="PNG, JPG, or SVG"
              onUploaded={(d) => setS(x => ({ ...x, logo: d.url }))} />
            <FileUpload label="Cover image (optional)" accept="image/*" currentUrl={s.cover} hint="Banner on your startup page"
              onUploaded={(d) => setS(x => ({ ...x, cover: d.url }))} />
          </div>
        </div>
      ),
    },
    {
      title: 'Your story', sub: 'All optional. These fill out your startup page and the AI memo investors generate.',
      valid: true,
      body: (
        <div className="space-y-4">
          <Field label={<>The problem<Optional /></>}><textarea className="input min-h-[80px]" value={s.problem} onChange={set('problem')} placeholder="What's broken, and for whom?" /></Field>
          <Field label={<>Your solution<Optional /></>}><textarea className="input min-h-[80px]" value={s.solution} onChange={set('solution')} placeholder="How you fix it." /></Field>
          <Field label={<>Business model<Optional /></>}><textarea className="input min-h-[64px]" value={s.business_model} onChange={set('business_model')} placeholder="How you make money." /></Field>
          <Field label={<>Market size<Optional /></>}><textarea className="input min-h-[64px]" value={s.market_size} onChange={set('market_size')} placeholder="TAM and SAM, and why now." /></Field>
          <Field label={<>Competitive advantage<Optional /></>}><textarea className="input min-h-[64px]" value={s.competitive_advantage} onChange={set('competitive_advantage')} placeholder="Your moat." /></Field>
        </div>
      ),
    },
    {
      title: 'Metrics', sub: 'All optional. Leave blank if pre-revenue. Real numbers raise your Fundamental Score and investor confidence.',
      valid: true,
      body: (
        <div className="grid grid-cols-2 gap-4">
          <Field label="ARR (USD)"><input type="number" className="input" value={s.arr} onChange={set('arr')} placeholder="0" /></Field>
          <Field label="MRR (USD)"><input type="number" className="input" value={s.mrr} onChange={set('mrr')} placeholder="0" /></Field>
          <Field label="Growth % (MoM)"><input type="number" className="input" value={s.growth} onChange={set('growth')} placeholder="0" /></Field>
          <Field label="Gross margin %"><input type="number" className="input" value={s.gross_margin} onChange={set('gross_margin')} placeholder="0" /></Field>
          <Field label="Monthly burn (USD)"><input type="number" className="input" value={s.burn} onChange={set('burn')} placeholder="0" /></Field>
          <Field label="Runway (months)"><input type="number" className="input" value={s.runway} onChange={set('runway')} placeholder="0" /></Field>
          <Field label="CAC (USD)"><input type="number" className="input" value={s.cac} onChange={set('cac')} placeholder="0" /></Field>
          <Field label="LTV (USD)"><input type="number" className="input" value={s.ltv} onChange={set('ltv')} placeholder="0" /></Field>
        </div>
      ),
    },
    {
      title: 'The round', sub: 'All optional. Context investors see in the use of funds and round sections.',
      valid: true,
      body: (
        <div className="space-y-4">
          <Field label={<>Round details<Optional /></>}><textarea className="input min-h-[80px]" value={s.round_details} onChange={set('round_details')} placeholder="e.g. Raising $3M seed at $15M cap; $1.2M committed." /></Field>
          <Field label={<>Deployment timeline<Optional /></>}><input className="input" value={s.deployment_timeline} onChange={set('deployment_timeline')} placeholder="e.g. 18 months to Series A metrics" /></Field>
          <Field label={<>Strategic objectives<Optional /></>}><textarea className="input min-h-[64px]" value={s.strategic_objectives} onChange={set('strategic_objectives')} placeholder="What this round unlocks." /></Field>
        </div>
      ),
    },
    {
      title: 'Upload your 12-minute pitch', sub: 'Required. Every startup on Fundamental opens with a video pitch — the first thing investors see.',
      valid: true,
      body: (
        <div className="space-y-4">
          <div className="card p-4 border-gold-500/30 bg-gold-500/5 text-sm text-mist-300 leading-relaxed">
            <span className="font-semibold text-gold-300">The 12-minute format:</span> introduction and team → problem → solution → product demo → market and business model → traction → the round. Twelve minutes maximum. Your startup is not listed in Discover without it.
          </div>
          <VideoStep s={s} setS={setS} toast={toast} />
        </div>
      ),
    },
    {
      title: 'Initial collateral', sub: 'Optional for now. Add your deck, financial model, or data room documents. You control access per document.',
      valid: true,
      body: <CollateralStep docs={docs} setDocs={setDocs} />,
    },
  ];

  if (!loaded) return null;
  const cur = steps[step];
  return (
    <Shell step={step} total={steps.length} title={cur.title} sub={cur.sub} completion={completion}>
      {cur.body}
      <div className="flex gap-3 mt-8">
        {step > 0 && <button className="btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}
        {step < steps.length - 1
          ? <button className="btn-primary flex-1" disabled={!cur.valid} onClick={() => { setStep(step + 1); saveDraft(true); }}>Continue</button>
          : <button className="btn-primary flex-1" disabled={busy} onClick={finish}>{busy ? 'Launching…' : 'Launch my startup'}</button>}
      </div>
      <button className="btn-ghost w-full mt-3 !text-mist-400" onClick={() => saveDraft()}>
        Save and finish later
      </button>
      <p className="text-[11px] text-mist-500 text-center mt-2">Only the one-line description and the pitch video are required. You can add the rest any time from Settings.</p>
    </Shell>
  );
}

function VideoStep({ s, setS, toast }) {
  return (
    <div className="space-y-4">
      <FileUpload label="Pitch Video (max 12 minutes — mandatory)" accept="video/*" currentUrl={s.video_url}
        hint="MP4 / WebM / MOV, up to 500MB"
        onUploaded={async (d, file) => {
          const dur = await videoDuration(file);
          if (dur && dur > 12.5 * 60) {
            toast(`That video is ${Math.round(dur / 60)} minutes. The pitch must be 12 minutes or less — tighten it and re-upload.`, 'error');
            return;
          }
          setS(x => ({ ...x, video_url: d.url, video_minutes: dur ? Math.round(dur / 60) : null }));
        }} />
      {s.video_url && (
        <div className="card p-3">
          <video src={s.video_url} controls className="w-full rounded-lg aspect-video bg-black" />
          {s.video_minutes != null && <div className="text-xs text-mist-400 mt-2">Duration ≈ {s.video_minutes} min ✓</div>}
        </div>
      )}
      <div className="text-xs text-mist-500">Hosting your video elsewhere? Paste a direct video URL:</div>
      <input className="input" placeholder="https://… (direct .mp4 link)" value={s.video_url.startsWith('/uploads') ? '' : s.video_url}
        onChange={(e) => setS(x => ({ ...x, video_url: e.target.value, video_minutes: null }))} />
    </div>
  );
}

function CollateralStep({ docs, setDocs }) {
  const [d, setD] = useState({ title: '', type: 'Deck', access_level: 'Public', file_url: '' });
  return (
    <div className="space-y-4">
      {docs.map((doc, i) => (
        <div key={i} className="card p-3.5 flex items-center gap-3">
          <span className="chip-blue">{doc.type}</span>
          <span className="text-sm text-mist-200 flex-1 truncate">{doc.title}</span>
          <span className="chip">{doc.access_level}</span>
          <button className="text-red-400 text-xs hover:text-red-300" onClick={() => setDocs(ds => ds.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title"><input className="input" value={d.title} onChange={(e) => setD(x => ({ ...x, title: e.target.value }))} placeholder="e.g. Investor Deck" /></Field>
          <Field label="Type">
            <select className="input" value={d.type} onChange={(e) => setD(x => ({ ...x, type: e.target.value }))}>{COLLATERAL_TYPES.map(t => <option key={t}>{t}</option>)}</select>
          </Field>
        </div>
        <Field label="Access Level">
          <select className="input" value={d.access_level} onChange={(e) => setD(x => ({ ...x, access_level: e.target.value }))}>
            {['Public', 'Request Access', 'Connected Only'].map(a => <option key={a}>{a}</option>)}
          </select>
        </Field>
        <FileUpload label="Document File" accept=".pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,video/*" currentUrl={d.file_url}
          onUploaded={(u) => setD(x => ({ ...x, file_url: u.url }))} />
        <button className="btn-ghost w-full" disabled={!d.title}
          onClick={() => { setDocs(ds => [...ds, d]); setD({ title: '', type: 'Deck', access_level: 'Public', file_url: '' }); }}>
          + Add Document
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- Investor ----

function InvestorFlow({ user, refresh }) {
  const draftKey = `onb_investor_${user.id}`;
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState(meFromUser(user));
  const [f, setF] = useState({
    fund_name: user.investor?.fund_name || '',
    fund_size: user.investor?.fund_size || '',
    check_size: user.investor?.check_size || '',
    stage_focus: user.investor?.stage_focus || [],
    sector_focus: user.investor?.sector_focus || [],
    thesis: user.investor?.thesis || '',
  });
  const toast = useToast();
  const nav = useNavigate();
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));
  const toggle = (k, v) => setF(x => ({ ...x, [k]: x[k].includes(v) ? x[k].filter(i => i !== v) : [...x[k], v] }));

  useEffect(() => {
    try {
      const local = JSON.parse(localStorage.getItem(draftKey) || '{}');
      if (local.step) setStep(Math.min(local.step, 1));
    } catch { /* no draft */ }
  }, []);

  const payload = (extra = {}) => ({
    ...normalizeMe(me), ...extra,
    investor: { ...f, portfolio: user.investor?.portfolio || [] },
  });

  const saveDraft = async () => {
    try {
      await api.put('/api/users/me', payload());
      localStorage.setItem(draftKey, JSON.stringify({ step }));
      toast('Progress saved — you can sign out and continue any time.', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await api.put('/api/users/me', payload({ onboarded: 1 }));
      localStorage.removeItem(draftKey);
      await refresh();
      toast('Welcome to Fundamental.', 'success');
      nav('/discover');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const filled = [...ME_FIELDS.map(k => me[k]), f.fund_name, f.fund_size, f.check_size, f.thesis,
    f.stage_focus.length, f.sector_focus.length].filter(Boolean).length;
  const completion = Math.round((filled / (ME_FIELDS.length + 6)) * 100);

  const steps = [
    {
      title: 'About you', sub: 'All optional — founders see this profile when you connect. You can edit everything later in Settings.',
      body: <AboutYouStep me={me} setMe={setMe} />,
    },
    {
      title: 'Your fund & focus', sub: 'All optional — your focus powers suggested deal flow and Thesis-Fit matching, so the more you share, the better your sourcing.',
      body: (
        <div className="space-y-4">
          <Field label={<>Fund Name<Optional /></>}><input className="input" value={f.fund_name} onChange={set('fund_name')} placeholder="e.g. Tuwaiq Ventures (or Angel / Family Office)" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={<>Fund Size<Optional /></>}><input className="input" value={f.fund_size} onChange={set('fund_size')} placeholder="e.g. $100M" /></Field>
            <Field label={<>Check Size Range<Optional /></>}><input className="input" value={f.check_size} onChange={set('check_size')} placeholder="e.g. $250K – $2M" /></Field>
          </div>
          <Field label={<>Stage Focus<Optional /></>}>
            <div className="flex flex-wrap gap-2">
              {STAGES.map(st => (
                <button type="button" key={st} onClick={() => toggle('stage_focus', st)}
                  className={f.stage_focus.includes(st) ? 'chip-gold !py-1.5 !px-3 !text-xs' : 'chip !py-1.5 !px-3 !text-xs hover:border-ink-400'}>{st}</button>
              ))}
            </div>
          </Field>
          <Field label={<>Sector Focus<Optional /></>}>
            <div className="flex flex-wrap gap-2">
              {SECTORS.map(sc => (
                <button type="button" key={sc} onClick={() => toggle('sector_focus', sc)}
                  className={f.sector_focus.includes(sc) ? 'chip-gold !py-1.5 !px-3 !text-xs' : 'chip !py-1.5 !px-3 !text-xs hover:border-ink-400'}>{sc}</button>
              ))}
            </div>
          </Field>
          <Field label={<>Investment Thesis<Optional /></>}>
            <textarea className="input min-h-[110px]" value={f.thesis} onChange={set('thesis')} placeholder="What you back and why — founders read this before accepting your connection." />
          </Field>
        </div>
      ),
    },
  ];

  const cur = steps[step];
  return (
    <Shell step={step} total={steps.length} title={cur.title} sub={cur.sub} completion={completion}>
      {cur.body}
      <div className="flex gap-3 mt-8">
        {step > 0 && <button className="btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}
        {step < steps.length - 1
          ? <button className="btn-primary flex-1" onClick={() => setStep(step + 1)}>Continue</button>
          : <button className="btn-primary flex-1" disabled={busy} onClick={finish}>{busy ? 'Saving…' : 'Enter Fundamental'}</button>}
      </div>
      <button className="btn-ghost w-full mt-3 !text-mist-400" onClick={saveDraft}>
        Save progress & finish later
      </button>
      <p className="text-[11px] text-mist-500 text-center mt-2">Nothing here is compulsory — you can complete your profile any time from Settings.</p>
    </Shell>
  );
}
