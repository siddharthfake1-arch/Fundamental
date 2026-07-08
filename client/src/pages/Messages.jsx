import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, timeAgo, asArray, asObject } from '../api';
import { useAuth } from '../AuthContext';
import { Avatar, Empty, FileUpload, Modal, ReportModal, Spinner, VerifiedBadge, useToast, SkeletonList } from '../components/ui';
import { absUrl, nativeBridge } from '../config';
import PullToRefresh from '../components/PullToRefresh';

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
  const [sending, setSending] = useState(false);
  const [uploadPct, setUploadPct] = useState(null);
  const [reporting, setReporting] = useState(false);
  const endRef = useRef();
  const scrollBoxRef = useRef();
  const toast = useToast();

  const [listErr, setListErr] = useState(null);
  // A failed load must NOT paint the "no conversations" empty state (offline would
  // look like you have no messages) — surface the error; the 8s poll auto-retries.
  const loadList = () => api.get('/api/messages').then(d => { setListErr(null); setConvos(asArray(d.conversations)); }).catch(e => setListErr(e.message));
  // Guard against a stale response painting the wrong thread: capture the id at
  // call time and drop the result if the user has switched conversations since.
  const loadThread = () => {
    const id = active;
    return id && api.get(`/api/messages/${id}`).then(t => { if (id === activeRef.current) setThread(t); }).catch(e => toast(e.message, 'error'));
  };
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => { loadList(); }, []);
  useEffect(() => { setThread(null); loadThread(); window.dispatchEvent(new Event('badge-refresh')); }, [active]);
  useEffect(() => {
    const tick = () => { if (!document.hidden) { loadThread(); loadList(); } };
    const t = setInterval(tick, 8000);
    window.addEventListener('app-resumed', tick); // native: instant refresh on foreground
    return () => { clearInterval(t); window.removeEventListener('app-resumed', tick); };
  }, [active]);
  // Follow new messages only when the user is already near the bottom — the 8s
  // poll must not yank someone who scrolled up to read history. The FIRST paint
  // of a thread jumps instantly (no animated scroll through the whole history).
  const firstPaint = useRef(true);
  useEffect(() => { firstPaint.current = true; }, [active]);
  useEffect(() => {
    const box = scrollBoxRef.current;
    if (!box) return;
    if (firstPaint.current && thread?.messages?.length) {
      endRef.current?.scrollIntoView({ behavior: 'auto' });
      firstPaint.current = false;
      return;
    }
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
    if (nearBottom) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.messages?.length]);

  const send = async (extra = {}) => {
    if (sending) return; // no duplicate sends on fast Enter / double-click
    if (!text.trim() && !attach && !extra.ref_startup_id) return;
    setSending(true);
    try {
      await api.post(`/api/messages/${active}/send`, { text: text.trim(), attachment_key: attach?.key || '', attachment_name: attach?.name || '', ...extra });
      setText(''); setAttach(null);
      loadThread(); loadList();
    } catch (e) { toast(e.message, 'error'); } finally { setSending(false); }
  };

  const setStage = async (stage) => {
    try { await api.post(`/api/messages/${active}/deal-stage`, { stage }); loadThread(); loadList(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const openRef = async () => {
    const d = await api.get('/api/startups?sort=recent');
    setRefList(asArray(d.startups)); setRefOpen(true);
  };

  if (!convos) {
    return listErr
      ? <Empty title="Couldn't load your messages" sub={`${listErr} — retrying automatically.`} />
      : <div className="max-w-lg"><SkeletonList n={5} /></div>;
  }
  const filtered = convos.filter(c => String(c.other?.name || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <PullToRefresh onRefresh={() => Promise.all([loadList(), active && loadThread()].filter(Boolean))}>
    <div className="fade-in">
      {/* On phones an open thread takes the whole screen (real chat app) — the
          page title only shows on the conversation list / desktop split view. */}
      <div className={active ? 'hidden md:block' : ''}>
        <h1 className="page-title mb-1">Messages</h1>
        <p className="text-sm text-mist-400 mb-5 page-sub">Conversations open once a connection is accepted.</p>
      </div>

      <div className={`card overflow-hidden grid md:grid-cols-[320px_1fr] chat-card ${active ? 'chat-card-active' : ''}`}>
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
                <Avatar src={c.other?.photo} name={c.other?.name} size={11} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-mist-100 truncate">{c.other?.name}{!!c.other?.verified && <VerifiedBadge small />}</span>
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
          ) : (() => {
            const tOther = asObject(thread.other);
            const tConversation = asObject(thread.conversation);
            const tMessages = asArray(thread.messages);
            return (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-ink-700/60">
                <button className="md:hidden btn-ghost btn-sm !px-2" onClick={() => setParams({})}>←</button>
                <Avatar src={tOther.photo} name={tOther.name} size={9} />
                <Link to={`/profile/${tOther.id}`} className="flex items-center gap-1.5 font-semibold text-mist-100 text-sm hover:text-gold-300">
                  {tOther.name}{!!tOther.verified && <VerifiedBadge small />}
                </Link>
                <div className="ml-auto flex items-center gap-1.5">
                  <button className="btn-ghost btn-sm !text-mist-500 hidden sm:block" onClick={() => setReporting(true)}>Report</button>
                  <span className="text-[10px] uppercase tracking-wider text-mist-500 hidden sm:block">Deal stage</span>
                  <select className="input !w-auto !py-1.5 !text-xs" value={tConversation.deal_stage || ''} onChange={(e) => setStage(e.target.value)}>
                    <option value="">—</option>
                    {STAGES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div ref={scrollBoxRef} className="flex-1 overflow-y-auto p-4 space-y-3" style={{ overscrollBehavior: 'contain' }}>
                {tMessages.map(m => {
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
                          ? <a href={m.attachment_download} target="_blank" rel="noopener noreferrer" className="block mt-1.5 text-xs text-accent-400 underline"
                              onClick={(e) => { if (nativeBridge.downloadFile) { e.preventDefault(); nativeBridge.downloadFile(m.attachment_download, m.attachment_name || 'attachment'); } }}>📎 Attachment</a>
                          : m.attachment && <a href={absUrl(m.attachment)} target="_blank" rel="noopener noreferrer" className="block mt-1.5 text-xs text-accent-400 underline">📎 Attachment</a>}
                        <div className={`text-[10px] mt-1 ${mine ? 'text-gold-300/50' : 'text-mist-500'}`}>{timeAgo(m.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <div className="border-t border-ink-700/60 p-3">
                {uploadPct !== null && (
                  <div className="mb-2">
                    <div className="text-xs text-mist-400 mb-1">Uploading… {uploadPct}%</div>
                    <div className="h-1 bg-ink-700 rounded-full overflow-hidden"><div className="h-full bg-gold-400 transition-all" style={{ width: uploadPct + '%' }} /></div>
                  </div>
                )}
                {attach && <div className="text-xs text-emerald-300 mb-2">📎 {attach.name || 'File'} attached — sends with your message <button className="text-mist-500 ml-1" aria-label="Remove attachment" onClick={() => setAttach(null)}>✕</button></div>}
                <div className="flex gap-2 items-end">
                  <label className="btn-ghost btn-sm !px-3 !py-2.5 cursor-pointer" title="Attach file" aria-label="Attach a document (max 25 MB)">
                    <input type="file" className="hidden" accept=".pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,.csv,.txt,.zip,image/*" onChange={async (e) => {
                      const f = e.target.files[0];
                      e.target.value = ''; // allow re-selecting the same file
                      if (!f) return;
                      if (f.size > 25 * 1024 * 1024) return toast(`That file is ${Math.ceil(f.size / 1048576)} MB. Attachments are limited to 25 MB.`, 'error');
                      try { setUploadPct(0); const d = await api.uploadPrivate(f, setUploadPct); setAttach({ key: d.key, name: d.name }); }
                      catch (er) { toast(er.message, 'error'); } finally { setUploadPct(null); }
                    }} />📎
                  </label>
                  <button className="btn-ghost btn-sm !px-3 !py-2.5" title="Reference a startup" aria-label="Reference a startup" onClick={openRef}>◳</button>
                  <textarea className="input flex-1 !py-2.5 resize-none" rows={1} placeholder="Write a message…" enterKeyHint="send" value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
                  <button className="btn-primary btn-sm !py-2.5" disabled={sending || uploadPct !== null} onClick={() => send()}>{sending ? '…' : 'Send'}</button>
                </div>
              </div>
            </>
            );
          })()}
        </div>
      </div>

      {thread && <ReportModal open={reporting} onClose={() => setReporting(false)} targetType="user" targetId={asObject(thread.other).id} targetLabel="conversation" />}

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
    </PullToRefresh>
  );
}
