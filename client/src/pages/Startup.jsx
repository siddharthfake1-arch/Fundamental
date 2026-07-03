import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { api, asArray, asObject, fmtMoney, timeAgo } from '../api';
import { useAuth } from '../AuthContext';
import VideoPlayer from '../components/VideoPlayer';
import { Avatar, BarBreakdown, CoverHero, Empty, LineChart, Modal, ScoreRing, Spinner, VerifiedBadge, useConfirm, useToast } from '../components/ui';

const Section = ({ id, title, action, children }) => (
  <motion.section id={id} className="card p-5 sm:p-6"
    initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
    <div className="flex items-center justify-between gap-3 mb-4">
      <h2 className="section-title !mb-0">{title}</h2>
      {action}
    </div>
    {children}
  </motion.section>
);

// Owner-only "Edit" link to the relevant Settings tab. Renders nothing for others.
const EditLink = ({ show, to = '/settings?tab=startup', label = 'Edit' }) =>
  show ? <Link to={to} className="btn-ghost btn-sm shrink-0">{label}</Link> : null;

export default function Startup() {
  const { id } = useParams();
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteDoc, setNoteDoc] = useState(null);
  const [memo, setMemo] = useState(null);
  const [memoOpen, setMemoOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [intro, setIntro] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();

  const load = () => api.get(`/api/startups/${id}`).then(setD).catch(e => setErr(e.message));
  useEffect(() => { setD(null); setIntro(null); load(); }, [id]);

  // Warm intro path — who in your network can introduce you to this founder
  useEffect(() => {
    if (d && !d.is_owner && !d.connected && d.founder?.id) {
      api.get(`/api/users/intro-path/${d.founder.id}`).then(setIntro).catch(() => {});
    }
  }, [d?.founder?.id, d?.connected]);

  const openMemo = async () => {
    setMemoOpen(true);
    if (!memo) {
      try { setMemo(await api.get(`/api/startups/${id}/memo`)); }
      catch (e) { toast(e.message, 'error'); setMemoOpen(false); }
    }
  };

  if (err) return <Empty title={err} />;
  if (!d) return <Spinner />;
  const s = asObject(d.startup);
  const founder = asObject(d.founder);
  const collateral = asArray(d.collateral);
  const activity = asArray(d.activity);
  const notes = asArray(d.notes);
  const is_owner = d.is_owner;
  const upvoteTrend = asArray(d.upvote_trend);
  const updates = asArray(d.updates);
  const useOfFunds = asArray(s.use_of_funds);
  const team = asArray(s.team);
  const links = asArray(s.links);
  const score = asObject(d.score);
  const scoreBreakdown = asObject(score.breakdown);

  const act = async (fn, ok) => {
    try { await fn(); ok && toast(ok, 'success'); load(); } catch (e) { toast(e.message, 'error'); }
  };

  const connectFounder = () => act(async () => {
    if (d.connected) { const r = await api.post(`/api/messages/start/${founder.id}`); nav(`/messages?c=${r.conversation_id}`); return; }
    await api.post(`/api/users/connect/${founder.id}`);
  }, d.connected ? null : 'Connection request sent');

  const copyLink = async () => {
    const url = `${window.location.origin}/s/${s.id}`;
    try { await navigator.clipboard.writeText(url); toast('Public link copied.', 'success'); }
    catch { toast(url, 'info'); }
  };

  // F-005: enabling public sharing is an explicit, confirmed action — never a side
  // effect of copying. Copy only works once sharing is already on.
  const share = async () => {
    if (s.public_share) return copyLink();
    if (!is_owner) return toast('The founder has not enabled a public link for this startup.', 'info');
    const ok = await confirm({ title: 'Enable public sharing?', confirmLabel: 'Enable & copy link', body: 'Anyone with the link — no account needed — will be able to see this startup\'s name, sector, one-liner, score, and 12-minute pitch video. Your metrics and data room stay private. You can turn this off anytime in Settings.' });
    if (!ok) return;
    try { await api.post('/api/startups/mine', { public_share: 1 }); await load(); toast('Public sharing enabled — link copied.', 'success'); copyLink(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const disableShare = async () => {
    try { await api.post('/api/startups/mine', { public_share: 0 }); await load(); toast('Public sharing disabled.', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  };

  const metrics = [
    ['ARR', s.arr ? fmtMoney(s.arr) : '—'], ['MRR', s.mrr ? fmtMoney(s.mrr) : '—'],
    ['Growth (MoM)', s.growth ? s.growth + '%' : '—'], ['Gross margin', s.gross_margin ? s.gross_margin + '%' : '—'],
    ['Burn rate', s.burn ? fmtMoney(s.burn) + '/mo' : '—'], ['Runway', s.runway ? s.runway + ' mo' : '—'],
    ['CAC', s.cac ? fmtMoney(s.cac) : '—'], ['LTV', s.ltv ? fmtMoney(s.ltv) : '—'],
  ];

  const summary = [
    ['One-line positioning', s.one_liner], ['Problem', s.problem], ['Solution', s.solution],
    ['Business model', s.business_model], ['Market size', s.market_size],
    ['Competitive advantage', s.competitive_advantage], ['Current round', s.round_details],
  ].filter(([, v]) => v);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* ---- Header with cover hero ---- */}
      <CoverHero cover={s.cover} fallbackKey={s.name}>
        <div className="flex flex-col sm:flex-row gap-5 -mt-12 sm:-mt-14 relative">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="rounded-2xl p-1 bg-ink-900 w-fit shadow-lift">
            <Avatar src={s.logo} name={s.name} size={20} square />
          </motion.div>
          <div className="flex-1 min-w-0 sm:pt-14">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="h-display text-2xl sm:text-3xl">{s.name}</h1>
              {!!s.verified && <VerifiedBadge tier={s.verified} />}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-2 text-sm text-mist-400">
              <span className="chip">{s.sector}</span><span className="chip">{s.stage}</span>
              <span>{s.city}</span>{s.founded_year && <span>· Founded {s.founded_year}</span>}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-3">
              {s.raising_status === 'Actively Raising'
                ? <span className="chip-green">● Actively Raising{s.raising_amount && ` — ${s.raising_amount}`}</span>
                : s.raising_status === 'Round Closing'
                  ? <span className="chip-gold">◐ Round Closing{s.raising_amount && ` — ${s.raising_amount}`}</span>
                  : <span className="chip">Not Raising</span>}
              {d.fit != null && <span className="chip-blue" title="Match against your declared thesis">◎ {d.fit}% thesis fit</span>}
              <span className="text-xs text-mist-500">{(s.views ?? 0).toLocaleString()} profile views</span>
            </div>
          </div>
          {d.score && (
            <div className="shrink-0 self-start sm:pt-14 text-center" title={`Completeness ${scoreBreakdown.completeness}/40 · Traction ${scoreBreakdown.traction}/30 · Engagement ${scoreBreakdown.engagement}/20 · Trust ${scoreBreakdown.trust}/10`}>
              <ScoreRing score={score.total} size={72} label="Fundamental Score" />
              <div className="text-[10px] text-mist-500 mt-1.5 max-w-[120px] leading-tight">Informational only — not investment advice.</div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-5 pt-5 border-t border-ink-700/60">
          {!is_owner && (
            <button className="btn-primary btn-sm" onClick={connectFounder} disabled={d.connection_status === 'pending'}>
              {d.connected ? 'Message founder' : d.connection_status === 'pending' ? 'Request pending' : 'Connect with founder'}
            </button>
          )}
          {user.role === 'investor' && !is_owner && (
            <button className={`btn-ghost btn-sm ${s.interested ? '!text-emerald-300 !border-emerald-500/40' : ''}`}
              onClick={() => act(() => api.post(`/api/startups/${s.id}/interest`), s.interested ? null : 'Interest sent — the founder has been notified')}
              title="Signal to the founder that you're interested">
              {s.interested ? '✓ Interested' : '☆ Express interest'}
            </button>
          )}
          {user.role === 'investor' && (
            <button className={`btn-ghost btn-sm ${s.upvoted ? '!text-gold-300 !border-gold-500/40' : ''}`}
              onClick={() => act(() => api.post(`/api/startups/${s.id}/upvote`))} title="One upvote per investor, per startup">
              ▲ {s.upvoted ? 'Upvoted' : 'Upvote'} · {s.upvotes}
            </button>
          )}
          {!is_owner && (
            <button className={`btn-ghost btn-sm ${s.following ? '!text-gold-300 !border-gold-500/40' : ''}`}
              onClick={() => act(() => api.post(`/api/startups/${s.id}/follow`))}
              title="Follow this startup for updates and milestones">
              {s.following ? '✓ Following' : '+ Follow'}{s.followers > 0 ? ` · ${s.followers}` : ''}
            </button>
          )}
          <button className={`btn-ghost btn-sm ${s.saved ? '!text-gold-300 !border-gold-500/40' : ''}`}
            onClick={() => act(() => api.post(`/api/startups/${s.id}/save`))}>
            {s.saved ? '✓ Saved' : 'Save'}
          </button>
          {user.role === 'investor' && !is_owner && (
            <button className="btn-ghost btn-sm" onClick={() => setShareOpen(true)} title="Share this deal with a connected co-investor">⇄ Share deal</button>
          )}
          {user.role === 'investor' && (
            <button className="btn-ghost btn-sm" onClick={() => { setNoteDoc(null); setNoteOpen(true); }}>+ Private note</button>
          )}
          {user.role === 'investor' && (
            <button className="btn-ghost btn-sm !text-gold-300 !border-gold-500/40" onClick={openMemo}>✦ AI memo</button>
          )}
          {is_owner && !s.public_share && (
            <button className="btn-ghost btn-sm" onClick={share} title="Anyone with the link can view — off by default">Enable public link</button>
          )}
          {s.public_share && (
            <>
              <button className="btn-ghost btn-sm !text-emerald-300 !border-emerald-500/40" onClick={copyLink} title="Public sharing is on">● Public · copy link</button>
              {is_owner && <button className="btn-ghost btn-sm" onClick={disableShare}>Make private</button>}
            </>
          )}
          {!is_owner && !s.public_share && user.role === 'investor' && null}
          {is_owner && <Link to="/settings?tab=startup" className="btn-ghost btn-sm ml-auto">Edit startup</Link>}
        </div>
        {intro && !intro.direct && asArray(intro.connectors).length > 0 && (
          <div className="flex items-center gap-3 flex-wrap mt-4 bg-gold-500/5 border border-gold-500/20 rounded-xl px-4 py-3">
            <div className="flex -space-x-2">
              {asArray(intro.connectors).map(c => <Avatar key={c.id} src={c.photo} name={c.name} size={7} />)}
            </div>
            <div className="text-sm text-mist-200">
              <span className="font-semibold text-gold-300">Warm introduction available</span> — you're connected to{' '}
              {asArray(intro.connectors).map((c, i) => (
                <span key={c.id}>
                  <Link to={`/profile/${c.id}`} className="font-semibold text-mist-100 hover:text-gold-300">{c.name}</Link>
                  {i < asArray(intro.connectors).length - 1 ? ', ' : ''}
                </span>
              ))}, who {asArray(intro.connectors).length > 1 ? 'are' : 'is'} connected to {founder.name}.
            </div>
          </div>
        )}
      </CoverHero>

      {/* ---- Section 1: 12-Minute Pitch ---- */}
      <Section id="pitch" title="Section 1 — The 12-minute pitch" action={<EditLink show={is_owner} label="Edit pitch video" />}>
        {s.video_url ? (
          <VideoPlayer src={s.video_url} chapters={asArray(s.video_chapters)} views={s.video_views}
            onFirstPlay={() => api.post(`/api/startups/${s.id}/video-view`).catch(() => {})} />
        ) : (
          <div className="rounded-xl border border-gold-500/30 bg-gold-500/[0.06] p-6 text-center">
            <div className="text-2xl mb-2">◇</div>
            <div className="h-display text-lg text-mist-100">Pitch not published yet</div>
            <p className="text-sm text-mist-300 mt-1.5 max-w-md mx-auto">
              This profile will go live on Fundamental once a pitch video is added.
            </p>
            {is_owner && (
              <Link to="/settings?tab=startup" className="btn-primary btn-sm mt-4 inline-flex">Add your pitch video</Link>
            )}
          </div>
        )}
      </Section>

      {/* ---- Section 2: Executive Summary ---- */}
      <Section id="summary" title="Section 2 — Executive summary" action={<EditLink show={is_owner} label="Edit summary" />}>
        {summary.length === 0 ? <div className="text-sm text-mist-500">Not provided yet.</div> : (
          <div className="space-y-5">
            {summary.map(([k, v]) => (
              <div key={k}>
                <div className="text-xs font-semibold uppercase tracking-wider text-mist-500 mb-1">{k}</div>
                <p className="text-[15px] text-mist-200 leading-relaxed">{v}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ---- Section 3: Metrics Dashboard ---- */}
      <Section id="metrics" title="Section 3 — Metrics dashboard" action={<EditLink show={is_owner} label="Edit metrics" />}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {metrics.map(([k, v]) => (
            <div key={k} className="bg-ink-850 border border-ink-700/60 rounded-xl p-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-mist-500">{k}</div>
              <div className="font-display text-lg font-bold text-mist-100 mt-1 tabular-nums">{v}</div>
            </div>
          ))}
        </div>
        <div className="text-xs font-semibold uppercase tracking-wider text-mist-500 mb-2">Revenue trend</div>
        <LineChart data={asArray(s.revenue_series)} xKey="month" yKey="revenue" format={fmtMoney} />
      </Section>

      {/* ---- Section 4: Collateral / Data Room ---- */}
      <Section id="collateral" title="Section 4 — Collateral · the data room" action={<EditLink show={is_owner} label="Manage data room" />}>
        {collateral.length === 0 ? <div className="text-sm text-mist-500">No documents in the data room yet.</div> : (
          <div className="space-y-2.5">
            {collateral.map(c => (
              <div key={c.id} className="flex items-center gap-3 flex-wrap bg-ink-850 border border-ink-700/60 rounded-xl px-4 py-3">
                <span className="chip-blue shrink-0">{c.type}</span>
                <div className="flex-1 min-w-[140px]">
                  <div className="text-sm font-medium text-mist-100">{c.title}</div>
                  <div className="text-[11px] text-mist-500">Uploaded {timeAgo(c.created_at)}{is_owner && ` · ${c.downloads} downloads`}{c.external && <span className="text-amber-400/80"> · externally hosted — access can’t be revoked</span>}</div>
                </div>
                <span className={c.access_level === 'Public' ? 'chip-green' : c.access_level === 'Connected Only' ? 'chip-gold' : 'chip'}>{c.access_level}</span>
                {c.can_view ? (
                  <button className="btn-ghost btn-sm" disabled={!c.has_file && !c.file_url} onClick={async () => {
                    if (c.file_url) { // external link — open safely
                      api.post(`/api/startups/collateral/${c.id}/download`).catch(() => {});
                      window.open(c.file_url, '_blank', 'noopener,noreferrer');
                    } else if (c.has_file) { // private file — streamed through the access-checked endpoint
                      window.open(`/api/startups/collateral/${c.id}/download`, '_blank', 'noopener,noreferrer');
                    } else {
                      toast('No file attached to this document yet', 'info');
                    }
                  }}>View</button>
                ) : user.role === 'investor' ? (
                  c.my_request === 'pending'
                    ? <span className="chip">Requested</span>
                    : c.my_request === 'rejected'
                      ? <span className="chip-red">Declined</span>
                      : <button className="btn-primary btn-sm" onClick={() => act(() => api.post(`/api/startups/collateral/${c.id}/request`), 'Access requested — the founder has been notified')}>Request access</button>
                ) : <span className="chip">Restricted</span>}
                {user.role === 'investor' && (
                  <button className="text-xs text-mist-500 hover:text-gold-300" title="Add private note on this document"
                    onClick={() => { setNoteDoc(c); setNoteOpen(true); }}>✎ Note</button>
                )}
              </div>
            ))}
          </div>
        )}
        {is_owner && <AccessManager startupId={s.id} onChange={load} />}
        {user.role === 'investor' && notes.length > 0 && (
          <div className="mt-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-mist-500 mb-2">Your private notes <span className="normal-case font-normal">(visible only to you)</span></div>
            <div className="space-y-2">
              {notes.map(n => <NoteRow key={n.id} n={n} onChanged={load} />)}
            </div>
          </div>
        )}
      </Section>

      {/* ---- Section 5: Team ---- */}
      <Section id="team" title="Section 5 — Team" action={<EditLink show={is_owner} label="Edit team" />}>
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          <Avatar src={founder.photo} name={founder.name} size={18} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="h-display text-lg">{founder.name}</span>
              {!!founder.verified && <VerifiedBadge small tier={founder.verified} />}
            </div>
            <div className="text-sm text-gold-300/90 font-medium">{founder.headline || 'Founder'}</div>
            {founder.bio && <p className="text-sm text-mist-300 leading-relaxed mt-2.5">{founder.bio}</p>}
            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              {founder.education && <div><div className="text-[11px] font-semibold uppercase tracking-wider text-mist-500">Education</div><div className="text-sm text-mist-300 mt-0.5">{founder.education}</div></div>}
              {founder.experience && <div><div className="text-[11px] font-semibold uppercase tracking-wider text-mist-500">Previous experience</div><div className="text-sm text-mist-300 mt-0.5">{founder.experience}</div></div>}
            </div>
            <div className="flex gap-2 mt-4 flex-wrap">
              <Link to={`/profile/${founder.id}`} className="btn-ghost btn-sm">View founder profile</Link>
              {founder.linkedin && <a href={founder.linkedin} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">LinkedIn ↗</a>}
            </div>
          </div>
        </div>
        {team.length > 0 && (
          <div className="mt-6 pt-6 border-t border-ink-700/50 grid sm:grid-cols-2 gap-4">
            {team.map(m => (
              <div key={m.id} className="flex gap-3 items-start">
                <Avatar src={m.photo} name={m.name} size={11} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-mist-100">{m.name}</div>
                  {m.role && <div className="text-xs text-gold-300/90 font-medium">{m.role}</div>}
                  {m.bio && <p className="text-xs text-mist-400 leading-relaxed mt-1">{m.bio}</p>}
                  {m.linkedin && <a href={m.linkedin} target="_blank" rel="noreferrer noopener" className="text-xs text-mist-400 hover:text-gold-300 mt-1 inline-block">Profile ↗</a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {links.length > 0 && (
        <Section id="links" title="Links" action={<EditLink show={is_owner} label="Edit links" />}>
          <div className="flex flex-wrap gap-2">
            {links.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noreferrer noopener" className="btn-ghost btn-sm max-w-full truncate">
                {(l.label || l.url.replace(/^https?:\/\/(www\.)?/, '')).slice(0, 60)} ↗
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* ---- Section 6: Activity & Signals ---- */}
      <Section id="activity" title="Section 6 — Activity & signals">
        {activity.length === 0 ? <div className="text-sm text-mist-500">No signals yet.</div> : (
          <ol className="relative border-l border-ink-600/70 ml-2 space-y-5">
            {activity.map(a => <ActivityRow key={a.id} a={a} isOwner={is_owner} onChanged={load} />)}
          </ol>
        )}
        {upvoteTrend.length > 1 && (
          <div className="mt-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-mist-500 mb-2">Upvote trend</div>
            <LineChart data={upvoteTrend} xKey="d" yKey="c" height={100} format={(v) => v + ' ▲'} />
          </div>
        )}
        {is_owner && <PostSignal startupId={s.id} onPosted={load} />}
      </Section>

      {/* ---- Founder Updates (investor updates feed) ---- */}
      <Section id="updates" title="Founder updates">
        {updates.length === 0 ? (
          <div className="text-sm text-mist-500">No investor updates yet.{is_owner && ' Post your first below — founders who update monthly hold investor attention.'}</div>
        ) : (
          <div className="space-y-4">
            {updates.map(u => (
              <UpdateRow key={u.id} u={u} isOwner={is_owner} onChanged={load}
                onReact={(updated) => setD(prev => ({ ...prev, updates: asArray(prev.updates).map(x => x.id === updated.id ? updated : x) }))} />
            ))}
          </div>
        )}
        {is_owner && <UpdateComposer startupId={s.id} onPosted={load} />}
      </Section>

      {/* ---- Section 7: Use of Funds ---- */}
      <Section id="funds" title="Section 7 — Use of funds">
        {useOfFunds.length === 0 && !s.deployment_timeline ? (
          <div className="text-sm text-mist-500">Not provided yet.</div>
        ) : (
          <div className="space-y-6">
            {useOfFunds.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-mist-500 mb-3">Capital allocation</div>
                <BarBreakdown items={useOfFunds} />
              </div>
            )}
            {s.deployment_timeline && s.deployment_timeline !== '—' && (
              <div><div className="text-xs font-semibold uppercase tracking-wider text-mist-500 mb-1">Deployment timeline</div>
                <p className="text-sm text-mist-200 leading-relaxed">{s.deployment_timeline}</p></div>
            )}
            {s.strategic_objectives && (
              <div><div className="text-xs font-semibold uppercase tracking-wider text-mist-500 mb-1">Strategic objectives</div>
                <p className="text-sm text-mist-200 leading-relaxed">{s.strategic_objectives}</p></div>
            )}
          </div>
        )}
      </Section>

      <Modal open={memoOpen} onClose={() => setMemoOpen(false)} title={memo ? memo.title : 'Generating memo…'} wide>
        {!memo ? <Spinner /> : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] text-mist-500">{memo.disclaimer}</span>
              <div className="flex gap-2">
                <button className="btn-ghost btn-sm" onClick={async () => {
                  const md = `# ${memo.title}\n\n${asArray(memo.sections).map(sec => `## ${sec.h}\n${asArray(sec.body).map(b => `- ${b}`).join('\n')}`).join('\n\n')}`;
                  try { await navigator.clipboard.writeText(md); toast('Memo copied as Markdown', 'success'); } catch { toast('Copy failed', 'error'); }
                }}>Copy</button>
                <button className="btn-primary btn-sm" onClick={() => {
                  const md = `# ${memo.title}\n\n${asArray(memo.sections).map(sec => `## ${sec.h}\n${asArray(sec.body).map(b => `- ${b}`).join('\n')}`).join('\n\n')}`;
                  const a = document.createElement('a');
                  const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
                  a.href = url;
                  a.download = `${String(s.name || 'startup').replace(/\s+/g, '_')}_memo.md`;
                  a.click();
                  URL.revokeObjectURL(url); // avoid leaking the blob URL
                }}>Download .md</button>
              </div>
            </div>
            {asArray(memo.sections).map(sec => (
              <div key={sec.h}>
                <div className="section-title mb-2">{sec.h}</div>
                <ul className="space-y-1.5">
                  {asArray(sec.body).map((b, i) => (
                    <li key={i} className="text-sm text-mist-200 leading-relaxed flex gap-2">
                      <span className="text-gold-400/70 shrink-0 mt-0.5">·</span>{b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {shareOpen && <ShareDealModal startup={s} onClose={() => setShareOpen(false)} />}

      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title={noteDoc ? `Private note — ${noteDoc.title}` : 'Add private note'}>
        <div className="space-y-3">
          <div className="text-xs text-mist-400">Visible only to you. Founders never see private notes.</div>
          <textarea className="input min-h-[110px]" autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Diligence thoughts, follow-ups, reference checks" />
          <button className="btn-primary w-full" disabled={!noteText.trim()} onClick={async () => {
            try {
              await api.post(`/api/startups/${s.id}/notes`, { text: noteText, collateral_id: noteDoc?.id });
              setNoteOpen(false); setNoteText(''); toast('Note saved', 'success'); load();
            } catch (e) { toast(e.message, 'error'); }
          }}>Save note</button>
        </div>
      </Modal>
    </div>
  );
}

function AccessManager({ startupId, onChange }) {
  const [reqs, setReqs] = useState([]);
  const toast = useToast();
  const load = () => api.get(`/api/startups/${startupId}/access-requests`).then(d => setReqs(asArray(d.requests))).catch(() => {});
  useEffect(() => { load(); }, [startupId]);
  if (reqs.length === 0) return null;
  const act = async (id, action) => {
    try { await api.post(`/api/startups/access-requests/${id}/${action}`); load(); onChange(); toast(`Request ${action}d`, 'success'); }
    catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="mt-6">
      <div className="text-xs font-semibold uppercase tracking-wider text-mist-500 mb-2">Access requests (founder controls)</div>
      <div className="space-y-2">
        {reqs.map(r => (
          <div key={r.id} className="flex items-center gap-3 flex-wrap bg-ink-850 border border-ink-700/60 rounded-xl px-4 py-2.5">
            <Link to={`/profile/${r.investor_id}`} className="text-sm font-medium text-mist-100 hover:text-gold-300">{r.investor_name}</Link>
            <span className="text-xs text-mist-500 flex-1">requests "{r.title}"</span>
            {r.status === 'pending' ? (
              <div className="flex gap-2">
                <button className="btn-primary btn-sm" onClick={() => act(r.id, 'approve')}>Approve</button>
                <button className="btn-danger btn-sm" onClick={() => act(r.id, 'reject')}>Reject</button>
              </div>
            ) : (
              <div className="flex gap-2 items-center">
                <span className={r.status === 'approved' ? 'chip-green' : 'chip-red'}>{r.status}</span>
                {r.status === 'approved' && <button className="btn-ghost btn-sm" onClick={() => act(r.id, 'revoke')}>Revoke</button>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// An investor's private note with inline edit + delete (own note only).
function NoteRow({ n, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(n.text);
  const toast = useToast();
  const confirm = useConfirm();
  return (
    <div className="bg-gold-500/5 border border-gold-500/20 rounded-xl px-4 py-3 flex gap-3">
      <div className="flex-1">
        {editing ? (
          <div className="space-y-2">
            <textarea className="input min-h-[60px]" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn-primary btn-sm" disabled={!text.trim()} onClick={async () => {
                try { await api.put(`/api/startups/notes/${n.id}`, { text }); setEditing(false); onChanged(); toast('Note updated', 'success'); }
                catch (e) { toast(e.message, 'error'); }
              }}>Save</button>
              <button className="btn-ghost btn-sm" onClick={() => { setText(n.text); setEditing(false); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-mist-200">{n.text}</p>
            <div className="text-[11px] text-mist-500 mt-1">
              {n.collateral_id && <span className="text-gold-400/80">On document · </span>}{timeAgo(n.created_at)}
            </div>
          </>
        )}
      </div>
      {!editing && (
        <div className="flex flex-col items-end gap-1.5">
          <button className="text-mist-500 hover:text-gold-300 text-xs" onClick={() => setEditing(true)}>Edit</button>
          <button className="text-mist-500 hover:text-red-400 text-xs" onClick={async () => {
            if (!await confirm({ title: 'Delete this note?', danger: true })) return;
            try { await api.del(`/api/startups/notes/${n.id}`); onChanged(); } catch (e) { toast(e.message, 'error'); }
          }}>Delete</button>
        </div>
      )}
    </div>
  );
}

const SIGNAL_TYPES = ['Round Opened', 'Round Closed', 'Milestone Achieved', 'Hiring Announcement'];

// One activity/signal row with owner-only inline edit + delete.
function ActivityRow({ a, isOwner, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ type: a.type, text: a.text });
  const toast = useToast();
  const confirm = useConfirm();
  if (editing) {
    return (
      <li className="ml-5 space-y-2">
        <select className="input !py-1.5 !text-xs" value={f.type} onChange={(e) => setF(x => ({ ...x, type: e.target.value }))}>
          {SIGNAL_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <textarea className="input min-h-[52px]" value={f.text} onChange={(e) => setF(x => ({ ...x, text: e.target.value }))} />
        <div className="flex gap-2">
          <button className="btn-primary btn-sm" disabled={!f.text.trim()} onClick={async () => {
            try { await api.put(`/api/startups/activity/${a.id}`, f); setEditing(false); onChanged(); toast('Signal updated', 'success'); }
            catch (e) { toast(e.message, 'error'); }
          }}>Save</button>
          <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </li>
    );
  }
  return (
    <li className="ml-5">
      <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-gold-400 border-2 border-ink-900" />
      <div className="text-xs font-semibold text-gold-300/90 uppercase tracking-wider">{a.type}</div>
      <div className="text-sm text-mist-200 mt-0.5">{a.text}</div>
      <div className="flex items-center gap-3 mt-0.5">
        <span className="text-[11px] text-mist-500">{timeAgo(a.created_at)}</span>
        {isOwner && (
          <>
            <button className="text-[11px] text-mist-400 hover:text-gold-300" onClick={() => { setF({ type: a.type, text: a.text }); setEditing(true); }}>Edit</button>
            <button className="text-[11px] text-mist-400 hover:text-red-300" onClick={async () => {
              if (!await confirm({ title: 'Delete this signal?', danger: true })) return;
              try { await api.del(`/api/startups/activity/${a.id}`); onChanged(); } catch (e) { toast(e.message, 'error'); }
            }}>Delete</button>
          </>
        )}
      </div>
    </li>
  );
}

// One founder-update row with owner-only inline edit + delete.
function UpdateRow({ u, isOwner, onChanged, onReact }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ headline: u.headline, body: u.body, arr: u.arr ?? '', mrr: u.mrr ?? '', growth: u.growth ?? '' });
  const toast = useToast();
  const confirm = useConfirm();
  if (editing) {
    return (
      <div className="bg-ink-850 border border-ink-700/50 rounded-xl p-4 space-y-3">
        <input className="input" maxLength={120} value={f.headline} onChange={(e) => setF(x => ({ ...x, headline: e.target.value }))} />
        <textarea className="input min-h-[80px]" maxLength={400} value={f.body} onChange={(e) => setF(x => ({ ...x, body: e.target.value }))} />
        <div className="grid grid-cols-3 gap-3">
          <input type="number" className="input" placeholder="ARR (USD)" value={f.arr} onChange={(e) => setF(x => ({ ...x, arr: e.target.value }))} />
          <input type="number" className="input" placeholder="MRR (USD)" value={f.mrr} onChange={(e) => setF(x => ({ ...x, mrr: e.target.value }))} />
          <input type="number" className="input" placeholder="Growth %" value={f.growth} onChange={(e) => setF(x => ({ ...x, growth: e.target.value }))} />
        </div>
        <div className="flex gap-2">
          <button className="btn-primary btn-sm" disabled={!f.headline.trim() || !f.body.trim()} onClick={async () => {
            try {
              await api.put(`/api/startups/updates/${u.id}`, { headline: f.headline, body: f.body, arr: f.arr !== '' ? Number(f.arr) : null, mrr: f.mrr !== '' ? Number(f.mrr) : null, growth: f.growth !== '' ? Number(f.growth) : null });
              setEditing(false); onChanged(); toast('Update saved', 'success');
            } catch (e) { toast(e.message, 'error'); }
          }}>Save</button>
          <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-ink-850 border border-ink-700/50 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-semibold text-mist-100 text-sm">{u.headline}</span>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-mist-500">{timeAgo(u.created_at)}</span>
          {isOwner && (
            <>
              <button className="text-[11px] text-mist-400 hover:text-gold-300" onClick={() => { setF({ headline: u.headline, body: u.body, arr: u.arr ?? '', mrr: u.mrr ?? '', growth: u.growth ?? '' }); setEditing(true); }}>Edit</button>
              <button className="text-[11px] text-mist-400 hover:text-red-300" onClick={async () => {
                if (!await confirm({ title: 'Delete this update?', danger: true })) return;
                try { await api.del(`/api/startups/updates/${u.id}`); onChanged(); } catch (e) { toast(e.message, 'error'); }
              }}>Delete</button>
            </>
          )}
        </div>
      </div>
      <p className="text-sm text-mist-300 leading-relaxed mt-1.5">{u.body}</p>
      {(u.arr || u.mrr || u.growth) && (
        <div className="flex gap-2 flex-wrap mt-3">
          {u.arr != null && u.arr > 0 && <span className="chip-gold">ARR {fmtMoney(u.arr)}</span>}
          {u.mrr != null && u.mrr > 0 && <span className="chip-gold">MRR {fmtMoney(u.mrr)}</span>}
          {u.growth != null && u.growth > 0 && <span className="chip-green">+{u.growth}% MoM</span>}
        </div>
      )}
      <ReactionBar update={u} onReact={onReact} />
    </div>
  );
}

function UpdateComposer({ startupId, onPosted }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ headline: '', body: '', arr: '', mrr: '', growth: '' });
  const toast = useToast();
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));
  return (
    <div className="mt-5">
      {!open ? <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>+ Post investor update</button> : (
        <div className="card p-4 space-y-3">
          <input className="input" maxLength={120} placeholder="Headline — e.g. October: crossed ₹2Cr MRR" value={f.headline} onChange={set('headline')} />
          <div>
            <textarea className="input min-h-[90px]" maxLength={400} value={f.body} onChange={set('body')}
              placeholder="What happened, what's next, and where you need help. 400 characters — keep it tight." />
            <div className={`text-right text-[11px] mt-1 tabular-nums ${f.body.length > 360 ? 'text-amber-400' : 'text-mist-500'}`}>{f.body.length}/400</div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input type="number" className="input" placeholder="ARR (USD)" value={f.arr} onChange={set('arr')} />
            <input type="number" className="input" placeholder="MRR (USD)" value={f.mrr} onChange={set('mrr')} />
            <input type="number" className="input" placeholder="Growth %" value={f.growth} onChange={set('growth')} />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary btn-sm" disabled={!f.headline.trim() || !f.body.trim()} onClick={async () => {
              try {
                await api.post(`/api/startups/${startupId}/updates`, {
                  headline: f.headline, body: f.body,
                  arr: f.arr ? Number(f.arr) : null, mrr: f.mrr ? Number(f.mrr) : null, growth: f.growth ? Number(f.growth) : null,
                });
                setOpen(false); setF({ headline: '', body: '', arr: '', mrr: '', growth: '' });
                onPosted(); toast('Update published — your followers have been notified', 'success');
              } catch (e) { toast(e.message, 'error'); }
            }}>Publish update</button>
            <button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

const REACTIONS = ['👏', '🔥', '🎉', '🚀'];

function ReactionBar({ update, onReact }) {
  const toast = useToast();
  const react = async (emoji) => {
    try { onReact(await api.post(`/api/startups/updates/${update.id}/react`, { emoji })); }
    catch (e) { toast(e.message, 'error'); }
  };
  const counts = update.reactions || {};
  return (
    <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-ink-700/40">
      {REACTIONS.map(e => {
        const active = update.my_reaction === e;
        return (
          <button key={e} onClick={() => react(e)} aria-label={`React ${e}`} aria-pressed={active}
            className={`text-sm rounded-full px-2.5 py-1 border transition-colors ${active ? 'bg-gold-500/15 border-gold-500/40 text-gold-200' : 'bg-ink-900 border-ink-700/50 text-mist-400 hover:border-ink-500'}`}>
            <span>{e}</span>{counts[e] ? <span className="ml-1 tabular-nums text-[11px]">{counts[e]}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function ShareDealModal({ startup, onClose }) {
  const [conns, setConns] = useState(null);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    api.get('/api/users/connections')
      .then(d => setConns(asArray(d.accepted).filter(c => c.role === 'investor')))
      .catch(() => setConns([]));
  }, []);
  return (
    <Modal open onClose={onClose} title={`Share ${startup.name} with a co-investor`}>
      <div className="space-y-3">
        <div className="text-xs text-mist-400">Only your connected investors appear here. They'll see this deal in their "Shared with me" inbox.</div>
        {conns === null ? <Spinner /> : conns.length === 0 ? (
          <Empty title="No connected investors yet" sub="Connect with other investors in Network to share deals with them." />
        ) : (
          <>
            <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Choose a co-investor</option>
              {conns.map(c => <option key={c.user_id} value={c.user_id}>{c.name}</option>)}
            </select>
            <textarea className="input min-h-[80px]" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this one? (optional)" />
            <button className="btn-primary w-full" disabled={!to || busy} onClick={async () => {
              setBusy(true);
              try { await api.post(`/api/startups/${startup.id}/share-deal`, { to_id: Number(to), note }); toast('Deal shared', 'success'); onClose(); }
              catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
            }}>Share deal</button>
          </>
        )}
      </div>
    </Modal>
  );
}

function PostSignal({ startupId, onPosted }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('Milestone Achieved');
  const [text, setText] = useState('');
  const toast = useToast();
  return (
    <div className="mt-5">
      {!open ? <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>+ Post a signal</button> : (
        <div className="card p-4 space-y-3">
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {['Round Opened', 'Round Closed', 'Milestone Achieved', 'Hiring Announcement'].map(t => <option key={t}>{t}</option>)}
          </select>
          <textarea className="input min-h-[80px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened?" />
          <div className="flex gap-2">
            <button className="btn-primary btn-sm" disabled={!text.trim()} onClick={async () => {
              try { await api.post(`/api/startups/${startupId}/activity`, { type, text }); setOpen(false); setText(''); onPosted(); toast('Signal posted', 'success'); }
              catch (e) { toast(e.message, 'error'); }
            }}>Post</button>
            <button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
