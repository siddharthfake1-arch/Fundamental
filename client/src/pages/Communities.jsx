import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Users, MessageSquare, ArrowLeft, Plus } from 'lucide-react';
import { api, asArray, asObject, timeAgo } from '../api';
import { Avatar, Empty, Modal, ReportModal, Spinner, VerifiedBadge, useConfirm, useToast } from '../components/ui';

const KIND_LABEL = { topic: 'Topics', city: 'Cities', role: 'Roles' };
const KIND_OPTIONS = [['topic', 'Topic', 'A theme, sector, or interest — e.g. Fintech, AI, Fundraising'], ['city', 'City', 'A place — e.g. Bengaluru, London, San Francisco'], ['role', 'Role', 'A function — e.g. Founders, Angels, Operators']];

export default function Communities() {
  const { slug } = useParams();
  return slug ? <CommunityDetail slug={slug} /> : <CommunityIndex />;
}

function CommunityIndex() {
  const [list, setList] = useState(null);
  const [pending, setPending] = useState([]);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const [joinBusy, setJoinBusy] = useState(null);
  const load = () => api.get('/api/communities').then(d => { setList(asArray(d.communities)); setPending(asArray(d.pending)); }).catch(e => toast(e.message, 'error'));
  useEffect(() => { load(); }, []);
  if (!list) return <Spinner />;

  const join = async (slug) => {
    if (joinBusy) return; // rapid double-tap must not double-fire
    setJoinBusy(slug);
    try { await api.post(`/api/communities/${slug}/join`); await load(); }
    catch (e) { toast(e.message, 'error'); } finally { setJoinBusy(null); }
  };

  const filtered = list.filter(c => String((c.name || '') + ' ' + (c.description || '')).toLowerCase().includes(q.toLowerCase()));
  const kinds = ['topic', 'city', 'role'].filter(kind => filtered.some(c => c.kind === kind));

  return (
    <div className="fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="h-display text-2xl">Communities</h1>
          <p className="text-sm text-mist-400 mt-1 page-sub">Where founders, investors, and operators share what they know.</p>
        </div>
        <div className="flex gap-2">
          <input className="input !w-56" aria-label="Search" placeholder="Search communities…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-primary whitespace-nowrap" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New community</button>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="card p-4 mt-5 border-gold-500/30 bg-gold-500/[0.04]">
          <div className="section-title mb-2">Your submissions</div>
          <div className="space-y-2">
            {pending.map(c => (
              <div key={c.id} className="flex items-center gap-3 flex-wrap">
                <span className="font-display font-bold text-mist-100 text-sm">{c.name}</span>
                <span className="chip capitalize">{c.kind}</span>
                <span className="chip-gold">Pending review</span>
                <span className="text-xs text-mist-500">An admin will review it shortly. You'll be notified when it goes live.</span>
                <button className="text-xs font-semibold text-mist-400 hover:text-red-300 ml-auto"
                  onClick={async () => {
                    if (!await confirm({ title: `Withdraw "${c.name}"?`, body: 'This removes your pending submission.', danger: true, confirmLabel: 'Withdraw' })) return;
                    try { await api.del(`/api/communities/${c.slug}`); toast('Submission withdrawn', 'success'); load(); }
                    catch (e) { toast(e.message, 'error'); }
                  }}>Withdraw</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <CreateCommunityModal open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />
      <div className="mb-7" />
      {kinds.length === 0 && <Empty title="No communities match your search" sub="Try a different term." />}
      {kinds.map(kind => (
        <div key={kind} className="mb-8">
          <div className="section-title mb-3">{KIND_LABEL[kind]}</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filtered.filter(c => c.kind === kind).map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.04 }}
                className="card card-hover p-4 flex flex-col">
                <Link to={`/communities/${c.slug}`} className="group">
                  <div className="font-display font-bold text-mist-100 group-hover:text-gold-300 transition-colors">{c.name}</div>
                  <p className="text-xs text-mist-400 mt-1 line-clamp-2 leading-relaxed">{c.description}</p>
                </Link>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-ink-700/40">
                  <span className="flex items-center gap-3 text-[11px] text-mist-500">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {c.members}</span>
                    <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {c.posts}</span>
                  </span>
                  <button onClick={() => join(c.slug)}
                    className={c.joined ? 'chip-green !cursor-pointer' : 'btn-ghost btn-sm !py-1'}>
                    {c.joined ? '✓ Joined' : 'Join'}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CreateCommunityModal({ open, onClose, onCreated }) {
  const [f, setF] = useState({ name: '', kind: 'topic', description: '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = async () => {
    if (f.name.trim().length < 3) return toast('Give your community a name (at least 3 characters).', 'error');
    setBusy(true);
    try {
      await api.post('/api/communities', f);
      toast('Submitted for review — it will go live once an admin approves it.', 'success');
      setF({ name: '', kind: 'topic', description: '' });
      onCreated();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Create a community">
      <div className="space-y-4">
        <p className="text-sm text-mist-400">Anyone can start a community. An admin reviews it once, then it goes live for people to join, post, and discuss.</p>
        <label className="block"><span className="label">Name</span>
          <input className="input" maxLength={60} value={f.name} placeholder="e.g. Climate Founders" onChange={(e) => setF(x => ({ ...x, name: e.target.value }))} /></label>
        <div>
          <span className="label">Type</span>
          <div className="grid sm:grid-cols-3 gap-2">
            {KIND_OPTIONS.map(([v, t, hint]) => (
              <button type="button" key={v} onClick={() => setF(x => ({ ...x, kind: v }))}
                className={`rounded-xl border p-3 text-left transition-all ${f.kind === v ? 'border-gold-500/70 bg-gold-500/10' : 'border-ink-600/70 bg-ink-850 hover:border-ink-500'}`}>
                <div className={`font-display font-bold text-sm ${f.kind === v ? 'text-gold-300' : 'text-mist-100'}`}>{t}</div>
                <div className="text-[11px] text-mist-400 mt-1 leading-snug">{hint}</div>
              </button>
            ))}
          </div>
        </div>
        <label className="block"><span className="label">Description <span className="normal-case font-normal text-mist-500">(optional)</span></span>
          <textarea className="input min-h-[80px]" maxLength={300} value={f.description} placeholder="What is this community about, and who should join?" onChange={(e) => setF(x => ({ ...x, description: e.target.value }))} /></label>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit for review'}</button>
        </div>
      </div>
    </Modal>
  );
}

// In-community networking: see who's here, view profiles, and connect.
function MembersPanel({ slug }) {
  const [members, setMembers] = useState(null);
  const toast = useToast();
  const load = () => api.get(`/api/communities/${slug}/members`).then(d => setMembers(asArray(d.members))).catch(() => setMembers([]));
  useEffect(() => { load(); }, [slug]);
  const connect = async (id) => {
    try { await api.post(`/api/users/connect/${id}`); toast('Connection request sent', 'success'); load(); }
    catch (e) { toast(e.message, 'error'); }
  };
  if (!members) return <div className="card p-4 mb-5"><Spinner /></div>;
  return (
    <div className="card p-4 mb-5">
      <div className="section-title mb-3">Members</div>
      <div className="grid sm:grid-cols-2 gap-2">
        {members.map(m => (
          <div key={m.id} className="flex items-center gap-3 bg-ink-850 border border-ink-700/50 rounded-xl px-3 py-2">
            <Link to={`/profile/${m.id}`}><Avatar src={m.photo} name={m.name} size={9} /></Link>
            <div className="min-w-0 flex-1">
              <Link to={`/profile/${m.id}`} className="flex items-center gap-1 text-sm font-semibold text-mist-100 hover:text-gold-300 truncate">
                {m.name}{!!m.verified && <VerifiedBadge small tier={m.verified} />}
              </Link>
              <div className="text-[11px] text-mist-500 capitalize truncate">{m.headline || m.role}</div>
            </div>
            {!m.is_me && (
              m.connection === 'accepted' ? <span className="chip-green shrink-0">Connected</span>
              : m.connection === 'pending' ? <span className="chip shrink-0">Pending</span>
              : <button className="btn-ghost btn-sm shrink-0" onClick={() => connect(m.id)}>Connect</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CommunityDetail({ slug }) {
  const [d, setD] = useState(null);
  const [composer, setComposer] = useState(false);
  const [f, setF] = useState({ title: '', body: '' });
  const toast = useToast();
  const nav = useNavigate();
  const [showMembers, setShowMembers] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState({ name: '', description: '', kind: 'topic' });
  const load = () => api.get(`/api/communities/${slug}`).then(setD).catch(e => toast(e.message, 'error'));
  useEffect(() => { setD(null); load(); }, [slug]);
  if (!d) return <Spinner />;
  const c = asObject(d.community);
  const posts = asArray(d.posts);
  const isPending = c.status && c.status !== 'approved';
  const canEditName = c.status === 'pending';

  const startEdit = () => { setEf({ name: c.name || '', description: c.description || '', kind: c.kind || 'topic' }); setEditing(true); };
  const saveEdit = async () => {
    try {
      await api.put(`/api/communities/${slug}`, { name: ef.name, description: ef.description, kind: ef.kind });
      setEditing(false); load(); toast('Community updated', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="max-w-3xl mx-auto fade-in">
      <button onClick={() => nav('/communities')} className="flex items-center gap-1.5 text-sm text-mist-400 hover:text-mist-100 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to communities
      </button>
      {isPending && (
        <div className="card p-4 mb-5 border-gold-500/30 bg-gold-500/[0.04] text-sm text-gold-200">
          This community is <span className="font-semibold">pending admin approval</span>. It isn't visible to others and you can't post until it goes live.
        </div>
      )}
      <div className="card p-6 mb-5">
        {editing ? (
          <div className="space-y-3">
            <div className="section-title">Edit community</div>
            {canEditName ? (
              <label className="block"><span className="label">Name</span>
                <input className="input" maxLength={60} value={ef.name} onChange={(e) => setEf(x => ({ ...x, name: e.target.value }))} /></label>
            ) : (
              <div>
                <span className="label">Name</span>
                <div className="text-sm text-mist-100 font-display font-bold">{c.name}</div>
                <p className="text-[11px] text-mist-500 mt-1">An approved community's name can't be changed.</p>
              </div>
            )}
            {canEditName && (
              <div>
                <span className="label">Type</span>
                <div className="grid sm:grid-cols-3 gap-2">
                  {KIND_OPTIONS.map(([v, t, hint]) => (
                    <button type="button" key={v} onClick={() => setEf(x => ({ ...x, kind: v }))}
                      className={`rounded-xl border p-3 text-left transition-all ${ef.kind === v ? 'border-gold-500/70 bg-gold-500/10' : 'border-ink-600/70 bg-ink-850 hover:border-ink-500'}`}>
                      <div className={`font-display font-bold text-sm ${ef.kind === v ? 'text-gold-300' : 'text-mist-100'}`}>{t}</div>
                      <div className="text-[11px] text-mist-400 mt-1 leading-snug">{hint}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="block"><span className="label">Description</span>
              <textarea className="input min-h-[80px]" maxLength={300} value={ef.description} onChange={(e) => setEf(x => ({ ...x, description: e.target.value }))} /></label>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn-primary btn-sm" onClick={saveEdit}>Save changes</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="h-display text-2xl">{c.name}</h1>
                <span className="chip capitalize">{c.kind}</span>
              </div>
              <p className="text-sm text-mist-400 mt-1.5 max-w-lg">{c.description}</p>
              <div className="flex items-center gap-4 mt-3 text-xs text-mist-500">
                <button className="flex items-center gap-1 hover:text-mist-300" onClick={() => setShowMembers(s => !s)}><Users className="w-3.5 h-3.5" /> {c.members} members</button>
                <span className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> {c.posts} discussions</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {c.is_owner && <button className="btn-ghost btn-sm" onClick={startEdit}>Edit community</button>}
              {!isPending && (
                <button className={c.joined ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'} disabled={memberBusy}
                  onClick={async () => {
                    if (memberBusy) return;
                    setMemberBusy(true);
                    try { await api.post(`/api/communities/${slug}/join`); await load(); }
                    catch (e) { toast(e.message, 'error'); } finally { setMemberBusy(false); }
                  }}>
                  {c.joined ? 'Leave' : 'Join community'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showMembers && <MembersPanel slug={slug} />}

      {c.joined && (
        <div className="card p-4 mb-5">
          {!composer ? (
            <button className="w-full text-left text-sm text-mist-500 bg-ink-850 border border-ink-600/50 rounded-xl px-4 py-3 hover:border-ink-500 transition-colors"
              onClick={() => setComposer(true)}>Start a discussion, share a resource, or ask a question…</button>
          ) : (
            <div className="space-y-3">
              <input className="input" maxLength={140} placeholder="Title — be specific" value={f.title} onChange={(e) => setF(x => ({ ...x, title: e.target.value }))} />
              <textarea className="input min-h-[110px]" maxLength={2000} placeholder="Add context — data, lessons learned, or a question worth answering." value={f.body} onChange={(e) => setF(x => ({ ...x, body: e.target.value }))} />
              <div className="flex justify-end gap-2">
                <button className="btn-ghost btn-sm" onClick={() => setComposer(false)}>Cancel</button>
                <button className="btn-primary btn-sm" disabled={!f.title.trim() || !f.body.trim()} onClick={async () => {
                  try {
                    await api.post(`/api/communities/${slug}/posts`, f);
                    setF({ title: '', body: '' }); setComposer(false); load(); toast('Discussion posted', 'success');
                  } catch (e) { toast(e.message, 'error'); }
                }}>Post discussion</button>
              </div>
            </div>
          )}
        </div>
      )}

      {posts.length === 0 ? (
        <Empty title="No discussions yet" sub={c.joined ? 'Start the first one.' : 'Join to start the first discussion.'} />
      ) : (
        <div className="space-y-4">
          {posts.map(p => <Thread key={p.id} p={p} onChanged={load} />)}
        </div>
      )}
    </div>
  );
}

function Thread({ p, onChanged }) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState(null);
  const [reply, setReply] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState({ title: '', body: '' });
  const [editReply, setEditReply] = useState(null);
  const [erBody, setErBody] = useState('');
  const [reporting, setReporting] = useState(null); // { type, id, label }
  const toast = useToast();
  const confirm = useConfirm();
  const loadReplies = () => api.get(`/api/communities/posts/${p.id}/replies`).then(d => setReplies(asArray(d.replies))).catch(() => {});

  const startEdit = () => { setEf({ title: p.title || '', body: p.body || '' }); setEditing(true); };
  const saveEdit = async () => {
    try { await api.put(`/api/communities/posts/${p.id}`, { title: ef.title, body: ef.body }); setEditing(false); onChanged(); toast('Discussion updated', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const removePost = async () => {
    if (!await confirm({ title: 'Delete this discussion?', body: 'All replies are removed too. This cannot be undone.', danger: true })) return;
    try { await api.del(`/api/communities/posts/${p.id}`); onChanged(); toast('Discussion deleted', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const startEditReply = (r) => { setEditReply(r.id); setErBody(r.body || ''); };
  const saveEditReply = async (r) => {
    try { await api.put(`/api/communities/replies/${r.id}`, { body: erBody }); setEditReply(null); loadReplies(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const removeReply = async (r) => {
    if (!await confirm({ title: 'Delete this reply?', danger: true })) return;
    try { await api.del(`/api/communities/replies/${r.id}`); loadReplies(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const postReply = async () => {
    if (!reply.trim() || replyBusy) return;
    setReplyBusy(true);
    try { await api.post(`/api/communities/posts/${p.id}/replies`, { body: reply }); setReply(''); loadReplies(); }
    catch (er) { toast(er.message, 'error'); } finally { setReplyBusy(false); }
  };

  return (
    <motion.article initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="card p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <Link to={`/profile/${p.author.id}`}><Avatar src={p.author.photo} name={p.author.name} size={8} /></Link>
        <div className="min-w-0">
          <Link to={`/profile/${p.author.id}`} className="flex items-center gap-1.5 text-sm font-semibold text-mist-100 hover:text-gold-300">
            {p.author.name}{!!p.author.verified && <VerifiedBadge small tier={p.author.verified} />}
          </Link>
          <div className="text-[11px] text-mist-500">{p.author.headline} · {timeAgo(p.created_at)}{p.edited && ' · edited'}</div>
        </div>
        {p.can_edit && !editing ? (
          <div className="ml-auto flex items-center gap-2">
            <button className="text-xs font-semibold text-mist-400 hover:text-mist-100" onClick={startEdit}>Edit</button>
            <button className="text-xs font-semibold text-mist-400 hover:text-red-300" onClick={removePost}>Delete</button>
          </div>
        ) : !p.can_edit && (
          <button className="ml-auto text-xs font-semibold text-mist-500 hover:text-mist-200" onClick={() => setReporting({ type: 'discussion', id: p.id, label: 'discussion' })}>Report</button>
        )}
      </div>
      <ReportModal open={!!reporting} onClose={() => setReporting(null)}
        targetType={reporting?.type} targetId={reporting?.id} targetLabel={reporting?.label} />
      {editing ? (
        <div className="space-y-3">
          <input className="input" maxLength={140} placeholder="Title — be specific" value={ef.title} onChange={(e) => setEf(x => ({ ...x, title: e.target.value }))} />
          <textarea className="input min-h-[110px]" maxLength={2000} value={ef.body} onChange={(e) => setEf(x => ({ ...x, body: e.target.value }))} />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn-primary btn-sm" disabled={!ef.title.trim() || !ef.body.trim()} onClick={saveEdit}>Save changes</button>
          </div>
        </div>
      ) : (<>
      <h3 className="font-display font-bold text-mist-100">{p.title}</h3>
      <p className="text-sm text-mist-300 leading-relaxed mt-1.5 whitespace-pre-wrap">{p.body}</p>
      </>)}
      <button className="text-xs font-semibold text-gold-300 hover:text-gold-200 mt-3"
        onClick={() => { setOpen(o => !o); if (!replies) loadReplies(); }}>
        {open ? 'Hide replies' : `${p.replies} repl${p.replies === 1 ? 'y' : 'ies'} — view & respond`}
      </button>
      {open && (
        <div className="mt-4 space-y-3 border-t border-ink-700/40 pt-4">
          {!replies ? <Spinner /> : replies.map(r => (
            <div key={r.id} className="flex gap-2.5">
              <Avatar src={r.author.photo} name={r.author.name} size={7} />
              <div className="bg-ink-850 border border-ink-700/50 rounded-xl px-3.5 py-2.5 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-mist-100">
                  {r.author.name}{!!r.author.verified && <VerifiedBadge small tier={r.author.verified} />}
                  <span className="font-normal text-mist-500">· {timeAgo(r.created_at)}{r.edited && ' · edited'}</span>
                  {r.can_edit && editReply !== r.id ? (
                    <span className="ml-auto flex items-center gap-2">
                      <button className="text-[11px] font-semibold text-mist-400 hover:text-mist-100" onClick={() => startEditReply(r)}>Edit</button>
                      <button className="text-[11px] font-semibold text-mist-400 hover:text-red-300" onClick={() => removeReply(r)}>Delete</button>
                    </span>
                  ) : !r.can_edit && (
                    <button className="ml-auto text-[11px] font-semibold text-mist-600 hover:text-mist-300" onClick={() => setReporting({ type: 'reply', id: r.id, label: 'reply' })}>Report</button>
                  )}
                </div>
                {editReply === r.id ? (
                  <div className="mt-2 space-y-2">
                    <input className="input !py-2" value={erBody} onChange={(e) => setErBody(e.target.value)} />
                    <div className="flex justify-end gap-2">
                      <button className="btn-ghost btn-sm" onClick={() => setEditReply(null)}>Cancel</button>
                      <button className="btn-primary btn-sm" disabled={!erBody.trim()} onClick={() => saveEditReply(r)}>Save</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-mist-200 mt-1 leading-relaxed">{r.body}</p>
                )}
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <input className="input !py-2" placeholder="Write a reply — press Enter to post" value={reply} disabled={replyBusy}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') postReply(); }} />
            <button className="btn-primary btn-sm shrink-0" disabled={!reply.trim() || replyBusy} onClick={postReply}>{replyBusy ? '…' : 'Reply'}</button>
          </div>
        </div>
      )}
    </motion.article>
  );
}
