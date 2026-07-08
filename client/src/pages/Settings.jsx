import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { api, asArray, session } from '../api';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';
import { FileUpload, Avatar, Spinner, CityInput, LinksEditor, TeamEditor, useConfirm, useToast } from '../components/ui';
import { absUrl, IS_NATIVE } from '../config';

const Field = ({ label, children }) => <label className="block"><span className="label">{label}</span>{children}</label>;

export default function Settings() {
  const { user, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'account';
  const tabs = [['account', 'Account'], ...(user.role === 'founder' ? [['startup', 'Startup']] : []),
    ...(user.role === 'investor' ? [['investor', 'Investor profile']] : []), ['appearance', 'Appearance'], ['notifications', 'Notifications'], ['security', 'Security']];

  return (
    <div className="max-w-3xl mx-auto fade-in">
      <h1 className="page-title mb-5">Settings</h1>
      <div className="flex gap-1 mb-6 overflow-x-auto no-scrollbar rounded-xl bg-ink-850 border border-ink-600/60 p-1 w-fit max-w-full -mx-1 px-1 sm:mx-0">
        {tabs.map(([t, l]) => (
          <button key={t} onClick={() => setParams({ tab: t })}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors min-h-[42px] ${tab === t ? 'bg-ink-700 text-mist-100' : 'text-mist-400 hover:text-mist-200'}`}>{l}</button>
        ))}
      </div>
      {/* Form tabs stay MOUNTED (hidden, not unmounted) so switching tabs never
          silently discards half-filled edits. */}
      <div className={tab === 'account' ? '' : 'hidden'}><Account user={user} refresh={refresh} /></div>
      {user.role === 'founder' && <div className={tab === 'startup' ? '' : 'hidden'}><StartupSettings /></div>}
      {user.role === 'investor' && <div className={tab === 'investor' ? '' : 'hidden'}><InvestorSettings user={user} refresh={refresh} /></div>}
      {tab === 'appearance' && <Appearance />}
      {tab === 'notifications' && <NotifPrefs user={user} refresh={refresh} />}
      {tab === 'security' && <Security user={user} />}
    </div>
  );
}

function Account({ user, refresh }) {
  const [f, setF] = useState({ name: user.name, city: user.city, headline: user.headline, bio: user.bio, linkedin: user.linkedin, education: user.education, experience: user.experience, photo: user.photo, cover: user.cover || '', links: Array.isArray(user.links) ? user.links : [] });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));
  return (
    <div className="card p-6 space-y-4">
      {f.cover && <img src={absUrl(f.cover)} alt="" className="w-full h-28 object-cover rounded-xl border border-ink-700/50" />}
      <FileUpload label="Cover banner — a wide image for your profile header" accept="image/*" currentUrl={f.cover} onUploaded={(d) => setF(x => ({ ...x, cover: d.url }))} />
      <div className="flex items-center gap-4">
        <Avatar src={f.photo} name={f.name} size={16} />
        <div className="flex-1">
          <FileUpload label="Profile photo" accept="image/*" currentUrl={f.photo} onUploaded={(d) => setF(x => ({ ...x, photo: d.url }))} />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Full name"><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="City"><CityInput value={f.city} onChange={(city) => setF(x => ({ ...x, city }))} placeholder="Search city — e.g. Mumbai, India" /></Field>
      </div>
      <Field label="Headline"><input className="input" value={f.headline} onChange={set('headline')} placeholder="e.g. Founder & CEO, PayLane" /></Field>
      <Field label="Bio"><textarea className="input min-h-[90px]" value={f.bio} onChange={set('bio')} /></Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Education"><input className="input" value={f.education} onChange={set('education')} /></Field>
        <Field label="Previous experience"><input className="input" value={f.experience} onChange={set('experience')} /></Field>
      </div>
      <Field label="Personal LinkedIn"><input className="input" value={f.linkedin} onChange={set('linkedin')} placeholder="https://linkedin.com/in/…" /></Field>

      <div className="pt-2 border-t border-ink-700/60">
        <LinksEditor value={f.links} onChange={(links) => setF(x => ({ ...x, links }))} />
      </div>

      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-mist-500">Google account: {user.google_linked ? <span className="text-emerald-300">Linked</span> : 'Not linked'}</span>
        <button className="btn-primary" disabled={busy} onClick={async () => {
          setBusy(true);
          // Drop blank rows before saving; the server requires a valid URL per link.
          const payload = { ...f, links: f.links.filter(l => (l.url || '').trim()) };
          try { await api.put('/api/users/me', payload); await refresh(); toast('Profile updated', 'success'); }
          catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
        }}>Save changes</button>
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
      const payload = { ...s, ...extra };
      await api.post('/api/startups/mine', payload);
      // Team lives in its own table — persist it in the same save action.
      if (Array.isArray(s.team)) await api.put('/api/startups/mine/team', { team: s.team });
      toast(payload.video_url
        ? 'Startup profile updated.'
        : 'Your profile has been saved, but it will go live only once a video is added.', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const NUM = [['arr', 'ARR (USD)'], ['mrr', 'MRR (USD)'], ['growth', 'Growth % (MoM)'], ['gross_margin', 'Gross margin %'], ['burn', 'Monthly burn (USD)'], ['runway', 'Runway (months)'], ['cac', 'CAC (USD)'], ['ltv', 'LTV (USD)']];
  return (
    <div className="space-y-5">
      <div className="card p-6 space-y-4">
        <h2 className="section-title">Basics and raise</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Startup name"><input className="input" value={s.name || ''} onChange={set('name')} /></Field>
          <Field label="City"><CityInput value={s.city || ''} onChange={(city) => setS(x => ({ ...x, city }))} placeholder="Search city — e.g. San Francisco, USA" /></Field>
          <Field label="Sector"><input className="input" value={s.sector || ''} onChange={set('sector')} /></Field>
          <Field label="Sub-sector"><input className="input" value={s.subsector || ''} onChange={set('subsector')} /></Field>
          <Field label="Stage">
            <select className="input" value={s.stage || ''} onChange={set('stage')}>
              {['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Growth'].map(x => <option key={x}>{x}</option>)}
            </select></Field>
          <Field label="Founded year"><input type="number" inputMode="decimal" className="input" value={s.founded_year || ''} onChange={set('founded_year')} /></Field>
          <Field label="Raising status">
            <select className="input" value={s.raising_status || ''} onChange={set('raising_status')}>
              {['Actively Raising', 'Round Closing', 'Not Raising'].map(x => <option key={x}>{x}</option>)}
            </select></Field>
          <Field label="Raising amount"><input className="input" value={s.raising_amount || ''} onChange={set('raising_amount')} /></Field>
        </div>
        <Field label="One-line description"><input className="input" maxLength={140} value={s.one_liner || ''} onChange={set('one_liner')} /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <FileUpload label="Logo" accept="image/*" currentUrl={s.logo} onUploaded={(d) => setS(x => ({ ...x, logo: d.url }))} />
          <FileUpload label="Cover banner" accept="image/*" currentUrl={s.cover} onUploaded={(d) => setS(x => ({ ...x, cover: d.url }))} />
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="section-title">Executive summary</h2>
        {[['problem', 'Problem'], ['solution', 'Solution'], ['business_model', 'Business model'], ['market_size', 'Market size'],
          ['competitive_advantage', 'Competitive advantage'], ['round_details', 'Current round details'],
          ['deployment_timeline', 'Deployment timeline'], ['strategic_objectives', 'Strategic objectives']].map(([k, l]) => (
          <Field key={k} label={l}><textarea className="input min-h-[70px]" value={s[k] || ''} onChange={set(k)} /></Field>
        ))}
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="section-title">Metrics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {NUM.map(([k, l]) => <Field key={k} label={l}><input type="number" inputMode="decimal" className="input" value={s[k] ?? ''} onChange={set(k)} /></Field>)}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="section-title">Links</h2>
        <LinksEditor value={s.links} onChange={(links) => setS(x => ({ ...x, links }))} />
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="section-title">Team</h2>
        <p className="text-sm text-mist-400 -mt-2">Add your co-founders and key team members. Shown on your company profile.</p>
        <TeamEditor value={s.team} onChange={(team) => setS(x => ({ ...x, team }))} />
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="section-title">12-minute pitch video</h2>
          {s.video_url ? <span className="chip-green">Live</span> : <span className="chip-gold">Draft — not yet public</span>}
        </div>
        <div className="text-xs text-mist-300 bg-gold-500/[0.06] border border-gold-500/30 rounded-lg px-3 py-2">
          You can save your profile without a video, but it will not go live until a video is added.
        </div>
        {s.video_url && <video src={absUrl(s.video_url)} controls className="w-full rounded-xl aspect-video bg-black border border-ink-600/60" />}
        <FileUpload label="Pitch video" accept="video/*" currentUrl={s.video_url} hint="MP4 / WebM / MOV · up to 12 minutes · max 100 MB" maxBytes={100 * 1024 * 1024}
          onUploaded={(d) => {
            if (d.duration && d.duration > 12 * 60) { toast(`That video is ${Math.round(d.duration / 60)} minutes. The pitch must be 12 minutes or less.`, 'error'); return; }
            setS(x => ({ ...x, video_url: d.url, video_duration: d.duration || x.video_duration || 0 }));
          }} />
      </div>

      {s.id && <ManageCollateral startupId={s.id} />}

      <div className="flex justify-end">
        <button className="btn-primary" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save all changes'}</button>
      </div>
    </div>
  );
}

function ManageCollateral({ startupId }) {
  const [docs, setDocs] = useState([]);
  const [d, setD] = useState({ title: '', type: 'Deck', access_level: 'Request Access', file_key: '' });
  const toast = useToast();
  const load = () => api.get(`/api/startups/${startupId}`).then(r => setDocs(asArray(r.collateral))).catch(e => toast(e.message, 'error'));
  useEffect(() => { load(); }, [startupId]);
  return (
    <div className="card p-6 space-y-4">
      <h2 className="section-title">Data room collateral</h2>
      {docs.map(c => <CollateralRow key={c.id} c={c} onChanged={load} />)}
      <div className="grid sm:grid-cols-3 gap-3">
        <input className="input" placeholder="Document title" value={d.title} onChange={(e) => setD(x => ({ ...x, title: e.target.value }))} />
        <select className="input" value={d.type} onChange={(e) => setD(x => ({ ...x, type: e.target.value }))}>
          {['Deck', 'IM', 'Financial Model', 'Industry Overview', 'Product Demo', 'Cap Table'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="input" value={d.access_level} onChange={(e) => setD(x => ({ ...x, access_level: e.target.value }))}>
          {['Public', 'Request Access', 'Connected Only'].map(a => <option key={a}>{a}</option>)}
        </select>
      </div>
      <FileUpload label="File" accept=".pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,.csv,image/*" hint="Max 25 MB per file" maxBytes={25 * 1024 * 1024} private uploaded={!!d.file_key} onUploaded={(u) => setD(x => ({ ...x, file_key: u.key }))} />
      <button className="btn-ghost w-full" disabled={!d.title} onClick={async () => {
        try {
          await api.post(`/api/startups/${startupId}/collateral`, d);
          setD({ title: '', type: 'Deck', access_level: 'Request Access', file_key: '' }); load(); toast('Document added', 'success');
        } catch (e) { toast(e.message, 'error'); }
      }}>+ Add document</button>
    </div>
  );
}

// A data-room document row: inline title edit, access-level change, file replace,
// and remove. Edits go through PUT /collateral/:cid (ownership re-checked server-side).
function CollateralRow({ c, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);
  const toast = useToast();
  const confirm = useConfirm();
  return (
    <div className="bg-ink-850 border border-ink-700/60 rounded-xl px-4 py-2.5 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="chip-blue">{c.type}</span>
        {editing
          ? <input className="input flex-1 min-w-[140px] !py-1.5" value={title} onChange={(e) => setTitle(e.target.value)} />
          : <span className="text-sm text-mist-100 flex-1 min-w-[120px] truncate">{c.title}</span>}
        <span className="text-[11px] text-mist-500">{c.downloads} downloads</span>
        <select className="input !w-auto !py-1.5 !text-xs" value={c.access_level} onChange={async (e) => {
          try { await api.put(`/api/startups/collateral/${c.id}`, { access_level: e.target.value }); onChanged(); toast('Access level updated', 'success'); }
          catch (err) { toast(err.message, 'error'); }
        }}>
          {['Public', 'Request Access', 'Connected Only'].map(a => <option key={a}>{a}</option>)}
        </select>
        {editing ? (
          <>
            <button className="btn-primary btn-sm" disabled={!title.trim()} onClick={async () => {
              try { await api.put(`/api/startups/collateral/${c.id}`, { title }); setEditing(false); onChanged(); toast('Title updated', 'success'); }
              catch (err) { toast(err.message, 'error'); }
            }}>Save</button>
            <button className="btn-ghost btn-sm" onClick={() => { setTitle(c.title); setEditing(false); }}>Cancel</button>
          </>
        ) : (
          <>
            <button className="text-mist-400 hover:text-gold-300 text-xs" onClick={() => setEditing(true)}>Edit</button>
            <button className="text-red-400 hover:text-red-300 text-xs" onClick={async () => {
              if (!await confirm({ title: 'Remove this document?', body: `"${c.title}" will be removed from your data room and its file deleted.`, danger: true, confirmLabel: 'Remove' })) return;
              try { await api.del(`/api/startups/collateral/${c.id}`); onChanged(); toast('Document removed', 'success'); }
              catch (err) { toast(err.message, 'error'); }
            }}>Remove</button>
          </>
        )}
      </div>
      {editing && (
        <FileUpload accept=".pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,.csv,image/*" hint="Replace file (optional · max 25 MB)" maxBytes={25 * 1024 * 1024} private
          onUploaded={async (u) => {
            try { await api.put(`/api/startups/collateral/${c.id}`, { file_key: u.key }); onChanged(); toast('File replaced', 'success'); }
            catch (err) { toast(err.message, 'error'); }
          }} />
      )}
    </div>
  );
}

function InvestorSettings({ user, refresh }) {
  const inv = user.investor || {};
  const [f, setF] = useState({ fund_name: inv.fund_name || '', fund_size: inv.fund_size || '', check_size: inv.check_size || '', thesis: inv.thesis || '', stage_focus: asArray(inv.stage_focus), sector_focus: asArray(inv.sector_focus) });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const toggle = (k, v) => setF(x => ({ ...x, [k]: x[k].includes(v) ? x[k].filter(i => i !== v) : [...x[k], v] }));
  return (
    <div className="card p-6 space-y-4">
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Fund name"><input className="input" value={f.fund_name} onChange={(e) => setF(x => ({ ...x, fund_name: e.target.value }))} /></Field>
        <Field label="Fund size"><input className="input" value={f.fund_size} onChange={(e) => setF(x => ({ ...x, fund_size: e.target.value }))} /></Field>
        <Field label="Check size range"><input className="input" value={f.check_size} onChange={(e) => setF(x => ({ ...x, check_size: e.target.value }))} /></Field>
      </div>
      <Field label="Stage focus">
        <div className="flex flex-wrap gap-2">
          {['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Growth'].map(s => (
            <button key={s} onClick={() => toggle('stage_focus', s)} className={f.stage_focus.includes(s) ? 'chip-gold !py-1.5 !px-3' : 'chip !py-1.5 !px-3 hover:border-ink-400'}>{s}</button>
          ))}
        </div>
      </Field>
      <Field label="Sector focus">
        <div className="flex flex-wrap gap-2">
          {['Fintech', 'Healthtech', 'Edtech', 'Logistics', 'Marketplace', 'SaaS', 'Climate', 'Insurtech', 'Deeptech', 'Consumer'].map(s => (
            <button key={s} onClick={() => toggle('sector_focus', s)} className={f.sector_focus.includes(s) ? 'chip-gold !py-1.5 !px-3' : 'chip !py-1.5 !px-3 hover:border-ink-400'}>{s}</button>
          ))}
        </div>
      </Field>
      <Field label="Investment thesis"><textarea className="input min-h-[100px]" value={f.thesis} onChange={(e) => setF(x => ({ ...x, thesis: e.target.value }))} /></Field>
      <div className="flex justify-end">
        <button className="btn-primary" disabled={busy} onClick={async () => {
          if (busy) return;
          setBusy(true);
          try { await api.put('/api/users/me', { investor: f }); await refresh(); toast('Investor profile saved', 'success'); }
          catch (e) { toast(e.message, 'error'); }
          finally { setBusy(false); }
        }}>{busy ? 'Saving…' : 'Save changes'}</button>
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
        {[['dark', 'Dark', Moon, 'Deep navy — easy on the eyes.'], ['light', 'Light', Sun, 'Crisp and bright for daytime.']].map(([v, label, Icon, sub]) => (
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

const EMAIL_CATEGORIES = [
  ['messages', 'Messages', 'New direct messages'],
  ['connections', 'Connections', 'Connection requests and accepts'],
  ['dealroom', 'Data room', 'Document access requests and approvals'],
  ['activity', 'Activity', 'Deal alerts, milestones, and community updates'],
];

function NotifPrefs({ user, refresh }) {
  const [email, setEmail] = useState(!!user.email_alerts);
  const [inapp, setInapp] = useState(user.inapp_alerts !== 0);
  // A category is ON unless explicitly saved as 0.
  const [prefs, setPrefs] = useState(() => Object.fromEntries(
    EMAIL_CATEGORIES.map(([k]) => [k, (user.email_prefs || {})[k] !== 0])));
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const Toggle = ({ label, sub, value, onChange, small }) => (
    <label className={`flex items-center justify-between cursor-pointer card !rounded-xl px-4 ${small ? 'py-2.5' : 'py-3.5'}`}>
      <div><div className={`${small ? 'text-xs' : 'text-sm'} font-medium text-mist-100`}>{label}</div><div className="text-xs text-mist-400">{sub}</div></div>
      <button type="button" role="switch" aria-checked={value} aria-label={label} onClick={onChange}
        className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${value ? 'bg-gold-400' : 'bg-ink-600'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
  return (
    <div className="card p-6 space-y-3">
      <Toggle label="Email alerts" sub="Master switch for all notification emails" value={email} onChange={() => setEmail(v => !v)} />
      {email && (
        <div className="pl-4 space-y-2 border-l-2 border-ink-700/60">
          {EMAIL_CATEGORIES.map(([k, label, sub]) => (
            <Toggle key={k} small label={label} sub={sub} value={prefs[k]} onChange={() => setPrefs(p => ({ ...p, [k]: !p[k] }))} />
          ))}
        </div>
      )}
      <Toggle label="In-app alerts" sub="Notification center and badge counts" value={inapp} onChange={() => setInapp(v => !v)} />
      <div className="flex justify-end pt-2">
        <button className="btn-primary" disabled={saving} onClick={async () => {
          setSaving(true);
          try {
            await api.put('/api/users/me', {
              email_alerts: email ? 1 : 0, inapp_alerts: inapp ? 1 : 0,
              email_prefs: Object.fromEntries(EMAIL_CATEGORIES.map(([k]) => [k, prefs[k] ? 1 : 0])),
            });
            await refresh(); toast('Preferences saved', 'success');
          } catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
        }}>{saving ? 'Saving…' : 'Save preferences'}</button>
      </div>
    </div>
  );
}

function Security({ user }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <div className="space-y-5 max-w-md">
      <div className="card p-6 space-y-4">
        <h2 className="section-title">Change password</h2>
        <Field label="Current password"><input type="password" className="input" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
        <Field label="New password"><input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Letters and numbers, 8+ characters" /></Field>
        <button className="btn-primary w-full" disabled={busy || !cur || next.length < 8} onClick={async () => {
          setBusy(true);
          try { await api.post('/api/auth/change-password', { current: cur, next }); setCur(''); setNext(''); toast('Password changed', 'success'); }
          catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
        }}>{busy ? 'Updating…' : 'Update password'}</button>
      </div>
      <ChangeEmail user={user} />
      <BlockedMembers />
      <div className="card p-6">
        <div className="text-xs text-mist-500 mb-3">Signed in as {user.email}</div>
        <PrivacyControls user={user} />
      </div>
    </div>
  );
}

// Change the account email: requires the current password AND a verification code
// sent to the NEW address (both factors, since email is the login credential).
function ChangeEmail({ user }) {
  const { refresh } = useAuth();
  const [f, setF] = useState({ email: '', code: '', password: '', sent: false, demo: '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const sendCode = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return toast('Enter a valid new email address', 'error');
    setBusy(true);
    try {
      const d = await api.post('/api/auth/send-otp', { channel: 'email', identifier: f.email });
      setF(x => ({ ...x, sent: true, demo: d.demo_code || '' }));
      toast(d.demo_code ? 'Demo mode — your code is shown below' : `We sent a 6-digit code to ${f.email}`, 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/api/auth/change-email', { new_email: f.email, code: f.code, password: f.password });
      toast('Email updated', 'success');
      setF({ email: '', code: '', password: '', sent: false, demo: '' });
      await refresh();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="card p-6 space-y-4">
      <h2 className="section-title">Change email</h2>
      <p className="text-xs text-mist-500 -mt-2">Your email is how you sign in. We verify the new address with a code before switching.</p>
      <div className="flex gap-2">
        <input className="input flex-1" type="email" placeholder="New email address" value={f.email}
          onChange={(e) => setF(x => ({ ...x, email: e.target.value, sent: false }))} />
        <button className="btn-ghost shrink-0" disabled={busy || !f.email} onClick={sendCode}>{f.sent ? 'Resend code' : 'Send code'}</button>
      </div>
      {f.sent && (
        <>
          {f.demo && <div className="text-xs text-gold-300 bg-gold-500/10 border border-gold-500/30 rounded-lg px-3 py-2">Demo mode — your code is <code className="font-bold">{f.demo}</code></div>}
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="6-digit code"><input className="input tracking-[0.4em]" inputMode="numeric" maxLength={6} value={f.code}
              onChange={(e) => setF(x => ({ ...x, code: e.target.value.replace(/\D/g, '') }))} /></Field>
            <Field label="Current password"><input type="password" className="input" value={f.password}
              onChange={(e) => setF(x => ({ ...x, password: e.target.value }))} /></Field>
          </div>
          <button className="btn-primary w-full" disabled={busy || f.code.length < 6 || !f.password} onClick={submit}>
            {busy ? 'Updating…' : 'Update email'}
          </button>
        </>
      )}
    </div>
  );
}

// Manage blocked members. The profile itself 404s once blocked, so unblocking
// lives here where it is always reachable.
function BlockedMembers() {
  const [list, setList] = useState(null);
  const toast = useToast();
  const load = () => api.get('/api/users/blocked').then(d => setList(asArray(d.blocked))).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  if (!list || list.length === 0) return null;
  return (
    <div className="card p-6 space-y-3">
      <h2 className="section-title">Blocked members</h2>
      {list.map(b => (
        <div key={b.id} className="flex items-center gap-3">
          <Avatar src={b.photo} name={b.name} size={9} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-mist-100 truncate">{b.name}</div>
            <div className="text-xs text-mist-400 capitalize truncate">{b.role}</div>
          </div>
          <button className="btn-ghost btn-sm" onClick={async () => {
            try { await api.post(`/api/users/block/${b.id}`); toast(`${b.name} unblocked`, 'success'); load(); }
            catch (e) { toast(e.message, 'error'); }
          }}>Unblock</button>
        </div>
      ))}
    </div>
  );
}

function PrivacyControls({ user }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { setUser } = useAuth();
  const exportData = async () => {
    try {
      const res = await fetch('/api/users/me/export', { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'fundamental-data-export.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { toast(e.message, 'error'); }
  };
  const deleteAccount = async () => {
    const ok = await confirm({
      title: 'Delete your account?',
      body: 'This permanently deletes your account, profile, startup, messages, and files. It cannot be undone.',
      typed: 'DELETE', danger: true, confirmLabel: 'Delete my account',
    });
    if (!ok) return;
    try {
      await api.del('/api/users/me');
      toast('Your account has been deleted.', 'success');
      if (IS_NATIVE) {
        // In-app teardown: clear the stored token + cached user, drop the session
        // user (renders the logged-out routes), and route to the login screen.
        session.onExpired?.();
        setUser(null);
        window.dispatchEvent(new CustomEvent('session-expired'));
      } else {
        window.location.href = '/';
      }
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="border-t border-ink-700/60 pt-4 mt-2 space-y-3">
      <h2 className="section-title">Your data</h2>
      <p className="text-xs text-mist-500">Download a copy of your data, or permanently delete your account.</p>
      <div className="flex gap-2">
        <button className="btn-ghost btn-sm flex-1" onClick={exportData}>Export my data</button>
        {user.role !== 'admin' && <button className="btn-danger btn-sm flex-1" onClick={deleteAccount}>Delete account</button>}
      </div>
    </div>
  );
}
