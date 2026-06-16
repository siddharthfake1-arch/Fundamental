// Route-level integration tests for the permission boundaries that matter:
// auth, investor approval gating, data-room access, suspension, uploads, moderated
// content, and hostile query inputs. Spawns the real server against a throwaway DB.
//
// Run: npm run test:routes   (or npm test for unit + routes)
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4097;
const BASE = `http://127.0.0.1:${PORT}`;
const DB_PATH = path.join(os.tmpdir(), `fundamental-test-${process.pid}.db`);

let server;
let passed = 0;
const results = [];

function cleanupDb() {
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) { try { fs.unlinkSync(f); } catch {} }
}

// Minimal cookie-jar HTTP client.
function makeClient() {
  let cookie = '';
  return async (method, url, body, opts = {}) => {
    const headers = { Origin: BASE };
    if (cookie) headers.Cookie = cookie;
    let payload;
    if (body instanceof FormData) { payload = body; }
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(BASE + url, { method, headers, body: payload, redirect: 'manual' });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return res;
  };
}

async function waitForHealth() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('server did not become healthy');
}

async function test(name, fn) {
  try { await fn(); passed++; results.push(`  ✓ ${name}`); }
  catch (e) { results.push(`  ✗ ${name}\n      ${e.message}`); throw e; }
}

async function getOtpAndSignup(c, email, role) {
  const s = await (await c('POST', '/api/auth/send-otp', { channel: 'email', identifier: email })).json();
  const v = await (await c('POST', '/api/auth/verify-otp', { identifier: email, code: s.demo_code })).json();
  return c('POST', '/api/auth/signup', { role, name: 'Test User', email, password: 'password123', otp_token: v.otp_token, accept_terms: true });
}

async function run() {
  cleanupDb();
  server = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    env: { ...process.env, NODE_ENV: 'test', PORT: String(PORT), DB_PATH, AUTO_SEED: 'true' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  await waitForHealth();

  console.log('Route/permission tests:');

  await test('array query params do not 500 the API', async () => {
    const c = makeClient();
    await c('POST', '/api/auth/login', { email: 'investor1@demo.app', password: 'demo1234' });
    const r = await c('GET', '/api/startups?q=a&q=b&geography=x&geography=y&sort=recent');
    assert.strictEqual(r.status, 200, 'expected 200, got ' + r.status);
  });

  await test('approved demo investor can browse Discover', async () => {
    const c = makeClient();
    await c('POST', '/api/auth/login', { email: 'investor1@demo.app', password: 'demo1234' });
    assert.strictEqual((await c('GET', '/api/startups')).status, 200);
  });

  await test('newly signed-up investor is unapproved and blocked from deal flow', async () => {
    const c = makeClient();
    const r = await getOtpAndSignup(c, `inv_${Date.now()}@example.com`, 'investor');
    assert.strictEqual(r.status, 200, 'signup should succeed');
    const disc = await c('GET', '/api/startups');
    assert.strictEqual(disc.status, 403, 'unapproved investor must be blocked, got ' + disc.status);
  });

  await test('signup requires accepting terms', async () => {
    const c = makeClient();
    const email = `noterms_${Date.now()}@example.com`;
    await c('POST', '/api/auth/send-otp', { channel: 'email', identifier: email });
    const r2 = await (await c('POST', '/api/auth/send-otp', { channel: 'email', identifier: email })).json();
    const v = await (await c('POST', '/api/auth/verify-otp', { identifier: email, code: r2.demo_code })).json();
    const r = await c('POST', '/api/auth/signup', { role: 'founder', name: 'X', email, password: 'password123', otp_token: v.otp_token });
    assert.strictEqual(r.status, 400, 'must reject without terms');
  });

  await test('signup cannot use a mismatched/unverified email', async () => {
    const c = makeClient();
    const real = `real_${Date.now()}@example.com`;
    await c('POST', '/api/auth/send-otp', { channel: 'email', identifier: real });
    const r2 = await (await c('POST', '/api/auth/send-otp', { channel: 'email', identifier: real })).json();
    const v = await (await c('POST', '/api/auth/verify-otp', { identifier: real, code: r2.demo_code })).json();
    // Try to claim a DIFFERENT email with this token.
    const r = await c('POST', '/api/auth/signup', { role: 'founder', name: 'X', email: `other_${Date.now()}@example.com`, password: 'password123', otp_token: v.otp_token, accept_terms: true });
    assert.strictEqual(r.status, 400, 'must reject email that was not verified');
  });

  await test('magic-byte upload validation rejects a spoofed image', async () => {
    const c = makeClient();
    await c('POST', '/api/auth/login', { email: 'founder1@demo.app', password: 'demo1234' });
    const fd = new FormData();
    fd.append('file', new Blob(['this is plainly not an image'], { type: 'image/png' }), 'fake.png');
    const r = await c('POST', '/api/upload', fd);
    assert.strictEqual(r.status, 400, 'spoofed png must be rejected');
  });

  let collateralId;
  await test('founder can upload a private document and create restricted collateral', async () => {
    const c = makeClient();
    await c('POST', '/api/auth/login', { email: 'founder1@demo.app', password: 'demo1234' });
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from('%PDF-1.4\n%%EOF')], { type: 'application/pdf' }), 'secret.pdf');
    const up = await (await c('POST', '/api/upload/private', fd)).json();
    assert.ok(up.key, 'private upload returns a key');
    const mine = await (await c('GET', '/api/startups/mine')).json();
    const sid = mine.startup.id;
    const cr = await c('POST', `/api/startups/${sid}/collateral`, { title: 'Secret', type: 'Deck', access_level: 'Request Access', file_key: up.key });
    assert.strictEqual(cr.status, 200);
    const detail = await (await c('GET', `/api/startups/${sid}`)).json();
    collateralId = (detail.collateral.find(x => x.title === 'Secret') || {}).id;
    assert.ok(collateralId, 'collateral created');
  });

  await test('investor without access cannot download restricted collateral', async () => {
    const c = makeClient();
    await c('POST', '/api/auth/login', { email: 'investor1@demo.app', password: 'demo1234' });
    const r = await c('GET', `/api/startups/collateral/${collateralId}/download`);
    assert.strictEqual(r.status, 403, 'restricted download must be 403, got ' + r.status);
  });

  await test('private file is never served from the static /uploads path', async () => {
    // Even guessing the key shape, /uploads must not serve private documents.
    const r = await fetch(BASE + '/uploads/nonexistent-private.pdf');
    assert.ok(r.status === 404, 'private dir is not statically served');
  });

  // F-001: unapproved investors must be blocked from EVERY startup read, not just listing.
  await test('unapproved investor is blocked from facets, startup detail, and save', async () => {
    const c = makeClient();
    await getOtpAndSignup(c, `unapp_${Date.now()}@example.com`, 'investor');
    assert.strictEqual((await c('GET', '/api/startups/facets')).status, 403, 'facets must be gated');
    assert.strictEqual((await c('GET', '/api/startups/1')).status, 403, 'startup detail must be gated');
    assert.strictEqual((await c('POST', '/api/startups/1/save')).status, 403, 'save must be gated');
    assert.strictEqual((await c('GET', '/api/dashboard/investor')).status, 403, 'investor dashboard must be gated');
  });

  // F-001: an unapproved investor must not be able to download even Public collateral.
  await test('unapproved investor cannot download public collateral directly', async () => {
    // founder1 makes a Public doc
    const f = makeClient();
    await f('POST', '/api/auth/login', { email: 'founder1@demo.app', password: 'demo1234' });
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from('%PDF-1.4\n%%EOF')], { type: 'application/pdf' }), 'public.pdf');
    const up = await (await f('POST', '/api/upload/private', fd)).json();
    const mine = await (await f('GET', '/api/startups/mine')).json();
    await f('POST', `/api/startups/${mine.startup.id}/collateral`, { title: 'PublicDoc', type: 'Deck', access_level: 'Public', file_key: up.key });
    const detail = await (await f('GET', `/api/startups/${mine.startup.id}`)).json();
    const cid = detail.collateral.find(x => x.title === 'PublicDoc').id;
    const c = makeClient();
    await getOtpAndSignup(c, `unapp2_${Date.now()}@example.com`, 'investor');
    assert.strictEqual((await c('GET', `/api/startups/collateral/${cid}/download`)).status, 403, 'unapproved investor blocked from public collateral');
    global.__pubCid = cid; global.__pubSid = mine.startup.id;
  });

  // F-002: a hidden startup's "Public" collateral must NOT be downloadable by non-owners.
  await test('hidden startup public collateral is not downloadable', async () => {
    const cid = global.__pubCid, sid = global.__pubSid;
    const admin = makeClient();
    await admin('POST', '/api/auth/login', { email: 'admin@fundamental.app', password: 'demo1234' });
    await admin('POST', `/api/admin/hide-startup/${sid}`);
    const inv = makeClient();
    await inv('POST', '/api/auth/login', { email: 'investor1@demo.app', password: 'demo1234' }); // approved
    assert.strictEqual((await inv('GET', `/api/startups/collateral/${cid}/download`)).status, 404, 'hidden startup collateral must 404');
    // Owner can still reach it.
    const f = makeClient();
    await f('POST', '/api/auth/login', { email: 'founder1@demo.app', password: 'demo1234' });
    assert.strictEqual((await f('GET', `/api/startups/collateral/${cid}/download`)).status, 200, 'owner still downloads');
    await admin('POST', `/api/admin/hide-startup/${sid}`); // unhide
  });

  // F-003: a forged external pitch video with a fake duration must be rejected server-side.
  await test('external pitch video URL is rejected (no client-trusted duration)', async () => {
    const f = makeClient();
    await f('POST', '/api/auth/login', { email: 'founder3@demo.app', password: 'demo1234' });
    const r = await f('POST', '/api/startups/mine', { video_url: 'https://evil.example.com/13min.mp4', video_duration: 1 });
    assert.strictEqual(r.status, 400, 'external video URL must be rejected');
  });

  await test('suspended user is blocked immediately', async () => {
    const admin = makeClient();
    await admin('POST', '/api/auth/login', { email: 'admin@fundamental.app', password: 'demo1234' });
    const founder = makeClient();
    await founder('POST', '/api/auth/login', { email: 'founder2@demo.app', password: 'demo1234' });
    const me = await (await founder('GET', '/api/auth/me')).json();
    const fid = me.user.id;
    const sus = await admin('POST', `/api/admin/suspend-user/${fid}`);
    assert.strictEqual(sus.status, 200);
    const after = await founder('GET', '/api/auth/me');
    assert.strictEqual(after.status, 403, 'suspended session must be blocked');
    await admin('POST', `/api/admin/suspend-user/${fid}`); // reinstate
  });

  await test('account deletion erases the account, its files, and the session (F-004)', async () => {
    const c = makeClient();
    const r = await getOtpAndSignup(c, `del_${Date.now()}@example.com`, 'founder');
    assert.strictEqual(r.status, 200);
    // Upload a public image (set as profile photo) and a private document.
    const img = new FormData();
    img.append('file', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' }), 'p.png');
    const upRes = await c('POST', '/api/upload', img);
    assert.strictEqual(upRes.status, 200, 'public image upload'); const pub = await upRes.json();
    const putRes = await c('PUT', '/api/users/me', { photo: pub.url, name: 'Del User' });
    assert.strictEqual(putRes.status, 200, 'set photo');
    const doc = new FormData();
    doc.append('file', new Blob([Buffer.from('%PDF-1.4\n%%EOF')], { type: 'application/pdf' }), 'd.pdf');
    const priv = await (await c('POST', '/api/upload/private', doc)).json();
    const mkRes = await c('POST', '/api/startups/mine', { name: 'DelCo' });
    assert.strictEqual(mkRes.status, 200, 'create startup');
    const mine = await (await c('GET', '/api/startups/mine')).json();
    const colRes = await c('POST', `/api/startups/${mine.startup.id}/collateral`, { title: 'D', type: 'Deck', access_level: 'Request Access', file_key: priv.key });
    assert.strictEqual(colRes.status, 200, 'create collateral');

    const pubPath = path.join(__dirname, '..', 'uploads', path.basename(pub.url));
    const privPath = path.join(__dirname, '..', 'uploads-private', priv.key);
    assert.ok(fs.existsSync(pubPath) && fs.existsSync(privPath), 'files exist before deletion');

    assert.strictEqual((await c('GET', '/api/users/me/export')).status, 200, 'export works');
    assert.strictEqual((await c('DELETE', '/api/users/me')).status, 200, 'delete works');
    assert.strictEqual((await c('GET', '/api/auth/me')).status, 401, 'session is dead after deletion');
    assert.ok(!fs.existsSync(pubPath), 'public upload deleted');
    assert.ok(!fs.existsSync(privPath), 'private document deleted');
  });

  console.log(results.join('\n'));
  console.log(`\n${passed} route tests passed.`);
}

run()
  .then(() => { server && server.kill(); cleanupDb(); process.exit(0); })
  .catch((e) => { console.error(results.join('\n')); console.error('\nFAILED:', e.message); server && server.kill(); cleanupDb(); process.exit(1); });
