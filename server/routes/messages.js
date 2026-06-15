const express = require('express');
const { db, notify, areConnected } = require('../db');
const { auth } = require('../authmw');
const { validateUrlFields, clampStrings } = require('../security');

const router = express.Router();
router.use(auth);

const DEAL_STAGES = ['Intro', 'Due Diligence', 'Closed', 'Passed'];

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
  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY id ASC').all(c.id).map(m => ({
    ...m,
    ref_startup: m.ref_startup_id ? db.prepare('SELECT id, name, logo, sector, stage FROM startups WHERE id=?').get(m.ref_startup_id) : null,
  }));
  res.json({
    conversation: { id: c.id, deal_stage: c.deal_stage },
    other: db.prepare('SELECT id, name, role, photo, headline, verified FROM users WHERE id=?').get(otherId),
    messages,
  });
});

router.post('/:id/send', (req, res) => {
  const c = db.prepare('SELECT * FROM conversations WHERE id=? AND (a_id=? OR b_id=?)')
    .get(req.params.id, req.user.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'We could not find that conversation. It may have been removed.' });
  const otherId = c.a_id === req.user.id ? c.b_id : c.a_id;
  if (!areConnected(req.user.id, otherId)) {
    return res.status(403).json({ error: 'You can message this person once your connection is accepted.' });
  }
  // Attachments render as <a href> for the recipient — must be a real link (stored XSS)
  const urlErr = validateUrlFields(req.body, ['attachment']);
  if (urlErr) return res.status(400).json({ error: urlErr });
  clampStrings(req.body, ['text'], 5000);
  const { text, attachment, ref_startup_id } = req.body;
  if (!text && !attachment && !ref_startup_id) return res.status(400).json({ error: 'Add a message, attachment, or startup before sending.' });
  db.prepare('INSERT INTO messages (conversation_id, sender_id, text, attachment, ref_startup_id) VALUES (?,?,?,?,?)')
    .run(c.id, req.user.id, text || '', attachment || '', Number(ref_startup_id) || null);
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
