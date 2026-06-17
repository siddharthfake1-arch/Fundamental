// Lightweight security self-checks for the core primitives. Run with `npm test`.
// These are fast, dependency-free unit checks of the rules that protect the
// platform; extend with HTTP-level route tests as the test suite grows.
const assert = require('assert');
const { safeUrl, sniffFileType, validateNumericFields, sanitizeLinks } = require('./security');
// Pure module (no native sqlite dependency) so unit tests run even where the
// better-sqlite3 binding can't build.
const { canViewStartup, isListed } = require('./visibility');
const { searchCities } = require('./cities');

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

ok('a startup goes live only once it has a video (draft → live)', () => {
  const draft = { id: 7, founder_id: 5, video_url: '', hidden: 0 };
  assert.strictEqual(isListed(draft), false);                 // saved without video → not public
  const live = { ...draft, video_url: '/uploads/pitch.mp4' }; // video added
  assert.strictEqual(isListed(live), true);                   // now public
});

ok('sanitizeLinks normalizes, validates, drops blanks, and caps count', () => {
  const good = sanitizeLinks([{ label: 'Site', url: 'https://example.com' }, { label: '', url: '' }]);
  assert.deepStrictEqual(good.links, [{ label: 'Site', url: 'https://example.com' }]); // blank row dropped
  assert.ok(sanitizeLinks([{ url: 'javascript:alert(1)' }]).error, 'rejects javascript: URLs');
  assert.ok(sanitizeLinks('nope').error, 'rejects non-array');
  const tooMany = Array.from({ length: 11 }, (_, i) => ({ url: `https://e${i}.com` }));
  assert.ok(sanitizeLinks(tooMany, 10).error, 'caps at max');
  // Angle brackets stripped from labels (anti-injection).
  assert.strictEqual(sanitizeLinks([{ label: '<b>x', url: 'https://e.com' }]).links[0].label, 'bx');
});

ok('city search returns normalized "City, Country", deduped, ranked', () => {
  const mumbai = searchCities('Mumbai', 20);
  assert.ok(mumbai.includes('Mumbai, India'), 'finds Mumbai, India');
  const sf = searchCities('San Francisco', 20);
  assert.ok(sf.some(c => c.startsWith('San Francisco')), 'finds San Francisco');
  // Every result is "City, Country" and unique within the response.
  const res = searchCities('san', 20);
  assert.ok(res.every(c => /, /.test(c)), 'all results are City, Country');
  assert.strictEqual(new Set(res).size, res.length, 'no duplicates in results');
  assert.deepStrictEqual(searchCities('', 20), [], 'empty query → no results');
});

console.log(`\n${passed} checks passed.`);
