import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, getAuthToken, timeAgo, asArray, asObject } from '../api';
import { useAuth } from '../AuthContext';
import { Avatar, Empty, FileUpload, Lightbox, Modal, ReportModal, Spinner, VerifiedBadge, useToast, SkeletonList } from '../components/ui';
import { absUrl, apiUrl, IS_NATIVE, nativeBridge } from '../config';
import PullToRefresh from '../components/PullToRefresh';

const STAGES = ['Intro', 'Due Diligence', 'Closed', 'Passed'];
const STAGE_STYLE = { 'Intro': 'chip-blue', 'Due Diligence': 'chip-gold', 'Closed': 'chip-green', 'Passed': 'chip-red' };

// ---- Chat time helpers ----
const parseTs = (iso) => new Date(String(iso || '').replace(' ', 'T') + (String(iso || '').includes('Z') ? '' : 'Z'));
const dayKey = (iso) => { const d = parseTs(iso); return Number.isNaN(+d) ? '' : d.toDateString(); };
const dayLabel = (iso) => {
  const d = parseTs(iso);
  if (Number.isNaN(+d)) return '';
  const today = new Date(); const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
};
const clockTime = (iso) => { const d = parseTs(iso); return Number.isNaN(+d) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
const minutesApart = (a, b) => Math.abs(parseTs(a) - parseTs(b)) / 60000;

// Conversation-list preview line: media messages read as what they are.
const lastPreview = (lm) => {
  if (!lm) return 'New conversation';
  if (lm.text) return lm.text;
  const n = String(lm.attachment_name || lm.attachment || '');
  if (/\.(png|jpe?g|gif|webp)$/i.test(n)) return '📷 Photo';
  if (/\.(mp4|m4v|webm|mov)$/i.test(n)) return '🎬 Video';
  if (n) return `📎 ${n}`;
  return 'New conversation';
};

// Non-media attachment: the classic download link.
function AttachmentLink({ m }) {
  return m.attachment_download
    ? <a href={m.attachment_download} target="_blank" rel="noopener noreferrer" className="block mt-1.5 text-xs text-accent-400 underline"
        onClick={(e) => { if (nativeBridge.downloadFile) { e.preventDefault(); nativeBridge.downloadFile(m.attachment_download, m.attachment_name || 'attachment'); } }}>
        📎 {m.attachment_name || 'Attachment'}</a>
    : m.attachment && <a href={absUrl(m.attachment)} target="_blank" rel="noopener noreferrer" className="block mt-1.5 text-xs text-accent-400 underline">📎 Attachment</a>;
}

// Photo/video attachments render inside the bubble, WhatsApp-style. On the web
// the session cookie rides along with a plain src; on native the bearer token
// can't attach to an <img>/<video> request, so we fetch the bytes ourselves and
// hand the element a blob URL. Any failure falls back to the download link.
function ChatMedia({ m, onOpenImage, onMediaLoad }) {
  const inlineUrl = apiUrl(`${m.attachment_download}?inline=1`);
  const [src, setSrc] = useState(IS_NATIVE ? null : inlineUrl);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!IS_NATIVE) return;
    let url = null, alive = true;
    const t = getAuthToken();
    fetch(inlineUrl, { headers: t ? { Authorization: 'Bearer ' + t } : {} })
      .then(r => { if (!r.ok) throw new Error('media'); return r.blob(); })
      .then(b => { if (alive) { url = URL.createObjectURL(b); setSrc(url); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [m.id]);

  if (failed) return <AttachmentLink m={m} />;
  if (m.attachment_media === 'video') {
    return (
      <div className="mt-1.5 rounded-xl overflow-hidden bg-black/60 border border-ink-600/40">
        {src
          ? <video src={src} controls playsInline preload="metadata" aria-label={m.attachment_name || 'Video attachment'}
              className="block w-full max-h-72" onError={() => setFailed(true)} onLoadedMetadata={onMediaLoad} />
          : <div className="skeleton w-56 h-36" />}
      </div>
    );
  }
  return (
    <button type="button" className="block mt-1.5 rounded-xl overflow-hidden border border-ink-600/40 max-w-full"
      onClick={() => src && onOpenImage(src)} aria-label={`View image ${m.attachment_name || ''}`.trim()}>
      {!loaded && <div className="skeleton w-56 h-40" />}
      <img src={src || undefined} alt={m.attachment_name || 'Photo attachment'} loading="lazy" draggable={false}
        className={`block max-h-72 max-w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0 h-0'}`}
        onLoad={() => { setLoaded(true); onMediaLoad?.(); }} onError={() => setFailed(true)} />
    </button>
  );
}

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
  const [lightbox, setLightbox] = useState(null); // { src, download, name }
  const endRef = useRef();
  const scrollBoxRef = useRef();
  const composerRef = useRef();
  const toast = useToast();

  // Inline media finishes decoding after the thread paints and grows the scroll
  // height — re-anchor to the bottom if the user was already reading there.
  const anchorIfNearBottom = () => {
    const box = scrollBoxRef.current;
    if (!box) return;
    if (box.scrollHeight - box.scrollTop - box.clientHeight < 240) endRef.current?.scrollIntoView({ behavior: 'auto' });
  };

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
      if (attach?.preview) URL.revokeObjectURL(attach.preview);
      setText(''); setAttach(null);
      if (composerRef.current) composerRef.current.style.height = 'auto'; // shrink back after send
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
                    <span className="text-xs text-mist-400 truncate flex-1">{lastPreview(c.last_message)}</span>
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
                <button className="md:hidden btn-ghost btn-sm !px-2.5 !py-2" aria-label="Back to conversations" onClick={() => setParams({})}>←</button>
                <Avatar src={tOther.photo} name={tOther.name} size={9} />
                <Link to={`/profile/${tOther.id}`} className="flex items-center gap-1.5 font-semibold text-mist-100 text-sm hover:text-gold-300">
                  {tOther.name}{!!tOther.verified && <VerifiedBadge small />}
                </Link>
                <div className="ml-auto flex items-center gap-1.5">
                  <button className="btn-ghost btn-sm !text-mist-500 hidden sm:block" onClick={() => setReporting(true)}>Report</button>
                  <span className="text-[10px] uppercase tracking-wider text-mist-500 hidden sm:block">Deal stage</span>
                  <select className="input !w-auto !py-1.5 !text-xs" aria-label="Deal stage" value={tConversation.deal_stage || ''} onChange={(e) => setStage(e.target.value)}>
                    <option value="">—</option>
                    {STAGES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div ref={scrollBoxRef} className="flex-1 overflow-y-auto p-4" style={{ overscrollBehavior: 'contain' }}>
                {tMessages.map((m, i) => {
                  const mine = m.sender_id === user.id;
                  const prev = tMessages[i - 1];
                  const next = tMessages[i + 1];
                  const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
                  // WhatsApp-style runs: messages from the same sender within five
                  // minutes sit tight together and share one timestamp at the end.
                  const grouped = !newDay && prev && prev.sender_id === m.sender_id && minutesApart(prev.created_at, m.created_at) < 5;
                  const endsGroup = !next || next.sender_id !== m.sender_id
                    || minutesApart(m.created_at, next.created_at) >= 5
                    || dayKey(next.created_at) !== dayKey(m.created_at);
                  const hasMedia = m.attachment_download && (m.attachment_media === 'image' || m.attachment_media === 'video');
                  return (
                    <div key={m.id}>
                      {newDay && (
                        <div className="flex items-center gap-3 my-4 first:mt-0" role="separator" aria-label={dayLabel(m.created_at)}>
                          <div className="divider flex-1" />
                          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">{dayLabel(m.created_at)}</span>
                          <div className="divider flex-1" />
                        </div>
                      )}
                      <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-[3px]' : 'mt-3 first:mt-0'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words min-w-0
                          ${endsGroup ? (mine ? 'rounded-br-md' : 'rounded-bl-md') : ''}
                          ${mine ? 'bg-gold-500/15 border border-gold-500/25 text-mist-100' : 'bg-ink-800 border border-ink-600/60 text-mist-200'}`}>
                          {m.ref_startup && (
                            <Link to={`/startup/${m.ref_startup.id}`} className="flex items-center gap-2.5 bg-ink-900/70 border border-ink-600/60 rounded-xl p-2.5 mb-2 hover:border-gold-500/40 transition-colors">
                              <Avatar src={m.ref_startup.logo} name={m.ref_startup.name} size={8} square />
                              <div><div className="text-xs font-semibold text-mist-100">{m.ref_startup.name}</div>
                                <div className="text-[10px] text-mist-400">{m.ref_startup.sector} · {m.ref_startup.stage}</div></div>
                            </Link>
                          )}
                          {m.text}
                          {hasMedia
                            ? <ChatMedia m={m} onMediaLoad={anchorIfNearBottom}
                                onOpenImage={(src) => setLightbox({ src, download: m.attachment_download, name: m.attachment_name })} />
                            : <AttachmentLink m={m} />}
                          {endsGroup && (
                            <div className={`text-[10px] mt-1 tabular-nums ${mine ? 'text-gold-300/50' : 'text-mist-500'}`}
                              title={timeAgo(m.created_at)}>{clockTime(m.created_at)}</div>
                          )}
                        </div>
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
                {attach && (
                  <div className="flex items-center gap-3 mb-2 bg-ink-850 border border-ink-700/60 rounded-xl p-2 pr-3">
                    {/* An image attachment previews as a thumbnail before it sends — you see what you're about to share. */}
                    {attach.preview
                      ? <img src={attach.preview} alt="Attachment preview" className="w-12 h-12 rounded-lg object-cover border border-ink-600/60" />
                      : <span className="w-12 h-12 rounded-lg bg-ink-800 border border-ink-600/60 flex items-center justify-center text-lg" aria-hidden>📎</span>}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-mist-100 truncate">{attach.name || 'File'}</div>
                      <div className="text-[11px] text-emerald-400">Ready — sends with your message</div>
                    </div>
                    <button className="text-mist-500 hover:text-red-400 p-2 -m-1" aria-label="Remove attachment"
                      onClick={() => { if (attach.preview) URL.revokeObjectURL(attach.preview); setAttach(null); }}>✕</button>
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <label className="btn-ghost btn-sm !px-3 !py-2.5 cursor-pointer" title="Attach a file or photo" aria-label="Attach a file or photo (max 25 MB)">
                    <input type="file" className="hidden" accept=".pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,.csv,.txt,.zip,image/*,video/*" onChange={async (e) => {
                      const f = e.target.files[0];
                      e.target.value = ''; // allow re-selecting the same file
                      if (!f) return;
                      if (f.size > 25 * 1024 * 1024) return toast(`That file is ${Math.ceil(f.size / 1048576)} MB. Attachments are limited to 25 MB.`, 'error');
                      const preview = /^image\//.test(f.type) ? URL.createObjectURL(f) : '';
                      try { setUploadPct(0); const d = await api.uploadPrivate(f, setUploadPct); setAttach({ key: d.key, name: d.name, preview }); }
                      catch (er) { if (preview) URL.revokeObjectURL(preview); toast(er.message, 'error'); } finally { setUploadPct(null); }
                    }} />📎
                  </label>
                  <button className="btn-ghost btn-sm !px-3 !py-2.5" title="Reference a startup" aria-label="Reference a startup" onClick={openRef}>◳</button>
                  <textarea ref={composerRef} className="input flex-1 !py-2.5 resize-none max-h-32" rows={1} aria-label="Message" placeholder="Write a message…" enterKeyHint="send" value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      // Grow with the draft (up to ~5 lines) so long messages stay readable.
                      const el = e.target; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 128) + 'px';
                    }}
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

      <Lightbox src={lightbox?.src} alt={lightbox?.name || 'Photo'} onClose={() => setLightbox(null)}
        onDownload={lightbox ? () => {
          if (nativeBridge.downloadFile) return nativeBridge.downloadFile(lightbox.download, lightbox.name || 'photo');
          const a = document.createElement('a');
          a.href = apiUrl(lightbox.download); a.download = lightbox.name || 'photo';
          document.body.appendChild(a); a.click(); a.remove();
        } : undefined} />

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
