import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { api, timeAgo } from '../api';
import { useAuth } from '../AuthContext';
import { Avatar, Empty, FileUpload, Spinner, VerifiedBadge, useToast } from '../components/ui';

const TYPE_STYLE = {
  'Fundraising Announcement': 'chip-gold', 'Round Closed': 'chip-green', 'Milestone': 'chip-blue',
  'Hiring': 'chip', 'Product Launch': 'chip-blue', 'Investment Made': 'chip-green', 'Investor Insight': 'chip-gold',
};

const FORMATS = [['all', 'All'], ['status', 'Status'], ['image', 'Images'], ['video', 'Videos']];
const mediaKind = (m) => !m ? 'status' : /\.(mp4|webm|mov)/i.test(m) ? 'video' : /\.(png|jpe?g|gif|svg|webp)/i.test(m) ? 'image' : 'status';

export default function Social() {
  const { user } = useAuth();
  const [posts, setPosts] = useState(null);
  const [types, setTypes] = useState({ types: [], allowed_for_me: [] });
  const [filter, setFilter] = useState('');
  const [format, setFormat] = useState('all');
  const [q, setQ] = useState('');
  const [composer, setComposer] = useState(false);
  const toast = useToast();

  const load = () => api.get('/api/social' + (filter ? `?type=${encodeURIComponent(filter)}` : ''))
    .then(d => setPosts(d.posts)).catch(e => toast(e.message, 'error'));
  useEffect(load, [filter]);
  useEffect(() => { api.get('/api/social/types').then(setTypes).catch(() => {}); }, []);

  const visible = posts && posts
    .filter(p => format === 'all' || mediaKind(p.media) === format)
    .filter(p => !q || (p.text + ' ' + (p.author?.name || '') + ' ' + (p.startup?.name || '')).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="max-w-2xl mx-auto fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="h-display text-2xl">Social</h1>
          <p className="text-sm text-mist-400 mt-1">A controlled professional feed. 400 characters max — every word earns its place.</p>
        </div>
        <div className="flex gap-2">
          <input className="input !w-44 !py-2 !text-xs" placeholder="Search posts…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input !w-auto !py-2 !text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All categories</option>
            {types.types.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="flex rounded-xl bg-ink-850 border border-ink-600/50 p-1 mb-5 w-fit">
        {FORMATS.map(([v, l]) => (
          <button key={v} onClick={() => setFormat(v)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${format === v ? 'bg-ink-700 text-mist-100' : 'text-mist-400 hover:text-mist-200'}`}>{l}</button>
        ))}
      </div>

      {user.role !== 'admin' && (
        <div className="card p-4 mb-5">
          {!composer ? (
            <button className="w-full text-left text-sm text-mist-500 bg-ink-850 border border-ink-600/60 rounded-xl px-4 py-3 hover:border-ink-500 transition-colors"
              onClick={() => setComposer(true)}>
              Share a {user.role === 'founder' ? 'fundraising update, milestone or launch' : 'investment or insight'}…
            </button>
          ) : (
            <Composer allowed={types.allowed_for_me} onDone={() => { setComposer(false); load(); }} onCancel={() => setComposer(false)} />
          )}
        </div>
      )}

      {!posts ? <Spinner /> : visible.length === 0 ? <Empty title="No posts here yet" sub="Professional updates from the network appear here." /> : (
        <div className="space-y-4">
          {visible.map(p => <Post key={p.id} p={p} onChange={load} />)}
        </div>
      )}
    </div>
  );
}

function Composer({ allowed, onDone, onCancel }) {
  const { user } = useAuth();
  const [type, setType] = useState('');
  const [text, setText] = useState('');
  const [media, setMedia] = useState('');
  const [startupId, setStartupId] = useState('');
  const [startups, setStartups] = useState([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.get('/api/startups?sort=recent').then(d => setStartups(d.startups)).catch(() => {});
    if (user.role === 'founder' && user.startup) setStartupId(String(user.startup.id));
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <span className="label">Post type (required)</span>
        <div className="flex flex-wrap gap-2">
          {allowed.map(t => (
            <button key={t} onClick={() => setType(t)}
              className={type === t ? 'chip-gold !py-1.5 !px-3 !text-xs' : 'chip !py-1.5 !px-3 !text-xs hover:border-ink-400'}>{t}</button>
          ))}
        </div>
      </div>
      <div>
        <textarea className="input min-h-[110px]" maxLength={400} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Write a substantive professional update. Specifics — numbers, names, dates — earn attention here." />
        <div className={`text-right text-[11px] mt-1 tabular-nums ${text.length > 360 ? 'text-amber-400' : 'text-mist-500'}`}>{text.length}/400</div>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 items-end">
        <div>
          <span className="label">Tag Startup (optional)</span>
          <select className="input" value={startupId} onChange={(e) => setStartupId(e.target.value)}>
            <option value="">None</option>
            {startups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <FileUpload label="Add Image" accept="image/*" currentUrl={/\.(png|jpe?g|gif|svg|webp)/i.test(media) ? media : ''}
          onUploaded={(d) => setMedia(d.url)} />
        <FileUpload label="Add Video" accept="video/*" currentUrl={/\.(mp4|webm|mov)/i.test(media) ? media : ''}
          onUploaded={(d) => setMedia(d.url)} />
      </div>
      {media && (
        <div className="flex items-center justify-between text-xs bg-ink-850 border border-ink-700/50 rounded-xl px-3 py-2">
          <span className="text-emerald-400 font-medium">✓ Media attached</span>
          <button className="text-mist-500 hover:text-red-400" onClick={() => setMedia('')}>Remove</button>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <button className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn-primary btn-sm" disabled={!type || text.trim().length < 10 || busy} onClick={async () => {
          setBusy(true);
          try { await api.post('/api/social', { type, text, startup_id: startupId || null, media }); onDone(); toast('Posted', 'success'); }
          catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
        }}>Publish</button>
      </div>
    </div>
  );
}

function Post({ p, onChange }) {
  const [comment, setComment] = useState('');
  const [showComments, setShowComments] = useState(false);
  const toast = useToast();

  const like = async () => { try { await api.post(`/api/social/${p.id}/like`); onChange(); } catch (e) { toast(e.message, 'error'); } };
  const share = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/social`); toast('Link copied', 'success'); } catch { toast('Could not copy link', 'error'); }
  };

  return (
    <motion.article className="card p-5"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
      <div className="flex items-start gap-3">
        <Link to={`/profile/${p.author.id}`}><Avatar src={p.author.photo} name={p.author.name} size={11} /></Link>
        <div className="flex-1 min-w-0">
          <Link to={`/profile/${p.author.id}`} className="flex items-center gap-1.5 font-semibold text-mist-100 text-sm hover:text-gold-300">
            {p.author.name}{!!p.author.verified && <VerifiedBadge small />}
          </Link>
          <div className="text-xs text-mist-400 truncate">{p.author.headline}</div>
          <div className="text-[11px] text-mist-500 mt-0.5">{timeAgo(p.created_at)}</div>
        </div>
        <span className={TYPE_STYLE[p.type] || 'chip'}>{p.type}</span>
      </div>

      <p className="text-[15px] text-mist-200 leading-relaxed mt-4 whitespace-pre-wrap">{p.text}</p>

      {p.media && (
        /\.(mp4|webm|mov)/i.test(p.media)
          ? <video src={p.media} controls className="mt-3 rounded-xl w-full bg-black border border-ink-600/60" />
          : /\.(png|jpe?g|gif|svg|webp)/i.test(p.media)
            ? <img src={p.media} alt="" className="mt-3 rounded-xl w-full border border-ink-600/60" />
            : <a href={p.media} target="_blank" rel="noreferrer" className="block mt-3 text-sm text-accent-400 underline">📎 View attachment</a>
      )}

      {p.startup && (
        <Link to={`/startup/${p.startup.id}`} className="flex items-center gap-3 mt-4 bg-ink-850 border border-ink-700/60 rounded-xl p-3 hover:border-gold-500/40 transition-colors">
          <Avatar src={p.startup.logo} name={p.startup.name} size={9} square />
          <div><div className="text-sm font-semibold text-mist-100">{p.startup.name}</div><div className="text-xs text-mist-400">{p.startup.sector}</div></div>
          <span className="ml-auto text-xs text-gold-300">View profile →</span>
        </Link>
      )}

      <div className="flex items-center gap-1 mt-4 pt-3 border-t border-ink-700/60">
        <button onClick={like} className={`btn-ghost btn-sm !border-0 ${p.liked ? '!text-gold-300' : ''}`}>
          {p.liked ? '♥' : '♡'} {p.likes}
        </button>
        <button onClick={() => setShowComments(s => !s)} className="btn-ghost btn-sm !border-0">💬 {p.comments.length}</button>
        <button onClick={share} className="btn-ghost btn-sm !border-0">↗ Share</button>
      </div>

      {showComments && (
        <div className="mt-3 space-y-3">
          {p.comments.map(c => (
            <div key={c.id} className="flex gap-2.5">
              <Avatar src={c.photo} name={c.name} size={7} />
              <div className="bg-ink-850 border border-ink-700/60 rounded-xl px-3.5 py-2 flex-1">
                <div className="text-xs font-semibold text-mist-100">{c.name} <span className="font-normal text-mist-500 capitalize">· {c.role}</span></div>
                <div className="text-sm text-mist-200 mt-0.5">{c.text}</div>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <input className="input !py-2" placeholder="Add a professional comment…" value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && comment.trim()) {
                  try { await api.post(`/api/social/${p.id}/comment`, { text: comment }); setComment(''); onChange(); }
                  catch (er) { toast(er.message, 'error'); }
                }
              }} />
          </div>
        </div>
      )}
    </motion.article>
  );
}
