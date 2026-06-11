import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';
import { FileUpload, Avatar, Spinner, useToast } from '../components/ui';

const Field = ({ label, children }) => <div><span className="label">{label}</span>{children}</div>;

export default function Settings() {
  const { user, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'account';
  const tabs = [['account', 'Account'], ...(user.role === 'founder' ? [['startup', 'Startup Settings']] : []),
    ...(user.role === 'investor' ? [['investor', 'Investor Profile']] : []), ['appearance', 'Appearance'], ['notifications', 'Notifications'], ['security', 'Security']];

  return (
    <div className="max-w-3xl mx-auto fade-in">
      <h1 className="h-display text-2xl mb-5">Settings</h1>
      <div className="flex gap-1 mb-6 overflow-x-auto rounded-xl bg-ink-850 border border-ink-600/60 p-1 w-fit max-w-full">
        {tabs.map(([t, l]) => (
          <button key={t} onClick={() => setParams({ tab: t })}
            className={`rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${tab === t ? 'bg-ink-700 text-mist-100' : 'text-mist-400 hover:text-mist-200'}`}>{l}</button>
        ))}
      </div>
      {tab === 'account' && <Account user={user} refresh={refresh} />}
      {tab === 'startup' && <StartupSettings />}
      {tab === 'investor' && <InvestorSettings user={user} refresh={refresh} />}
      {tab === 'appearance' && <Appearance />}
      {tab === 'notifications' && <NotifPrefs user={user} refresh={refresh} />}
      {tab === 'security' && <Security user={user} />}
    </div>
  );
}

function Account({ user, refresh }) {
  const [f, setF] = useState({ name: user.name, city: user.city, headline: user.headline, bio: user.bio, linkedin: user.linkedin, education: user.education, experience: user.experience, photo: user.photo, cover: user.cover || '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));
  return (
    <div className="card p-6 space-y-4">
      {f.cover && <img src={f.cover} alt="" className="w-full h-28 object-cover rounded-xl border border-ink-700/50" />}
      <FileUpload label="Cover Banner (wide image, like LinkedIn)" accept="image/*" currentUrl={f.cover} onUploaded={(d) => setF(x => ({ ...x, cover: d.url }))} />
      <div className="flex items-center gap-4">
        <Avatar src={f.photo} name={f.name} size={16} />
        <div className="flex-1">
          <FileUpload label="Profile Photo" accept="image/*" currentUrl={f.photo} onUploaded={(d) => setF(x => ({ ...x, photo: d.url }))} />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Full Name"><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="City"><input className="input" value={f.city} onChange={set('city')} /></Field>
      </div>
      <Field label="Headline"><input className="input" value={f.headline} onChange={set('headline')} placeholder="e.g. Founder & CEO, PayLane" /></Field>
      <Field label="Bio"><textarea className="input min-h-[90px]" value={f.bio} onChange={set('bio')} /></Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Education"><input className="input" value={f.education} onChange={set('education')} /></Field>
        <Field label="Previous Experience"><input className="input" value={f.experience} onChange={set('experience')} /></Field>
      </div>
      <Field label="Personal LinkedIn"><input className="input" value={f.linkedin} onChange={set('linkedin')} placeholder="https://linkedin.com/in/…" /></Field>
      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-mist-500">Google account: {user.google_linked ? <span className="text-emerald-300">Linked</span> : 'Not linked'}</span>
        <button className="btn-primary" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await api.put('/api/users/me', f); await refresh(); toast('Profile saved', 'success'); }
          catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
        }}>Save Changes</button>
      </div>
    </div>
  );
}

function StartupSettings() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => { api.get('/api/startups/mine').then(d => setS(d.startup || {})).catch(() => setS({})); }, []);
  if (!s) return <Spinner />;
  const set = (k) => (e) => setS(x => ({ ...x, [k]: e.target.value }));
  const save = async (extra = {}) => {
    setBusy(true);
    try {
      await api.post('/api/startups/mine', { ...s, ...extra });
      toast('Startup updated', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const NUM = [['arr', 'ARR (USD)'], ['mrr', 'MRR (USD)'], ['growth', 'Growth % (MoM)'], ['gross_margin', 'Gross Margin %'], ['burn', 'Monthly Burn (USD)'], ['runway', 'Runway (months)'], ['cac', 'CAC (USD)'], ['ltv', 'LTV (USD)']];
  return (
    <div className="space-y-5">
      <div className="card p-6 space-y-4">
        <h2 className="section-title">Basics & Raise</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Startup Name"><input className="input" value={s.name || ''} onChange={set('name')} /></Field>
          <Field label="City"><input className="input" value={s.city || ''} onChange={set('city')} /></Field>
          <Field label="Sector"><input className="input" value={s.sector || ''} onChange={set('sector')} /></Field>
          <Field label="Sub-sector"><input className="input" value={s.subsector || ''} onChange={set('subsector')} /></Field>
          <Field label="Stage">
            <select className="input" value={s.stage || ''} onChange={set('stage')}>
              {['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Growth'].map(x => <option key={x}>{x}</option>)}
            </select></Field>
          <Field label="Founded Year"><input type="number" className="input" value={s.founded_year || ''} onChange={set('founded_year')} /></Field>
          <Field label="Raising Status (toggle)">
            <select className="input" value={s.raising_status || ''} onChange={set('raising_status')}>
              {['Actively Raising', 'Round Closing', 'Not Raising'].map(x => <option key={x}>{x}</option>)}
            </select></Field>
          <Field label="Raising Amount"><input className="input" value={s.raising_amount || ''} onChange={set('raising_amount')} /></Field>
        </div>
        <Field label="One-line Description"><input className="input" maxLength={140} value={s.one_liner || ''} onChange={set('one_liner')} /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <FileUpload label="Logo" accept="image/*" currentUrl={s.logo} onUploaded={(d) => setS(x => ({ ...x, logo: d.url }))} />
          <FileUpload label="Cover Banner" accept="image/*" currentUrl={s.cover} onUploaded={(d) => setS(x => ({ ...x, cover: d.url }))} />
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="section-title">Executive Summary</h2>
        {[['problem', 'Problem'], ['solution', 'Solution'], ['business_model', 'Business Model'], ['market_size', 'Market Size'],
          ['competitive_advantage', 'Competitive Advantage'], ['round_details', 'Current Round Details'],
          ['deployment_timeline', 'Deployment Timeline'], ['strategic_objectives', 'Strategic Objectives']].map(([k, l]) => (
          <Field key={k} label={l}><textarea className="input min-h-[70px]" value={s[k] || ''} onChange={set(k)} /></Field>
        ))}
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="section-title">Metrics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {NUM.map(([k, l]) => <Field key={k} label={l}><input type="number" className="input" value={s[k] ?? ''} onChange={set(k)} /></Field>)}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="section-title">12-Minute Pitch Video (Mandatory)</h2>
        {s.video_url && <video src={s.video_url} controls className="w-full rounded-xl aspect-video bg-black border border-ink-600/60" />}
        <FileUpload label="Replace Pitch Video" accept="video/*" currentUrl={s.video_url} hint="Max 12 minutes"
          onUploaded={(d) => setS(x => ({ ...x, video_url: d.url }))} />
        {!s.video_url && <div className="text-xs text-red-300">Without a pitch video, your startup is hidden from Discover.</div>}
      </div>

      {s.id && <ManageCollateral startupId={s.id} />}

      <div className="flex justify-end">
        <button className="btn-primary" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save All Changes'}</button>
      </div>
    </div>
  );
}

function ManageCollateral({ startupId }) {
  const [docs, setDocs] = useState([]);
  const [d, setD] = useState({ title: '', type: 'Deck', access_level: 'Public', file_url: '' });
  const toast = useToast();
  const load = () => api.get(`/api/startups/${startupId}`).then(r => setDocs(r.collateral)).catch(() => {});
  useEffect(load, [startupId]);
  return (
    <div className="card p-6 space-y-4">
      <h2 className="section-title">Manage Collateral (Data Room)</h2>
      {docs.map(c => (
        <div key={c.id} className="flex items-center gap-3 flex-wrap bg-ink-850 border border-ink-700/60 rounded-xl px-4 py-2.5">
          <span className="chip-blue">{c.type}</span>
          <span className="text-sm text-mist-100 flex-1 min-w-[120px] truncate">{c.title}</span>
          <span className="text-[11px] text-mist-500">{c.downloads} downloads</span>
          <select className="input !w-auto !py-1.5 !text-xs" value={c.access_level} onChange={async (e) => {
            await api.put(`/api/startups/collateral/${c.id}`, { access_level: e.target.value }); load(); toast('Access level updated', 'success');
          }}>
            {['Public', 'Request Access', 'Connected Only'].map(a => <option key={a}>{a}</option>)}
          </select>
          <button className="text-red-400 hover:text-red-300 text-xs" onClick={async () => {
            await api.del(`/api/startups/collateral/${c.id}`); load(); toast('Document removed', 'success');
          }}>Delete</button>
        </div>
      ))}
      <div className="grid sm:grid-cols-3 gap-3">
        <input className="input" placeholder="Document title" value={d.title} onChange={(e) => setD(x => ({ ...x, title: e.target.value }))} />
        <select className="input" value={d.type} onChange={(e) => setD(x => ({ ...x, type: e.target.value }))}>
          {['Deck', 'IM', 'Financial Model', 'Industry Overview', 'Product Demo', 'Cap Table'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="input" value={d.access_level} onChange={(e) => setD(x => ({ ...x, access_level: e.target.value }))}>
          {['Public', 'Request Access', 'Connected Only'].map(a => <option key={a}>{a}</option>)}
        </select>
      </div>
      <FileUpload label="File" accept=".pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,video/*" currentUrl={d.file_url} onUploaded={(u) => setD(x => ({ ...x, file_url: u.url }))} />
      <button className="btn-ghost w-full" disabled={!d.title} onClick={async () => {
        try {
          await api.post(`/api/startups/${startupId}/collateral`, d);
          setD({ title: '', type: 'Deck', access_level: 'Public', file_url: '' }); load(); toast('Document added', 'success');
        } catch (e) { toast(e.message, 'error'); }
      }}>+ Add Document</button>
    </div>
  );
}

function InvestorSettings({ user, refresh }) {
  const inv = user.investor || {};
  const [f, setF] = useState({ fund_name: inv.fund_name || '', fund_size: inv.fund_size || '', check_size: inv.check_size || '', thesis: inv.thesis || '', stage_focus: inv.stage_focus || [], sector_focus: inv.sector_focus || [] });
  const toast = useToast();
  const toggle = (k, v) => setF(x => ({ ...x, [k]: x[k].includes(v) ? x[k].filter(i => i !== v) : [...x[k], v] }));
  return (
    <div className="card p-6 space-y-4">
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Fund Name"><input className="input" value={f.fund_name} onChange={(e) => setF(x => ({ ...x, fund_name: e.target.value }))} /></Field>
        <Field label="Fund Size"><input className="input" value={f.fund_size} onChange={(e) => setF(x => ({ ...x, fund_size: e.target.value }))} /></Field>
        <Field label="Check Size Range"><input className="input" value={f.check_size} onChange={(e) => setF(x => ({ ...x, check_size: e.target.value }))} /></Field>
      </div>
      <Field label="Stage Focus">
        <div className="flex flex-wrap gap-2">
          {['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Growth'].map(s => (
            <button key={s} onClick={() => toggle('stage_focus', s)} className={f.stage_focus.includes(s) ? 'chip-gold !py-1.5 !px-3' : 'chip !py-1.5 !px-3 hover:border-ink-400'}>{s}</button>
          ))}
        </div>
      </Field>
      <Field label="Sector Focus">
        <div className="flex flex-wrap gap-2">
          {['Fintech', 'Healthtech', 'Edtech', 'Logistics', 'Marketplace', 'SaaS', 'Climate', 'Insurtech', 'Deeptech', 'Consumer'].map(s => (
            <button key={s} onClick={() => toggle('sector_focus', s)} className={f.sector_focus.includes(s) ? 'chip-gold !py-1.5 !px-3' : 'chip !py-1.5 !px-3 hover:border-ink-400'}>{s}</button>
          ))}
        </div>
      </Field>
      <Field label="Investment Thesis"><textarea className="input min-h-[100px]" value={f.thesis} onChange={(e) => setF(x => ({ ...x, thesis: e.target.value }))} /></Field>
      <div className="flex justify-end">
        <button className="btn-primary" onClick={async () => {
          try { await api.put('/api/users/me', { investor: f }); await refresh(); toast('Investor profile saved', 'success'); }
          catch (e) { toast(e.message, 'error'); }
        }}>Save</button>
      </div>
    </div>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="card p-6">
      <h2 className="section-title mb-1">Theme</h2>
      <p className="text-sm text-mist-400 mb-5">Choose how Fundamental looks for you. Your preference is saved on this device.</p>
      <div className="grid grid-cols-2 gap-4 max-w-md">
        {[['dark', 'Dark', Moon, 'Deep navy. Easy on the eyes.'], ['light', 'Light', Sun, 'Crisp and bright for daytime.']].map(([v, label, Icon, sub]) => (
          <button key={v} onClick={() => setTheme(v)}
            className={`rounded-2xl border p-5 text-left transition-all ${theme === v ? 'border-gold-500/70 bg-gold-500/10 shadow-glow' : 'border-ink-600/70 bg-ink-850 hover:border-ink-500'}`}>
            <Icon className={`w-5 h-5 mb-3 ${theme === v ? 'text-gold-300' : 'text-mist-400'}`} />
            <div className={`font-display font-bold text-sm ${theme === v ? 'text-gold-300' : 'text-mist-100'}`}>{label}</div>
            <div className="text-[11px] text-mist-400 mt-1">{sub}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function NotifPrefs({ user, refresh }) {
  const [email, setEmail] = useState(!!user.email_alerts);
  const [inapp, setInapp] = useState(user.inapp_alerts !== 0);
  const toast = useToast();
  const Toggle = ({ label, sub, value, onChange }) => (
    <label className="flex items-center justify-between cursor-pointer card !rounded-xl px-4 py-3.5">
      <div><div className="text-sm font-medium text-mist-100">{label}</div><div className="text-xs text-mist-400">{sub}</div></div>
      <button type="button" onClick={onChange} className={`w-11 h-6 rounded-full transition-colors relative ${value ? 'bg-gold-400' : 'bg-ink-600'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
  return (
    <div className="card p-6 space-y-3">
      <Toggle label="Email Alerts" sub="Connection requests, access approvals and messages by email" value={email} onChange={() => setEmail(v => !v)} />
      <Toggle label="In-App Alerts" sub="Notification centre and badge counts" value={inapp} onChange={() => setInapp(v => !v)} />
      <div className="flex justify-end pt-2">
        <button className="btn-primary" onClick={async () => {
          try { await api.put('/api/users/me', { email_alerts: email ? 1 : 0, inapp_alerts: inapp ? 1 : 0 }); await refresh(); toast('Preferences saved', 'success'); }
          catch (e) { toast(e.message, 'error'); }
        }}>Save Preferences</button>
      </div>
    </div>
  );
}

function Security({ user }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const toast = useToast();
  return (
    <div className="card p-6 space-y-4 max-w-md">
      <h2 className="section-title">Change Password</h2>
      <Field label="Current Password"><input type="password" className="input" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
      <Field label="New Password"><input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Minimum 8 characters" /></Field>
      <button className="btn-primary w-full" disabled={!cur || next.length < 8} onClick={async () => {
        try { await api.post('/api/auth/change-password', { current: cur, next }); setCur(''); setNext(''); toast('Password changed', 'success'); }
        catch (e) { toast(e.message, 'error'); }
      }}>Update Password</button>
      <div className="text-xs text-mist-500 pt-2">Signed in as {user.email}</div>
    </div>
  );
}
