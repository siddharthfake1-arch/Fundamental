const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth } = require('./authmw');

const app = express();
app.set('trust proxy', 1); // correct protocol/IP behind Render/Railway/nginx proxies
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Health check for hosting platforms
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'fundamental' }));

// First boot on a fresh database: seed demo data automatically so the deploy
// works out of the box. Disable with AUTO_SEED=false.
{
  const { db } = require('./db');
  const empty = db.prepare('SELECT COUNT(*) c FROM users').get().c === 0;
  if (empty && process.env.AUTO_SEED !== 'false') {
    console.log('Empty database detected — seeding demo data (set AUTO_SEED=false to disable)…');
    require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'seed.js')], { stdio: 'inherit' });
  }
}

// ---- Uploads (logos, photos, pitch videos, collateral, post media) ----
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 12-minute pitch videos
});
app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  res.json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname, size: req.file.size });
});
app.use('/uploads', express.static(UPLOAD_DIR, {
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // User-uploaded SVG/HTML must never execute scripts in our origin
    if (/\.(svg|html?|xhtml)$/i.test(filePath)) {
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    }
    if (/\.(html?|xhtml)$/i.test(filePath)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
  },
}));

// ---- Public, unauthenticated startup snapshot (powers shareable pages) ----
const { db: _db, fundamentalScore: _score } = require('./db');
app.get('/api/public/startup/:id', (req, res) => {
  const s = _db.prepare("SELECT * FROM startups WHERE id=? AND video_url != ''").get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Startup not found' });
  const founder = _db.prepare('SELECT name, headline, verified FROM users WHERE id=?').get(s.founder_id);
  res.json({
    startup: {
      id: s.id, name: s.name, logo: s.logo, sector: s.sector, stage: s.stage, city: s.city,
      one_liner: s.one_liner, raising_status: s.raising_status, raising_amount: s.raising_amount,
      verified: !!s.verified, video_url: s.video_url, founded_year: s.founded_year,
      score: _score(s).total,
      upvotes: _db.prepare('SELECT COUNT(*) c FROM upvotes WHERE startup_id=?').get(s.id).c,
    },
    founder,
  });
});

// ---- API ----
app.use('/api/auth', require('./routes/auth'));
app.use('/api/startups', require('./routes/startups'));
app.use('/api/users', require('./routes/users'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/social', require('./routes/social'));
app.use('/api', require('./routes/misc'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
});

// ---- Serve built client (production) ----
const DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  // Shareable startup pages with Open Graph tags for rich link previews
  app.get('/s/:id', (req, res) => {
    const s = _db.prepare("SELECT * FROM startups WHERE id=? AND video_url != ''").get(req.params.id);
    let html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
    if (s) {
      const esc = (x) => String(x || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const base = `${req.protocol}://${req.get('host')}`;
      const og = `
    <meta property="og:title" content="${esc(s.name)} — ${esc(s.sector)} · ${esc(s.stage)} | Fundamental" />
    <meta property="og:description" content="${esc(s.one_liner)} Watch the 12-minute pitch on Fundamental." />
    <meta property="og:image" content="${base}${esc(s.logo)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${base}/s/${s.id}" />
    <meta name="twitter:card" content="summary" />`;
      html = html
        .replace('<title>Fundamental — Fundraising? Fundamental.</title>', `<title>${esc(s.name)} — ${esc(s.sector)} | Fundamental</title>${og}`);
    }
    res.send(html);
  });
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET is not set. Set a long random JWT_SECRET in production.');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Fundamental running on http://localhost:${PORT}`));
