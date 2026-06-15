import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, timeAgo } from '../api';
import { useAuth } from '../AuthContext';
import { Avatar, Empty, FileUpload, Modal, Spinner, VerifiedBadge, useToast } from '../components/ui';

const STAGES = ['Intro', 'Due Diligence', 'Closed', 'Passed'];
const STAGE_STYLE = { 'Intro': 'chip-blue', 'Due Diligence': 'chip-gold', 'Closed': 'chip-green', 'Passed': 'chip-red' };

export default function Messages() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const active = params.get('c');
  const [convos, setConvos] = useState(null);
  const [thread, setThread] = useState(null);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [attach, setAttach] = useState('');
  const [refOpen, setRefOpen] = useState(false);
  const [refList, setRefList] = useState([]);
  const endRef = useRef();
  const toast = useToast();

  const loadList = () => api.get('/api/messages').then(d => setConvos(d.conversations)).catch(() => setConvos([]));
  const loadThread = () => active && api.get(`/api/messages/${active}`).then(setThread).catch(e => toast(e.message, 'error'));

  useEffect(() => { loadList(); }, []);
  useEffect(() => { setThread(null); loadThread(); }, [active]);
  useEffect(() => {
    const t = setInterval(() => { loadThread(); loadList(); }, 8000);
    return () => clearInterval(t);
  }, [active]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread?.messages?.length]);

  const send = async (extra = {}) => {
    if (!text.trim() && !attach && !extra.ref_startup_id) return;
    try {
      await api.post(`/api/messages/${active}/send`, { text: text.trim(), attachment_key: attach?.key || '', attachment_name: attach?.name || '', ...extra });
      setText(''); setAttach(null);
      loadThread(); loadList();
    } catch (e) { toast(e.message, 'error'); }
  };

  const setStage = async (stage) => {
    try { await api.post(`/api/messages/${active}/deal-stage`, { stage }); loadThread(); loadList(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const openRef = async () => {
    const d = await api.get('/api/startups?sort=recent');
    setRefList(d.startups); setRefOpen(true);
  };

  if (!convos) return <Spinner />;
  const filtered = convos.filter(c => c.other.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fade-in">
      <h1 className="h-display text-2xl mb-1">Messages</h1>
      <p className="text-sm text-mist-400 mb-5">Conversations open once a connection is accepted.</p>

      <div className="card overflow-hidden grid md:grid-cols-[320px_1fr]" style={{ height: 'calc(100vh - 220px)', minHeight: 420 }}>
        {/* Left panel */}
        <div className={`border-r border-ink-700/60 flex flex-col ${active ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-ink-700/60">
            <input className="input !py-2" aria-label="Search" placeholder="Search conversations…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-mist-500">No conversations yet.<br />Connect with someone in the <Link to="/network" className="text-gold-300">Network</Link> to start one.</div>
            ) : filtered.map(c => (
              <button key={c.id} onClick={() => setParams({ c: c.id })}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-ink-700/40 transition-colors ${String(c.id) === active ? 'bg-ink-800' : 'hover:bg-ink-850'}`}>
                <Avatar src={c.other.photo} name={c.other.name} size={11} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-mist-100 truncate">{c.other.name}{!!c.other.verified && <VerifiedBadge small />}</span>
                    {c.last_message && <span className="text-[10px] text-mist-500 shrink-0">{timeAgo(c.last_message.created_at)}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-mist-400 truncate flex-1">{c.last_message?.text || 'New conversation'}</span>
                    {c.unread > 0 && <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-gold-400 text-ink-950 text-[10px] font-bold flex items-center justify-center">{c.unread}</span>}
                  </div>
                  {c.deal_stage && <span className={`${STAGE_STYLE[c.deal_stage]} mt-1.5`}>{c.deal_stage}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div className={`flex-col min-w-0 ${active ? 'flex' : 'hidden md:flex'}`}>
          {!active || !thread ? (
            active ? <Spinner className="my-auto" /> : (
              <div className="m-auto text-center p-8">
                <div className="text-3xl text-mist-600 mb-3">✉</div>
                <div className="h-display">Select a conversation</div>
                <div className="text-sm text-mist-400 mt-1">Track each deal by stage as it progresses.</div>
              </div>
            )
          ) : (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-ink-700/60">
                <button className="md:hidden btn-ghost btn-sm !px-2" onClick={() => setParams({})}>←</button>
                <Avatar src={thread.other.photo} name={thread.other.name} size={9} />
                <Link to={`/profile/${thread.other.id}`} className="flex items-center gap-1.5 font-semibold text-mist-100 text-sm hover:text-gold-300">
                  {thread.other.name}{!!thread.other.verified && <VerifiedBadge small />}
                </Link>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-mist-500 hidden sm:block">Deal stage</span>
                  <select className="input !w-auto !py-1.5 !text-xs" value={thread.conversation.deal_stage} onChange={(e) => setStage(e.target.value)}>
                    <option value="">—</option>
                    {STAGES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {thread.messages.map(m => {
                  const mine = m.sender_id === user.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${mine ? 'bg-gold-500/15 border border-gold-500/25 text-mist-100' : 'bg-ink-800 border border-ink-600/60 text-mist-200'}`}>
                        {m.ref_startup && (
                          <Link to={`/startup/${m.ref_startup.id}`} className="flex items-center gap-2.5 bg-ink-900/70 border border-ink-600/60 rounded-xl p-2.5 mb-2 hover:border-gold-500/40 transition-colors">
                            <Avatar src={m.ref_startup.logo} name={m.ref_startup.name} size={8} square />
                            <div><div className="text-xs font-semibold text-mist-100">{m.ref_startup.name}</div>
                              <div className="text-[10px] text-mist-400">{m.ref_startup.sector} · {m.ref_startup.stage}</div></div>
                          </Link>
                        )}
                        {m.text}
                        {m.attachment_download
                          ? <a href={m.attachment_download} target="_blank" rel="noopener noreferrer" className="block mt-1.5 text-xs text-accent-400 underline">📎 Attachment</a>
                          : m.attachment && <a href={m.attachment} target="_blank" rel="noopener noreferrer" className="block mt-1.5 text-xs text-accent-400 underline">📎 Attachment</a>}
                        <div className={`text-[10px] mt-1 ${mine ? 'text-gold-300/50' : 'text-mist-500'}`}>{timeAgo(m.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <div className="border-t border-ink-700/60 p-3">
                {attach && <div className="text-xs text-emerald-300 mb-2">📎 {attach.name || 'File'} attached — sends with your message <button className="text-mist-500 ml-1" onClick={() => setAttach(null)}>✕</button></div>}
                <div className="flex gap-2 items-end">
                  <label className="btn-ghost btn-sm !px-2.5 cursor-pointer" title="Attach file">
                    <input type="file" className="hidden" onChange={async (e) => {
                      const f = e.target.files[0];
                      if (!f) return;
                      try { const d = await api.uploadPrivate(f); setAttach({ key: d.key, name: d.name }); } catch (er) { toast(er.message, 'error'); }
                    }} />📎
                  </label>
                  <button className="btn-ghost btn-sm !px-2.5" title="Reference a startup" onClick={openRef}>◳</button>
                  <textarea className="input flex-1 !py-2.5 resize-none" rows={1} placeholder="Write a message…" value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
                  <button className="btn-primary btn-sm !py-2.5" onClick={() => send()}>Send</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal open={refOpen} onClose={() => setRefOpen(false)} title="Reference a startup">
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {refList.map(s => (
            <button key={s.id} className="w-full flex items-center gap-3 card !rounded-xl p-3 hover:border-gold-500/40 transition-colors text-left"
              onClick={() => { setRefOpen(false); send({ ref_startup_id: s.id }); }}>
              <Avatar src={s.logo} name={s.name} size={9} square />
              <div><div className="text-sm font-semibold text-mist-100">{s.name}</div><div className="text-xs text-mist-400">{s.sector} · {s.stage}</div></div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
