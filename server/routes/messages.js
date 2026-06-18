const express = require('express');
const path = require('path');
const { db, notify, areConnected, canViewStartup, isVisibleUser } = require('../db');
const { auth } = require('../authmw');
const { validateUrlFields, clampStrings } = require('../security');
const { streamPrivate, privateExists } = require('../storage');

const router = express.Router();
router.use(auth);

const DEAL_STAGES = ['Intro', 'Due Diligence', 'Closed', 'Passed'];
// Anti-spam: until the recipient has replied at least once, the initiator can send
// at most this many messages into a one-sided conversation. Once the other person
// replies, the cap is lifted for that conversation. Env-tunable for tests.
const ONE_SIDED_CAP = Number(process.env.MSG_ONE_SIDED_CAP) || 100;

function getOrCreateConversation(u1, u2) {
  const [a, b] = u1 < u2 ? [u1, u2] : [u2, u1];
  let c = db.prepare('SELECT * FROM conversations WHERE a_id=? AND b_id=?').get(a, b);
  if (!c) {
    const info = db.prepare('INSERT INTO conversations (a_id, b_id) VALUES (?,?)').run(a, b);
    c = db.prepare('SELECT * FROM conversations WHERE id=?').get(info.lastInsertRowid);
  }
  return c;
}

router.get('/', (req, res) => {
  const convos = db.prepare('SELECT * FROM conversations WHERE a_id=? OR b_id=? ORDER BY updated_at DESC')
    .all(req.user.id, req.user.id);
  const list = convos.map(c => {
    const otherId = c.a_id === req.user.id ? c.b_id : c.a_id;
    const other = db.prepare('SELECT id, name, role, photo, headline, verified FROM users WHERE id=?').get(otherId);
    const last = db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 1').get(c.id);
    const unread = db.prepare('SELECT COUNT(*) c FROM messages WHERE conversation_id=? AND sender_id!=? AND read=0').get(c.id, req.user.id).c;
    return { id: c.id, deal_stage: c.deal_stage, other, last_message: last, unread };
  });
  res.json({ conversations: list });
});

// Messaging unlocks only when connection is Accepted.
router.post('/start/:userId', (req, res) => {
  const otherId = Number(req.params.userId);
  const other = db.prepare('SELECT * FROM users WHERE id=?').get(otherId);
  if (!isVisibleUser(other, req.user)) return res.status(404).json({ error: 'We could not find that person.' });
  if (!areConnected(req.user.id, otherId)) {
    return res.status(403).json({ error: 'Messaging unlocks once your connection is accepted. Send a connection request to get started.' });
  }
  const c = getOrCreateConversation(req.user.id, otherId);
  res.json({ conversation_id: c.id });
});

router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM conversations WHERE id=? AND (a_id=? OR b_id=?)')
    .get(req.params.id, req.user.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'We could not find that conversation. It may have been removed.' });
  db.prepare('UPDATE messages SET read=1 WHERE conversation_id=? AND sender_id!=?').run(c.id, req.user.id);
  const otherId = c.a_id === req.user.id ? c.b_id : c.a_id;
  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY id ASC').all(c.id).map(m => {
    // Only surface a referenced startup if it's visible to this viewer (P2-7).
    let ref = null;
    if (m.ref_startup_id) {
      const rs = db.prepare('SELECT * FROM startups WHERE id=?').get(m.ref_startup_id);
      if (rs && canViewStartup(rs, req.user)) ref = { id: rs.id, name: rs.name, logo: rs.logo, sector: rs.sector, stage: rs.stage };
    }
    const out = { ...m, ref_startup: ref };
    // Private attachments are streamed through an access-checked endpoint, never linked directly.
    out.attachment_download = m.attachment_key ? `/api/messages/attachment/${m.id}` : '';
    out.has_attachment = !!(m.attachment_key || m.attachment);
    delete out.attachment_key;
    return out;
  });
  res.json({
    conversation: { id: c.id, deal_stage: c.deal_stage },
    other: db.prepare('SELECT id, name, role, photo, headline, verified FROM users WHERE id=?').get(otherId),
    messages,
  });
});

// Stream a private message attachment to a conversation participant only (P1-8).
router.get('/attachment/:mid', (req, res) => {
  const m = db.prepare(`SELECT m.*, c.a_id, c.b_id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=?`).get(req.params.mid);
  if (!m || (m.a_id !== req.user.id && m.b_id !== req.user.id)) return res.status(404).json({ error: 'Attachment not found.' });
  if (!m.attachment_key) return res.status(404).json({ error: 'No attachment on this message.' });
  if (!streamPrivate(res, m.attachment_key, m.attachment_name || 'attachment')) return res.status(404).json({ error: 'Attachment is no longer available.' });
});

router.post('/:id/send', (req, res) => {
  const c = db.prepare('SELECT * FROM conversations WHERE id=? AND (a_id=? OR b_id=?)')
    .get(req.params.id, req.user.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'We could not find that conversation. It may have been removed.' });
  const otherId = c.a_id === req.user.id ? c.b_id : c.a_id;
  if (!areConnected(req.user.id, otherId)) {
    return res.status(403).json({ error: 'You can message this person once your connection is accepted.' });
  }
  // One-sided spam guard: cap messages into a conversation the recipient has never
  // replied to. The cap lifts the moment they reply (so real back-and-forth is free).
  const otherReplied = db.prepare('SELECT 1 FROM messages WHERE conversation_id=? AND sender_id=?').get(c.id, otherId);
  if (!otherReplied) {
    const mine = db.prepare('SELECT COUNT(*) c FROM messages WHERE conversation_id=? AND sender_id=?').get(c.id, req.user.id).c;
    if (mine >= ONE_SIDED_CAP) {
      return res.status(429).json({ error: 'You have reached the limit for an unanswered conversation. Please wait for a reply before sending more.' });
    }
  }
  // External attachment links must still be real http(s) links (stored XSS guard).
  const urlErr = validateUrlFields(req.body, ['attachment']);
  if (urlErr) return res.status(400).json({ error: urlErr });
  clampStrings(req.body, ['text'], 5000);
  const { text, attachment, attachment_key, attachment_name, ref_startup_id } = req.body;
  // Private attachment key must reference an actual uploaded file.
  let key = '';
  if (attachment_key) {
    key = path.basename(String(attachment_key));
    if (!privateExists(key)) return res.status(400).json({ error: 'Re-upload the attachment and try again.' });
  }
  // A referenced startup must be visible to the sender (prevents leaking unlisted startups, P2-7).
  let refId = Number(ref_startup_id) || null;
  if (refId) {
    const rs = db.prepare('SELECT * FROM startups WHERE id=?').get(refId);
    if (!rs || !canViewStartup(rs, req.user)) return res.status(400).json({ error: 'You can only reference startups you can view.' });
  }
  if (!text && !attachment && !key && !refId) return res.status(400).json({ error: 'Add a message, attachment, or startup before sending.' });
  db.prepare('INSERT INTO messages (conversation_id, sender_id, text, attachment, attachment_key, attachment_name, ref_startup_id) VALUES (?,?,?,?,?,?,?)')
    .run(c.id, req.user.id, text || '', attachment || '', key, String(attachment_name || '').slice(0, 120), refId);
  db.prepare("UPDATE conversations SET updated_at=datetime('now') WHERE id=?").run(c.id);
  notify(otherId, 'New Message', `${req.user.name} sent you a new message. Open the conversation to reply.`, `/messages?c=${c.id}`);
  res.json({ ok: true });
});

router.post('/:id/deal-stage', (req, res) => {
  const c = db.prepare('SELECT * FROM conversations WHERE id=? AND (a_id=? OR b_id=?)')
    .get(req.params.id, req.user.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'We could not find that conversation. It may have been removed.' });
  const { stage } = req.body;
  if (stage !== '' && !DEAL_STAGES.includes(stage)) return res.status(400).json({ error: 'Please choose a valid deal stage: Intro, Due Diligence, Closed, or Passed.' });
  db.prepare('UPDATE conversations SET deal_stage=? WHERE id=?').run(stage, c.id);
  res.json({ ok: true });
});

module.exports = router;
