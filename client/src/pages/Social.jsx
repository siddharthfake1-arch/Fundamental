import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, asArray, timeAgo } from '../api';
import { useAuth } from '../AuthContext';
import { Avatar, Empty, FileUpload, ReportModal, Spinner, VerifiedBadge, useConfirm, useToast } from '../components/ui';
import { absUrl, nativeBridge, shareOrigin } from '../config';

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
    .then(d => setPosts(asArray(d.posts))).catch(e => toast(e.message, 'error'));
  useEffect(() => { load(); }, [filter]);

  // Deep link: /social?post=ID scrolls to and briefly highlights the shared post.
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const pid = searchParams.get('post');
    if (!pid || !posts) return;
    const el = document.getElementById(`post-${pid}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-gold-400/50');
      setTimeout(() => el.classList.remove('ring-2', 'ring-gold-400/50'), 3000);
    }
  }, [posts]);
  useEffect(() => { api.get('/api/social/types').then(d => setTypes({ types: asArray(d?.types), allowed_for_me: asArray(d?.allowed_for_me) })).catch(() => {}); }, []);

  const visible = posts && posts
    .filter(p => format === 'all' || mediaKind(p.media) === format)
    .filter(p => !q || String((p.text || '') + ' ' + (p.author?.name || '') + ' ' + (p.startup?.name || '')).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="max-w-2xl mx-auto fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="h-display text-2xl">Social</h1>
          <p className="text-sm text-mist-400 mt-1">Professional updates from the network, capped at 400 characters.</p>
        </div>
        <div className="flex gap-2">
          <input className="input !w-44 !py-2 !text-xs" aria-label="Search" placeholder="Search posts…" value={q} onChange={(e) => setQ(e.target.value)} />
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
              Share {user.role === 'founder' ? 'a fundraising update, milestone, or launch' : 'an investment or insight'}…
            </button>
          ) : (
            <Composer allowed={types.allowed_for_me} onDone={() => { setComposer(false); load(); }} onCancel={() => setComposer(false)} />
          )}
        </div>
      )}

      {!posts ? <Spinner /> : visible.length === 0 ? <Empty title="No posts yet" sub="Updates from the network appear here." /> : (
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
    api.get('/api/startups?sort=recent').then(d => setStartups(asArray(d.startups))).catch(() => {});
    if (user.role === 'founder' && user.startup) setStartupId(String(user.startup.id));
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <span className="label">Post type — required</span>
        <div className="flex flex-wrap gap-2">
          {allowed.map(t => (
            <button key={t} onClick={() => setType(t)}
              className={type === t ? 'chip-gold !py-1.5 !px-3 !text-xs' : 'chip !py-1.5 !px-3 !text-xs hover:border-ink-400'}>{t}</button>
          ))}
        </div>
      </div>
      <div>
        <textarea className="input min-h-[110px]" maxLength={400} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Share a clear, specific update — numbers, names, and dates carry the most weight." />
        <div className={`text-right text-[11px] mt-1 tabular-nums ${text.length > 360 ? 'text-amber-400' : 'text-mist-500'}`}>{text.length}/400</div>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 items-end">
        <div>
          <span className="label">Tag a startup — optional</span>
          <select className="input" value={startupId} onChange={(e) => setStartupId(e.target.value)}>
            <option value="">None</option>
            {startups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <FileUpload label="Add image" accept="image/*" currentUrl={/\.(png|jpe?g|gif|svg|webp)/i.test(media) ? media : ''}
          onUploaded={(d) => setMedia(d.url)} />
        <FileUpload label="Add video" accept="video/*" currentUrl={/\.(mp4|webm|mov)/i.test(media) ? media : ''}
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
        }}>Publish post</button>
      </div>
    </div>
  );
}

function Post({ p, onChange }) {
  const [comment, setComment] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(p.text || '');
  const [editType, setEditType] = useState(p.type);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editComment, setEditComment] = useState(null);
  const [editCommentText, setEditCommentText] = useState('');
  // Optimistic like: flip locally at once, reconcile with the server response —
  // no full-feed refetch, no scroll jump, no double-fire while in flight.
  const [likeState, setLikeState] = useState({ liked: !!p.liked, likes: p.likes, busy: false });
  const [commentBusy, setCommentBusy] = useState(false);
  const [reporting, setReporting] = useState(null); // { type, id, label }
  const toast = useToast();
  const confirm = useConfirm();

  const comments = asArray(p.comments);
  const like = async () => {
    if (likeState.busy) return;
    setLikeState(s => ({ liked: !s.liked, likes: s.likes + (s.liked ? -1 : 1), busy: true }));
    try {
      const r = await api.post(`/api/social/${p.id}/like`);
      setLikeState({ liked: r.liked, likes: r.likes, busy: false });
    } catch (e) {
      setLikeState({ liked: !!p.liked, likes: p.likes, busy: false }); // roll back
      toast(e.message, 'error');
    }
  };
  const share = async () => {
    const url = `${shareOrigin()}/social?post=${p.id}`;
    if (nativeBridge.share) { try { await nativeBridge.share({ url }); } catch { /* user dismissed */ } return; }
    try { await navigator.clipboard.writeText(url); toast('Link to this post copied', 'success'); }
    catch { toast('Could not copy link', 'error'); }
  };

  const savePost = async () => {
    setSavingEdit(true);
    try {
      await api.put(`/api/social/${p.id}`, { text: editText, type: editType, media: p.media, startup_id: p.startup_id || null });
      setEditing(false); onChange(); toast('Post updated', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setSavingEdit(false); }
  };
  const deletePost = async () => {
    if (!await confirm({ title: 'Delete this post?', body: 'This cannot be undone.', danger: true })) return;
    try { await api.del(`/api/social/${p.id}`); onChange(); toast('Post deleted', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const saveComment = async (c) => {
    try { await api.put(`/api/social/comments/${c.id}`, { text: editCommentText }); setEditComment(null); onChange(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const deleteComment = async (c) => {
    if (!await confirm({ title: 'Delete this comment?', danger: true })) return;
    try { await api.del(`/api/social/comments/${c.id}`); onChange(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const postComment = async () => {
    if (!comment.trim() || commentBusy) return;
    setCommentBusy(true);
    try { await api.post(`/api/social/${p.id}/comment`, { text: comment }); setComment(''); onChange(); }
    catch (er) { toast(er.message, 'error'); } finally { setCommentBusy(false); }
  };

  return (
    <motion.article id={`post-${p.id}`} className="card p-5 transition-shadow"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
      <div className="flex items-start gap-3">
        <Link to={`/profile/${p.author.id}`}><Avatar src={p.author.photo} name={p.author.name} size={11} /></Link>
        <div className="flex-1 min-w-0">
          <Link to={`/profile/${p.author.id}`} className="flex items-center gap-1.5 font-semibold text-mist-100 text-sm hover:text-gold-300">
            {p.author.name}{!!p.author.verified && <VerifiedBadge small />}
          </Link>
          <div className="text-xs text-mist-400 truncate">{p.author.headline}</div>
          <div className="text-[11px] text-mist-500 mt-0.5">{timeAgo(p.created_at)}{p.edited && ' · edited'}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={TYPE_STYLE[p.type] || 'chip'}>{p.type}</span>
          {p.can_edit && !editing && (
            <div className="flex gap-1">
              <button className="text-[11px] text-mist-500 hover:text-mist-200" onClick={() => { setEditText(p.text || ''); setEditType(p.type); setEditing(true); }}>Edit</button>
              <span className="text-[11px] text-mist-600">·</span>
              <button className="text-[11px] text-mist-500 hover:text-red-400" onClick={deletePost}>Delete</button>
            </div>
          )}
        </div>
      </div>

      {p.can_edit && editing ? (
        <div className="space-y-3 mt-4">
          <select className="input !w-auto !py-2 !text-xs" value={editType} onChange={(e) => setEditType(e.target.value)}>
            {Object.keys(TYPE_STYLE).map(t => <option key={t}>{t}</option>)}
          </select>
          <div>
            <textarea className="input min-h-[110px]" maxLength={400} value={editText} onChange={(e) => setEditText(e.target.value)} />
            <div className={`text-right text-[11px] mt-1 tabular-nums ${editText.length > 360 ? 'text-amber-400' : 'text-mist-500'}`}>{editText.length}/400</div>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn-primary btn-sm" disabled={editText.trim().length < 10 || savingEdit} onClick={savePost}>Save changes</button>
          </div>
        </div>
      ) : (
        <p className="text-[15px] text-mist-200 leading-relaxed mt-4 whitespace-pre-wrap">{p.text}</p>
      )}

      {p.media && (
        /\.(mp4|webm|mov)/i.test(p.media)
          ? <video src={absUrl(p.media)} controls className="mt-3 rounded-xl w-full bg-black border border-ink-600/60" />
          : /\.(png|jpe?g|gif|svg|webp)/i.test(p.media)
            ? <img src={absUrl(p.media)} alt="" className="mt-3 rounded-xl w-full border border-ink-600/60" />
            : <a href={absUrl(p.media)} target="_blank" rel="noreferrer" className="block mt-3 text-sm text-accent-400 underline">📎 View attachment</a>
      )}

      {p.startup && (
        <Link to={`/startup/${p.startup.id}`} className="flex items-center gap-3 mt-4 bg-ink-850 border border-ink-700/60 rounded-xl p-3 hover:border-gold-500/40 transition-colors">
          <Avatar src={p.startup.logo} name={p.startup.name} size={9} square />
          <div><div className="text-sm font-semibold text-mist-100">{p.startup.name}</div><div className="text-xs text-mist-400">{p.startup.sector}</div></div>
          <span className="ml-auto text-xs text-gold-300">View profile →</span>
        </Link>
      )}

      <div className="flex items-center gap-1 mt-4 pt-3 border-t border-ink-700/60">
        <button onClick={like} aria-label={likeState.liked ? 'Unlike' : 'Like'} aria-pressed={likeState.liked}
          className={`btn-ghost btn-sm !border-0 ${likeState.liked ? '!text-gold-300' : ''}`}>
          {likeState.liked ? '♥' : '♡'} {likeState.likes}
        </button>
        <button onClick={() => setShowComments(s => !s)} aria-label="Comments" className="btn-ghost btn-sm !border-0">💬 {comments.length}</button>
        <button onClick={share} aria-label="Copy link to this post" className="btn-ghost btn-sm !border-0">↗ Share</button>
        {!p.can_edit && (
          <button className="btn-ghost btn-sm !border-0 ml-auto !text-mist-500" onClick={() => setReporting({ type: 'post', id: p.id, label: 'post' })}>Report</button>
        )}
      </div>
      <ReportModal open={!!reporting} onClose={() => setReporting(null)}
        targetType={reporting?.type} targetId={reporting?.id} targetLabel={reporting?.label} />

      {showComments && (
        <div className="mt-3 space-y-3">
          {comments.map(c => (
            <div key={c.id} className="flex gap-2.5">
              <Avatar src={c.photo} name={c.name} size={7} />
              <div className="bg-ink-850 border border-ink-700/60 rounded-xl px-3.5 py-2 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-mist-100">{c.name} <span className="font-normal text-mist-500 capitalize">· {c.role}</span></div>
                  {c.can_edit && editComment !== c.id ? (
                    <div className="flex gap-1 shrink-0">
                      <button className="text-[11px] text-mist-500 hover:text-mist-200" onClick={() => { setEditComment(c.id); setEditCommentText(c.text || ''); }}>Edit</button>
                      <span className="text-[11px] text-mist-600">·</span>
                      <button className="text-[11px] text-mist-500 hover:text-red-400" onClick={() => deleteComment(c)}>Delete</button>
                    </div>
                  ) : !c.can_edit && (
                    <button className="text-[11px] text-mist-600 hover:text-mist-300 shrink-0" onClick={() => setReporting({ type: 'comment', id: c.id, label: 'comment' })}>Report</button>
                  )}
                </div>
                {c.can_edit && editComment === c.id ? (
                  <div className="flex gap-2 mt-1.5">
                    <input className="input !py-1.5 !text-sm" value={editCommentText} onChange={(e) => setEditCommentText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && editCommentText.trim()) saveComment(c); }} />
                    <button className="btn-primary btn-sm" disabled={!editCommentText.trim()} onClick={() => saveComment(c)}>Save</button>
                    <button className="btn-ghost btn-sm" onClick={() => setEditComment(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="text-sm text-mist-200 mt-0.5">{c.text}</div>
                )}
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <input className="input !py-2" placeholder="Add a comment…" value={comment} disabled={commentBusy}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') postComment(); }} />
            <button className="btn-primary btn-sm shrink-0" disabled={!comment.trim() || commentBusy} onClick={postComment}>
              {commentBusy ? '…' : 'Post'}
            </button>
          </div>
        </div>
      )}
    </motion.article>
  );
}
