import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Users, MessageSquare, ArrowLeft } from 'lucide-react';
import { api, timeAgo } from '../api';
import { Avatar, Empty, Spinner, VerifiedBadge, useToast } from '../components/ui';

const KIND_LABEL = { topic: 'Topics', city: 'Cities', role: 'Roles' };

export default function Communities() {
  const { slug } = useParams();
  return slug ? <CommunityDetail slug={slug} /> : <CommunityIndex />;
}

function CommunityIndex() {
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const toast = useToast();
  const load = () => api.get('/api/communities').then(d => setList(d.communities)).catch(e => toast(e.message, 'error'));
  useEffect(load, []);
  if (!list) return <Spinner />;

  const join = async (slug) => {
    try { await api.post(`/api/communities/${slug}/join`); load(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const filtered = list.filter(c => (c.name + ' ' + c.description).toLowerCase().includes(q.toLowerCase()));
  const kinds = ['topic', 'city', 'role'].filter(kind => filtered.some(c => c.kind === kind));

  return (
    <div className="fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="h-display text-2xl">Communities</h1>
          <p className="text-sm text-mist-400 mt-1">Where founders, investors, and operators share what they know.</p>
        </div>
        <input className="input !w-64" aria-label="Search" placeholder="Search communities…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
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

function CommunityDetail({ slug }) {
  const [d, setD] = useState(null);
  const [composer, setComposer] = useState(false);
  const [f, setF] = useState({ title: '', body: '' });
  const toast = useToast();
  const nav = useNavigate();
  const load = () => api.get(`/api/communities/${slug}`).then(setD).catch(e => toast(e.message, 'error'));
  useEffect(() => { setD(null); load(); }, [slug]);
  if (!d) return <Spinner />;
  const { community: c, posts } = d;

  return (
    <div className="max-w-3xl mx-auto fade-in">
      <button onClick={() => nav('/communities')} className="flex items-center gap-1.5 text-sm text-mist-400 hover:text-mist-100 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to communities
      </button>
      <div className="card p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="h-display text-2xl">{c.name}</h1>
              <span className="chip capitalize">{c.kind}</span>
            </div>
            <p className="text-sm text-mist-400 mt-1.5 max-w-lg">{c.description}</p>
            <div className="flex items-center gap-4 mt-3 text-xs text-mist-500">
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {c.members} members</span>
              <span className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> {c.posts} discussions</span>
            </div>
          </div>
          <button className={c.joined ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'}
            onClick={async () => { await api.post(`/api/communities/${slug}/join`); load(); }}>
            {c.joined ? 'Leave' : 'Join community'}
          </button>
        </div>
      </div>

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
          {posts.map(p => <Thread key={p.id} p={p} />)}
        </div>
      )}
    </div>
  );
}

function Thread({ p }) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState(null);
  const [reply, setReply] = useState('');
  const toast = useToast();
  const loadReplies = () => api.get(`/api/communities/posts/${p.id}/replies`).then(d => setReplies(d.replies)).catch(() => {});

  return (
    <motion.article initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="card p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <Link to={`/profile/${p.author.id}`}><Avatar src={p.author.photo} name={p.author.name} size={8} /></Link>
        <div className="min-w-0">
          <Link to={`/profile/${p.author.id}`} className="flex items-center gap-1.5 text-sm font-semibold text-mist-100 hover:text-gold-300">
            {p.author.name}{!!p.author.verified && <VerifiedBadge small tier={p.author.verified} />}
          </Link>
          <div className="text-[11px] text-mist-500">{p.author.headline} · {timeAgo(p.created_at)}</div>
        </div>
      </div>
      <h3 className="font-display font-bold text-mist-100">{p.title}</h3>
      <p className="text-sm text-mist-300 leading-relaxed mt-1.5 whitespace-pre-wrap">{p.body}</p>
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
                  <span className="font-normal text-mist-500">· {timeAgo(r.created_at)}</span>
                </div>
                <p className="text-sm text-mist-200 mt-1 leading-relaxed">{r.body}</p>
              </div>
            </div>
          ))}
          <input className="input !py-2" placeholder="Write a reply — press Enter to post" value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && reply.trim()) {
                try { await api.post(`/api/communities/posts/${p.id}/replies`, { body: reply }); setReply(''); loadReplies(); }
                catch (er) { toast(er.message, 'error'); }
              }
            }} />
        </div>
      )}
    </motion.article>
  );
}
