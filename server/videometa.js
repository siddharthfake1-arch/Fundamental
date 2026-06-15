// Best-effort, dependency-free pitch-video duration probe for uploaded files.
// Parses the MP4/MOV `mvhd` atom (duration / timescale) by scanning the head and
// tail of the file (moov is usually near the front with faststart, or at the end).
// Returns seconds, or null if it can't be determined (e.g. WebM or atypical layout).
//
// This lets the server VERIFY the 12-minute pitch cap for uploaded videos rather
// than trusting a client-submitted number. External URLs cannot be probed here and
// remain client-reported (treated as unverified).
const fs = require('fs');

function readWindow(fd, start, len) {
  const buf = Buffer.alloc(len);
  const n = fs.readSync(fd, buf, 0, len, start);
  return buf.slice(0, n);
}

function durationFromBuffer(buf) {
  const idx = buf.indexOf('mvhd');
  if (idx < 0) return null;
  const p = idx; // points at the 'mvhd' type field
  const version = buf[p + 4];
  try {
    if (version === 1) {
      const timescale = buf.readUInt32BE(p + 24);
      const durHi = buf.readUInt32BE(p + 28);
      const durLo = buf.readUInt32BE(p + 32);
      const duration = durHi * 2 ** 32 + durLo;
      if (timescale > 0) return duration / timescale;
    } else {
      const timescale = buf.readUInt32BE(p + 16);
      const duration = buf.readUInt32BE(p + 20);
      if (timescale > 0) return duration / timescale;
    }
  } catch { /* truncated window */ }
  return null;
}

function probeVideoDuration(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const size = fs.fstatSync(fd).size;
    // Scan the first 1MB (faststart) then the last 4MB (moov-at-end).
    const head = readWindow(fd, 0, Math.min(size, 1024 * 1024));
    let dur = durationFromBuffer(head);
    if (dur == null && size > head.length) {
      const tailLen = Math.min(size, 4 * 1024 * 1024);
      const tail = readWindow(fd, size - tailLen, tailLen);
      dur = durationFromBuffer(tail);
    }
    return dur != null && Number.isFinite(dur) && dur > 0 ? dur : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

module.exports = { probeVideoDuration };
