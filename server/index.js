// Friendly guard: running `npm start` before `npm install` gives a clear message
try { require.resolve('express'); } catch {
  console.error('\n  Dependencies are not installed yet.\n');
  console.error('  Run these two commands:\n');
  console.error('    npm install');
  console.error('    npm start\n');
  process.exit(1);
}

const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { auth, validateProductionConfig } = require('./authmw');
const { rateLimit, csrfOriginCheck, securityHeaders, randomFileName, sniffFileType } = require('./security');

const IS_PROD = process.env.NODE_ENV === 'production';

// Fail closed: refuse to boot a production deployment that is missing required
// security configuration (JWT secret, OTP provider, public URL) — P0-9.
validateProductionConfig();

const app = express();
// Trusted proxy hop count — set TRUST_PROXY_HOPS to match your deployment topology
// so req.ip (used for rate-limit keys) cannot be spoofed via X-Forwarded-For.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use('/api', csrfOriginCheck); // reject state-changing requests from foreign origins
app.use('/api', rateLimit({ name: 'api', windowMs: 5 * 60_000, max: 1500 })); // generous global ceiling

// Health check for hosting platforms — verifies DB connectivity, not just liveness.
app.get('/api/health', (req, res) => {
  try { require('./db').db.prepare('SELECT 1 AS ok').get(); res.json({ ok: true, service: 'fundamental' }); }
  catch { res.status(503).json({ ok: false, service: 'fundamental' }); }
});

// Public client config — lets the UI hide demo hints / unconfigured sign-in
// methods without leaking server internals. Google Sign-In is not yet implemented,
// so it is never advertised (avoids a dead-end button).
app.get('/api/config', (req, res) => res.json({
  demo: !IS_PROD,
  google_enabled: false,
}));

// ---- Database bootstrap & production safety (P0-1) ----
{
  const { db } = require('./db');
  const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;

  // Never auto-seed demo data in production, regardless of AUTO_SEED.
  if (userCount === 0 && !IS_PROD && process.env.AUTO_SEED !== 'false') {
    console.log('Empty database detected — seeding demo data (development only; set AUTO_SEED=false to disable)…');
    require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'seed.js')], { stdio: 'inherit' });
  }

  // In production, refuse to boot if demo/seed accounts exist — a public admin
  // with a known password is a critical risk.
  if (IS_PROD) {
    const demo = db.prepare("SELECT COUNT(*) c FROM users WHERE email LIKE '%@demo.app' OR email='admin@fundamental.app'").get().c;
    if (demo > 0) {
      console.error('FATAL: demo/seed accounts are present in a production database. Remove them before launch.');
      console.error('Demo accounts (…@demo.app, admin@fundamental.app) must not exist in production.');
      process.exit(1);
    }
  }

  // Secure admin bootstrap: create the first admin from environment variables when
  // no admin exists. Not reachable through public signup (P0-1).
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hasAdmin = db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c > 0;
    if (!hasAdmin) {
      const email = String(process.env.ADMIN_EMAIL).toLowerCase();
      if (process.env.ADMIN_PASSWORD.length < 12) {
        console.error('FATAL: ADMIN_PASSWORD must be at least 12 characters.');
        process.exit(1);
      }
      db.prepare("INSERT INTO users (role, name, email, password_hash, email_verified, accepted_terms_at, status) VALUES ('admin', ?, ?, ?, 1, datetime('now'), 'active')")
        .run(process.env.ADMIN_NAME || 'Administrator', email, bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12));
      console.log(`Bootstrapped admin account: ${email} (rotate the password after first sign-in).`);
    }
  }
}

// ---- Uploads ----
// Public assets (logos, photos, pitch video, post media) are served from /uploads.
// Private assets (data-room collateral, message attachments) go to a separate dir
// that is NEVER served statically and is only reachable via access-checked
// streaming endpoints (P0-3, P1-8).
const { PRIVATE_DIR } = require('./storage');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const SIZE_LIMITS = { image: 10 * 1024 * 1024, video: 600 * 1024 * 1024, document: 60 * 1024 * 1024 };
const uploadLimiter = rateLimit({ name: 'upload', windowMs: 60 * 60_000, max: 40 });

// Public upload: images + video only, validated by magic bytes after write.
const publicUpload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (req, file, cb) => cb(null, randomFileName(file.originalname)) }),
  limits: { fileSize: SIZE_LIMITS.video },
});
app.post('/api/upload', auth, uploadLimiter, (req, res) => {
  publicUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : (err.message || 'Upload failed') });
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    const p = path.join(UPLOAD_DIR, req.file.filename);
    let head;
    try { const fd = fs.openSync(p, 'r'); const buf = Buffer.alloc(4096); const n = fs.readSync(fd, buf, 0, 4096, 0); fs.closeSync(fd); head = buf.slice(0, n); }
    catch { return res.status(400).json({ error: 'Upload failed' }); }
    const kind = sniffFileType(head, req.file.originalname);
    if (!kind || !['image', 'video'].includes(kind) || req.file.size > SIZE_LIMITS[kind]) {
      try { fs.unlinkSync(p); } catch { /* ignore */ }
      return res.status(400).json({ error: 'Unsupported or oversized file. Allowed here: images and video.' });
    }
    const out = { url: `/uploads/${req.file.filename}`, name: req.file.originalname, size: req.file.size };
    if (kind === 'video') {
      // Server-verified duration for the 12-minute pitch cap (null if unverifiable).
      const dur = require('./videometa').probeVideoDuration(p);
      if (dur != null) out.duration = Math.round(dur);
    }
    res.json(out);
  });
});

// Private upload: documents + images for the data room and message attachments.
// Returns an opaque key; the file is never publicly served.
const privateUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: SIZE_LIMITS.document } });
app.post('/api/upload/private', auth, uploadLimiter, (req, res) => {
  privateUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 60 MB).' : (err.message || 'Upload failed') });
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    const kind = sniffFileType(req.file.buffer, req.file.originalname);
    if (!kind || !['document', 'image'].includes(kind)) {
      return res.status(400).json({ error: 'Unsupported file type. Allowed: PDF, Office documents, CSV, images, ZIP.' });
    }
    const fname = randomFileName(req.file.originalname);
    fs.writeFileSync(path.join(PRIVATE_DIR, fname), req.file.buffer);
    res.json({ key: fname, name: req.file.originalname, size: req.file.size });
  });
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
  // Public sharing is founder opt-in (P1-12): only published startups whose
  // owner enabled public_share are exposed unauthenticated.
  const s = _db.prepare("SELECT * FROM startups WHERE id=? AND video_url != '' AND public_share = 1").get(req.params.id);
  if (!s) return res.status(404).json({ error: 'This startup is not publicly shared.' });
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
app.use('/api/communities', require('./routes/communities'));
app.use('/api', require('./routes/misc'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found' }));
app.use((err, req, res, next) => {
  // In production, log only a concise line (no full stack/object that may contain
  // user data); wire a structured logger / error tracker (e.g. Sentry) here.
  if (IS_PROD) console.error(`[error] ${req.method} ${req.path}: ${err && err.message}`);
  else console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
});

// ---- Serve built client (production) ----
const DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  // Shareable startup pages with Open Graph tags for rich link previews
  app.get('/s/:id', (req, res) => {
    const s = _db.prepare("SELECT * FROM startups WHERE id=? AND video_url != '' AND public_share = 1").get(req.params.id);
    let html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
    if (s) {
      // Robust HTML-attribute escaping for all five sensitive characters (P3-4).
      const esc = (x) => String(x || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const base = `${req.protocol}://${req.get('host')}`;
      // Handle absolute vs relative image URLs correctly.
      const img = /^https?:\/\//i.test(s.logo || '') ? s.logo : `${base}${s.logo || ''}`;
      const og = `
    <meta property="og:title" content="${esc(s.name)} — ${esc(s.sector)} · ${esc(s.stage)} | Fundamental" />
    <meta property="og:description" content="${esc(s.one_liner)} Watch the 12-minute pitch on Fundamental." />
    <meta property="og:image" content="${esc(img)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${esc(base)}/s/${s.id}" />
    <meta name="twitter:card" content="summary" />`;
      const desc = `${esc(s.one_liner)} Watch the 12-minute pitch on Fundamental.`;
      html = html
        .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${desc}" />`)
        .replace(/<title>[^<]*<\/title>/, `<title>${esc(s.name)} — ${esc(s.sector)} | Fundamental</title>${og}`);
    }
    res.send(html);
  });
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
} else {
  // Client not built yet — show instructions instead of "Cannot GET /"
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.status(503).send(`<!doctype html><html><body style="font-family:system-ui;background:#09090b;color:#e5e7eb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
      <div style="max-width:560px;padding:32px;border:1px solid #2a2a31;border-radius:16px;background:#101013">
        <h2 style="margin:0 0 12px">Fundamental — one more step</h2>
        <p style="color:#9ca3af;line-height:1.6">The server is running, but the website files haven't been built yet. In your terminal, run these commands one by one, then restart:</p>
        <pre style="background:#16161a;border:1px solid #2a2a31;border-radius:10px;padding:14px;overflow:auto">cd client
npm install
npm run build
cd ..
npm start</pre>
        <p style="color:#9ca3af;font-size:13px">If <code>npm install</code> shows an error inside the client folder, that error is the real problem — copy it and ask for help.</p>
      </div></body></html>`);
  });
}

// (JWT_SECRET is validated in authmw.js — the server refuses to boot in production without it.)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Fundamental running on http://localhost:${PORT}`));
