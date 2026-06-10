import { useState } from 'react';
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
  return user.role === 'founder' ? <FounderFlow refresh={refresh} /> : <InvestorFlow refresh={refresh} />;
}

function Shell({ step, total, title, sub, children, completion }) {
  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <Logo />
        {completion != null && (
          <div className="text-right">
            <div className="text-[11px] text-mist-400 uppercase tracking-wider font-semibold">Profile Completion</div>
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

const Field = ({ label, children }) => <div><span className="label">{label}</span>{children}</div>;

function FounderFlow({ refresh }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [s, setS] = useState({
    name: '', sector: '', stage: '', city: '', raising_status: 'Actively Raising', raising_amount: '',
    one_liner: '', logo: '', arr: '', mrr: '', growth: '', burn: '', video_url: '', video_minutes: null,
  });
  const [docs, setDocs] = useState([]);
  const toast = useToast();
  const nav = useNavigate();
  const set = (k) => (e) => setS(x => ({ ...x, [k]: e.target.value }));

  const completion = Math.round(
    ([s.name, s.sector, s.stage, s.city, s.raising_status, s.one_liner, s.logo, s.arr || s.mrr, s.video_url].filter(Boolean).length / 9) * 100
  );

  const finish = async () => {
    if (!s.video_url) return toast('The 12-minute pitch video is mandatory — your startup will not be listed without it.', 'error');
    setBusy(true);
    try {
      const { id } = await api.post('/api/startups/mine', {
        ...s, arr: Number(s.arr) || 0, mrr: Number(s.mrr) || 0, growth: Number(s.growth) || 0, burn: Number(s.burn) || 0,
        founded_year: new Date().getFullYear(),
      });
      for (const d of docs) {
        await api.post(`/api/startups/${id}/collateral`, d);
      }
      await api.put('/api/users/me', { onboarded: 1 });
      await refresh();
      toast('Welcome to Fundamental — your startup is live.', 'success');
      nav('/dashboard');
    } catch (e) {
      toast(e.message, 'error');
    } finally { setBusy(false); }
  };

  const steps = [
    {
      title: 'Tell us about your startup', sub: 'This becomes your public profile in the Discover marketplace.',
      valid: s.name && s.sector && s.stage,
      body: (
        <div className="space-y-4">
          <Field label="Startup Name"><input className="input" value={s.name} onChange={set('name')} placeholder="e.g. PayLane" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Sector">
              <select className="input" value={s.sector} onChange={set('sector')}><option value="">Select…</option>{SECTORS.map(x => <option key={x}>{x}</option>)}</select>
            </Field>
            <Field label="Stage">
              <select className="input" value={s.stage} onChange={set('stage')}><option value="">Select…</option>{STAGES.map(x => <option key={x}>{x}</option>)}</select>
            </Field>
          </div>
          <Field label="City"><input className="input" value={s.city} onChange={set('city')} placeholder="e.g. Riyadh" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Raising Status">
              <select className="input" value={s.raising_status} onChange={set('raising_status')}>
                {['Actively Raising', 'Round Closing', 'Not Raising'].map(x => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Raising Amount"><input className="input" value={s.raising_amount} onChange={set('raising_amount')} placeholder="e.g. $3M" /></Field>
          </div>
          <Field label="One-line Description"><input className="input" maxLength={140} value={s.one_liner} onChange={set('one_liner')} placeholder="What you do, in one sharp sentence" /></Field>
          <FileUpload label="Upload Logo" accept="image/*" currentUrl={s.logo} hint="PNG, JPG or SVG"
            onUploaded={(d) => setS(x => ({ ...x, logo: d.url }))} />
        </div>
      ),
    },
    {
      title: 'Add your metrics', sub: 'Investors on Fundamental expect real numbers. Leave blank if pre-revenue.',
      valid: true,
      body: (
        <div className="grid grid-cols-2 gap-4">
          <Field label="ARR (USD)"><input type="number" className="input" value={s.arr} onChange={set('arr')} placeholder="0" /></Field>
          <Field label="MRR (USD)"><input type="number" className="input" value={s.mrr} onChange={set('mrr')} placeholder="0" /></Field>
          <Field label="Growth % (MoM)"><input type="number" className="input" value={s.growth} onChange={set('growth')} placeholder="0" /></Field>
          <Field label="Monthly Burn (USD)"><input type="number" className="input" value={s.burn} onChange={set('burn')} placeholder="0" /></Field>
        </div>
      ),
    },
    {
      title: 'Upload your 12-minute pitch', sub: 'Mandatory. Every startup on Fundamental opens with a video pitch — it is the first thing investors see.',
      valid: !!s.video_url,
      body: (
        <div className="space-y-4">
          <div className="card p-4 border-gold-500/30 bg-gold-500/5 text-sm text-mist-300 leading-relaxed">
            <span className="font-semibold text-gold-300">The 12-minute format:</span> introduction & team → problem → solution → product demo → market & business model → traction → the round. Maximum length 12 minutes; your startup is not listed in Discover without it.
          </div>
          <VideoStep s={s} setS={setS} toast={toast} />
        </div>
      ),
    },
    {
      title: 'Initial collateral', sub: 'Optional now — add your deck, financial model or data room documents. You control access per document.',
      valid: true,
      body: <CollateralStep docs={docs} setDocs={setDocs} />,
    },
  ];

  const cur = steps[step];
  return (
    <Shell step={step} total={steps.length} title={cur.title} sub={cur.sub} completion={completion}>
      {cur.body}
      <div className="flex gap-3 mt-8">
        {step > 0 && <button className="btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}
        {step < steps.length - 1
          ? <button className="btn-primary flex-1" disabled={!cur.valid} onClick={() => setStep(step + 1)}>Continue</button>
          : <button className="btn-primary flex-1" disabled={busy || !s.video_url} onClick={finish}>{busy ? 'Launching…' : 'Launch My Startup'}</button>}
      </div>
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

function InvestorFlow({ refresh }) {
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ fund_name: '', fund_size: '', check_size: '', stage_focus: [], sector_focus: [], thesis: '', portfolio_text: '' });
  const toast = useToast();
  const nav = useNavigate();
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));
  const toggle = (k, v) => setF(x => ({ ...x, [k]: x[k].includes(v) ? x[k].filter(i => i !== v) : [...x[k], v] }));

  const finish = async () => {
    if (!f.fund_name) return toast('Fund name is required', 'error');
    setBusy(true);
    try {
      await api.put('/api/users/me', {
        onboarded: 1,
        investor: { fund_name: f.fund_name, fund_size: f.fund_size, check_size: f.check_size, stage_focus: f.stage_focus, sector_focus: f.sector_focus, thesis: f.thesis, portfolio: [] },
      });
      await refresh();
      toast('Welcome to Fundamental.', 'success');
      nav('/discover');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Shell step={0} total={1} title="Set up your investor profile" sub="Founders see this when you connect. Your focus powers your suggested deal flow.">
      <div className="space-y-4">
        <Field label="Fund Name"><input className="input" value={f.fund_name} onChange={set('fund_name')} placeholder="e.g. Tuwaiq Ventures (or Angel / Family Office)" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Fund Size"><input className="input" value={f.fund_size} onChange={set('fund_size')} placeholder="e.g. $100M" /></Field>
          <Field label="Check Size Range"><input className="input" value={f.check_size} onChange={set('check_size')} placeholder="e.g. $250K – $2M" /></Field>
        </div>
        <Field label="Stage Focus">
          <div className="flex flex-wrap gap-2">
            {STAGES.map(st => (
              <button type="button" key={st} onClick={() => toggle('stage_focus', st)}
                className={f.stage_focus.includes(st) ? 'chip-gold !py-1.5 !px-3 !text-xs' : 'chip !py-1.5 !px-3 !text-xs hover:border-ink-400'}>{st}</button>
            ))}
          </div>
        </Field>
        <Field label="Sector Focus">
          <div className="flex flex-wrap gap-2">
            {SECTORS.map(sc => (
              <button type="button" key={sc} onClick={() => toggle('sector_focus', sc)}
                className={f.sector_focus.includes(sc) ? 'chip-gold !py-1.5 !px-3 !text-xs' : 'chip !py-1.5 !px-3 !text-xs hover:border-ink-400'}>{sc}</button>
            ))}
          </div>
        </Field>
        <Field label="Investment Thesis">
          <textarea className="input min-h-[110px]" value={f.thesis} onChange={set('thesis')} placeholder="What you back and why — founders read this before accepting your connection." />
        </Field>
        <button className="btn-primary w-full !py-3" disabled={busy} onClick={finish}>{busy ? 'Saving…' : 'Enter Fundamental'}</button>
      </div>
    </Shell>
  );
}
