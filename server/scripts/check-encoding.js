// Mojibake guard. Fails (exit 1) if any tracked source file contains the tell-tale
// byte sequences of UTF-8 text that was mis-decoded as Latin-1/Windows-1252
// (e.g. an em dash stored as a multi-char garble instead of a clean dash).
//
// It deliberately does NOT flag valid multibyte characters (real dashes, middots,
// check marks, emoji): those are correct UTF-8 and render fine. Only the corrupted
// signatures below - which essentially never occur in well-formed text - trip it.
//
// The patterns are built from char codes (not literals) so this file stays pure
// ASCII and never matches itself. Run via `node server/scripts/check-encoding.js`
// or `npm test`.
const fs = require('fs');
const path = require('path');
const cc = (...codes) => String.fromCharCode(...codes);

const ROOT = path.join(__dirname, '..', '..');
const SCAN_DIRS = ['server', 'client/src'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'data', 'coverage']);
const EXT = /\.(js|jsx|ts|tsx|json|css|html|md)$/;

// 2-char combos that only appear when UTF-8 is mis-decoded as Latin-1/Windows-1252:
//   0xE2 0x80 -> dashes / curly quotes / ellipsis
//   0xE2 0x98|0x9A|0x9C -> check mark, warning sign, etc.
//   0xF0 0x9F -> emoji
//   0xC2 0xA0|0xB7 -> non-breaking space, middot
//   0xFFFD -> Unicode replacement character
const SIGNATURES = [
  { name: 'mis-decoded punctuation', re: new RegExp(cc(0xe2, 0x80)) },
  { name: 'mis-decoded symbol', re: new RegExp(cc(0xe2) + '[' + cc(0x98, 0x9a, 0x9c) + ']') },
  { name: 'mis-decoded emoji', re: new RegExp(cc(0xf0, 0x9f)) },
  { name: 'non-breaking-space mojibake', re: new RegExp(cc(0xc2) + '[' + cc(0xa0, 0xb7) + ']') },
  { name: 'Unicode replacement character', re: new RegExp(cc(0xfffd)) },
];

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full, out); }
    else if (EXT.test(e.name)) out.push(full);
  }
}

const files = [];
for (const d of SCAN_DIRS) walk(path.join(ROOT, d), files);

const hits = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const sig of SIGNATURES) {
      if (sig.re.test(line)) hits.push(`  ${path.relative(ROOT, f)}:${i + 1} - ${sig.name}`);
    }
  });
}

if (hits.length) {
  console.error(`Encoding check FAILED - ${hits.length} mojibake occurrence(s) found:`);
  console.error(hits.join('\n'));
  console.error('\nReplace corrupted text with clean UTF-8 (or ASCII) and re-run.');
  process.exit(1);
}
console.log(`Encoding check: ${files.length} files scanned, no mojibake found.`);
