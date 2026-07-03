// Private file storage for sensitive assets (data-room collateral, message
// attachments). These files are NEVER served by express.static — they are only
// reachable through authenticated, access-checked streaming endpoints.
//
// For a real production launch this should be backed by private object storage
// (S3/R2) with server-side encryption; the interface here keeps that swap local.
const path = require('path');
const fs = require('fs');
const { PRIVATE_DIR } = require('./paths');

fs.mkdirSync(PRIVATE_DIR, { recursive: true });

// Resolve a stored key to a path, guarding against path traversal.
function privatePath(key) {
  const safe = path.basename(String(key || ''));
  if (!safe || safe === '.' || safe === '..') return null;
  return path.join(PRIVATE_DIR, safe);
}

function privateExists(key) {
  const p = privatePath(key);
  return !!(p && fs.existsSync(p));
}

// Stream a private file to the response. Returns false if the file is missing.
// Supports HTTP Range requests so large documents/videos in the data room can be
// resumed and video collateral can be seeked instead of force-downloading whole.
function streamPrivate(res, key, downloadName) {
  const p = privatePath(key);
  if (!p || !fs.existsSync(p)) return false;
  const { size } = fs.statSync(p);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Accept-Ranges', 'bytes');
  if (downloadName) {
    const safeName = String(downloadName).replace(/[^\w.\- ]/g, '_').slice(0, 120) || 'file';
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  }
  const range = res.req && res.req.headers.range;
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? parseInt(m[1], 10) : Math.max(0, size - parseInt(m[2], 10));
    let end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    if (Number.isNaN(start) || start >= size) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`);
      res.end();
      return true;
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(p, { start, end }).pipe(res);
    return true;
  }
  res.setHeader('Content-Length', size);
  fs.createReadStream(p).pipe(res);
  return true;
}

function deletePrivate(key) {
  try { const p = privatePath(key); if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch { /* best effort */ }
}

module.exports = { PRIVATE_DIR, privatePath, privateExists, streamPrivate, deletePrivate };
