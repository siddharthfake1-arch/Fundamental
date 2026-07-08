import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, StickyNote, Tag } from 'lucide-react';
import { api, timeAgo, asArray } from '../api';
import { useAuth } from '../AuthContext';
import { Avatar, Empty, Modal, Spinner, VerifiedBadge, useToast } from '../components/ui';

const STAGES = ['Tracking', 'Intro Call Done', 'Due Diligence', 'Term Sheet', 'Passed'];
const STAGE_TINT = {
  'Tracking': 'border-t-mist-500', 'Intro Call Done': 'border-t-accent-400',
  'Due Diligence': 'border-t-gold-400', 'Term Sheet': 'border-t-emerald-400', 'Passed': 'border-t-red-400',
};

// Investor Pipeline — a lightweight deal CRM over the watchlist.
export default function Watchlist() {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [shared, setShared] = useState([]);
  const [q, setQ] = useState('');
  const [notesFor, setNotesFor] = useState(null);
  const [tagsFor, setTagsFor] = useState(null);
  const toast = useToast();
  const isInvestor = user.role === 'investor';

  const load = () => api.get('/api/watchlist').then(d => setList(asArray(d.watchlist))).catch(e => toast(e.message, 'error'));
  const loadShared = () => api.get('/api/startups/shared-with-me').then(d => setShared(asArray(d.shared))).catch(() => {});
  useEffect(() => { if (isInvestor) { load(); loadShared(); } }, [isInvestor]);

  const moveBusy = useRef(false);

  if (!isInvestor) return <Navigate to="/dashboard" replace />;
  if (!list) return <Spinner />;

  const move = async (s, dir) => {
    const idx = STAGES.indexOf(s.status);
    const next = STAGES[idx + dir];
    if (!next || moveBusy.current) return; // rapid taps must not skip stages
    moveBusy.current = true;
    try { await api.post(`/api/startups/${s.id}/watchlist-status`, { status: next }); await load(); }
    catch (e) { toast(e.message, 'error'); } finally { moveBusy.current = false; }
  };

  return (
    <div className="fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="page-title">Pipeline</h1>
          <p className="text-sm text-mist-400 mt-1 page-sub">Your deal flow from first look to decision — private to you.</p>
        </div>
        <div className="flex items-center gap-2">
          <input className="input !w-56 !py-2" aria-label="Search" placeholder="Search pipeline…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Link to="/discover" className="btn-ghost btn-sm whitespace-nowrap">+ Add deal</Link>
        </div>
      </div>

      {shared.length > 0 && (
        <div className="card p-4 mb-6">
          <div className="section-title mb-3">Shared by co-investors</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {shared.map(sd => (
              <Link key={sd.id} to={`/startup/${sd.startup_id}`} className="bg-ink-850 border border-ink-700/50 rounded-xl p-3 hover:border-gold-500/40 transition-colors">
                <div className="flex items-center gap-2.5">
                  <Avatar src={sd.logo} name={sd.name} size={9} square />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 text-sm font-semibold text-mist-100 truncate">{sd.name}{!!sd.verified && <VerifiedBadge small />}</div>
                    <div className="text-[11px] text-mist-500 truncate">{sd.sector} · {sd.stage}</div>
                  </div>
                </div>
                {sd.note && <p className="text-[12px] text-mist-300 mt-2 line-clamp-2">"{sd.note}"</p>}
                <div className="flex items-center gap-2 mt-2 text-[11px] text-mist-500">
                  <Avatar src={sd.from_photo} name={sd.from_name} size={5} /> {sd.from_name} · {timeAgo(sd.created_at)}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <Empty title="Your pipeline is empty" sub="Save startups from Discover, then move them from tracking to decision with private notes at every step." />
      ) : (
        <div className="grid grid-flow-col auto-cols-[270px] lg:auto-cols-fr gap-4 overflow-x-auto pb-4">
          {STAGES.map(stage => {
            const items = list.filter(s => s.status === stage)
              .filter(s => !q || String(s.name + ' ' + s.sector + ' ' + asArray(s.tags).join(' ')).toLowerCase().includes(q.toLowerCase()));
            return (
              <div key={stage} className={`card !rounded-xl border-t-2 ${STAGE_TINT[stage]} p-3 min-h-[200px]`}>
                <div className="flex items-center justify-between px-1 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-mist-400">{stage}</span>
                  <span className="text-xs font-bold text-mist-500 tabular-nums">{items.length}</span>
                </div>
                <div className="space-y-2.5">
                  {items.map(s => (
                    <motion.div key={s.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                      className="bg-ink-850 border border-ink-700/50 rounded-xl p-3 group">
                      <Link to={`/startup/${s.id}`} className="flex items-center gap-2.5">
                        <Avatar src={s.logo} name={s.name} size={9} square />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 text-sm font-semibold text-mist-100 truncate group-hover:text-gold-300 transition-colors">
                            {s.name}{!!s.verified && <VerifiedBadge small />}
                          </div>
                          <div className="text-[11px] text-mist-500 truncate">{s.sector} · {s.stage}</div>
                        </div>
                      </Link>
                      {asArray(s.recent_activity)[0] && (
                        <div className="text-[11px] text-mist-500 mt-2 line-clamp-1" title={asArray(s.recent_activity)[0].text}>
                          ⚡ {asArray(s.recent_activity)[0].text}
                        </div>
                      )}
                      {asArray(s.tags).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {asArray(s.tags).map(t => <span key={t} className="chip-gold !py-0 !px-2 !text-[10px]">{t}</span>)}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-ink-700/40">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setNotesFor(s)}
                            className="flex items-center gap-1 text-[11px] text-mist-500 hover:text-gold-300 transition-colors">
                            <StickyNote className="w-3 h-3" /> {asArray(s.notes).length} note{asArray(s.notes).length !== 1 ? 's' : ''}
                          </button>
                          <button onClick={() => setTagsFor(s)}
                            className="flex items-center gap-1 text-[11px] text-mist-500 hover:text-gold-300 transition-colors">
                            <Tag className="w-3 h-3" /> {s.tags?.length || 0}
                          </button>
                        </div>
                        <div className="flex gap-0.5">
                          <button onClick={() => move(s, -1)} disabled={STAGES.indexOf(s.status) === 0}
                            className="p-2.5 rounded-lg text-mist-500 hover:text-mist-100 hover:bg-ink-700 disabled:opacity-25 transition-colors" title="Move back">
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => move(s, 1)} disabled={STAGES.indexOf(s.status) === STAGES.length - 1}
                            className="p-2.5 rounded-lg text-mist-500 hover:text-mist-100 hover:bg-ink-700 disabled:opacity-25 transition-colors" title="Advance">
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NotesModal s={notesFor} onClose={() => setNotesFor(null)} onChange={load} />
      <TagsModal s={tagsFor} onClose={() => setTagsFor(null)} onChange={load} />
    </div>
  );
}

function TagsModal({ s, onClose, onChange }) {
  const [tags, setTags] = useState([]);
  const [input, setInput] = useState('');
  const toast = useToast();
  useEffect(() => { if (s) setTags(s.tags || []); }, [s]);
  if (!s) return null;
  const add = (t) => {
    const v = t.trim().slice(0, 24);
    if (v && !tags.includes(v) && tags.length < 8) setTags([...tags, v]);
    setInput('');
  };
  const save = async () => {
    try { await api.post(`/api/startups/${s.id}/watchlist-tags`, { tags }); onChange(); onClose(); toast('Tags saved', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal open={!!s} onClose={onClose} title={`Deal tags — ${s.name}`}>
      <div className="space-y-3">
        <div className="text-xs text-mist-500">Up to 8 tags to organize your deal flow — for example "hot", "follow-up", or "needs intro". Private to you.</div>
        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
          {tags.map(t => (
            <span key={t} className="chip-gold !py-1 !px-2.5 !text-xs">
              {t}<button className="ml-1.5 text-gold-400 hover:text-red-400" aria-label={`Remove tag ${t}`} onClick={() => setTags(tags.filter(x => x !== t))}>✕</button>
            </span>
          ))}
          {tags.length === 0 && <span className="text-xs text-mist-500">No tags yet.</span>}
        </div>
        <input className="input !py-2" placeholder="Type a tag, then press Enter" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(input); } }} />
        <button className="btn-primary w-full" onClick={save}>Save tags</button>
      </div>
    </Modal>
  );
}

function NotesModal({ s, onClose, onChange }) {
  const [note, setNote] = useState('');
  const toast = useToast();
  if (!s) return null;
  return (
    <Modal open={!!s} onClose={onClose} title={`Private notes — ${s.name}`}>
      <div className="space-y-3">
        <div className="text-xs text-mist-500">Saved {timeAgo(s.saved_at)} · private to you</div>
        {asArray(s.notes).map(n => (
          <div key={n.id} className="flex gap-3 bg-gold-500/5 border border-gold-500/20 rounded-xl px-3.5 py-2.5">
            <div className="flex-1">
              <p className="text-sm text-mist-200">{n.text}</p>
              <div className="text-[10px] text-mist-500 mt-0.5">{timeAgo(n.created_at)}</div>
            </div>
            <button className="text-mist-500 hover:text-red-400 text-xs" onClick={async () => {
              await api.del(`/api/startups/notes/${n.id}`); onChange(); onClose();
            }}>✕</button>
          </div>
        ))}
        <div className="flex gap-2">
          <input className="input !py-2" placeholder="Add a note — press Enter to save" value={note} autoFocus
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && note.trim()) {
                try { await api.post(`/api/startups/${s.id}/notes`, { text: note }); setNote(''); onChange(); onClose(); toast('Note saved', 'success'); }
                catch (er) { toast(er.message, 'error'); }
              }
            }} />
        </div>
      </div>
    </Modal>
  );
}
