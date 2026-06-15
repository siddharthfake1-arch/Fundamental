// Lightweight security self-checks for the core primitives. Run with `npm test`.
// These are fast, dependency-free unit checks of the rules that protect the
// platform; extend with HTTP-level route tests as the test suite grows.
const assert = require('assert');
const { safeUrl, sniffFileType, validateNumericFields } = require('./security');
const { canViewStartup, isListed } = require('./db');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

console.log('Security self-checks:');

ok('safeUrl rejects javascript: and data: URLs', () => {
  assert.strictEqual(safeUrl('javascript:alert(1)'), null);
  assert.strictEqual(safeUrl('data:text/html,<script>'), null);
  assert.strictEqual(safeUrl('https://example.com/x.pdf'), 'https://example.com/x.pdf');
  assert.strictEqual(safeUrl('/uploads/abc.png'), '/uploads/abc.png');
});

ok('sniffFileType validates by magic bytes, not extension', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
  const pdf = Buffer.from('%PDF-1.4\n');
  const text = Buffer.from('this is not an image at all');
  assert.strictEqual(sniffFileType(png, 'logo.png'), 'image');
  assert.strictEqual(sniffFileType(pdf, 'deck.pdf'), 'document');
  assert.strictEqual(sniffFileType(text, 'fake.png'), null); // spoofed extension rejected
});

ok('validateNumericFields rejects non-numeric input', () => {
  const body = { arr: 'not-a-number' };
  assert.ok(validateNumericFields(body, ['arr']));
  const clean = { arr: '1000' };
  assert.strictEqual(validateNumericFields(clean, ['arr']), null);
  assert.strictEqual(clean.arr, 1000);
});

ok('startup visibility hides unlisted/hidden from non-owners', () => {
  const draft = { id: 1, founder_id: 5, video_url: '' };
  const hidden = { id: 2, founder_id: 5, video_url: '/v.mp4', hidden: 1 };
  const live = { id: 3, founder_id: 5, video_url: '/v.mp4', hidden: 0 };
  const owner = { id: 5, role: 'founder' };
  const stranger = { id: 9, role: 'investor' };
  const admin = { id: 1, role: 'admin' };
  assert.strictEqual(isListed(live), true);
  assert.strictEqual(isListed(draft), false);
  assert.strictEqual(isListed(hidden), false);
  assert.strictEqual(canViewStartup(draft, stranger), false);
  assert.strictEqual(canViewStartup(draft, owner), true);
  assert.strictEqual(canViewStartup(hidden, stranger), false);
  assert.strictEqual(canViewStartup(hidden, admin), true);
  assert.strictEqual(canViewStartup(live, stranger), true);
});

console.log(`\n${passed} checks passed.`);
