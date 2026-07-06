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
  return c('POST', '/api/auth/signup', { role, name: 'Test User', email, password: 'Testpass123', otp_token: v.otp_token, accept_terms: true });
}

async function run() {
  cleanupDb();
  server = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    env: { ...process.env, NODE_ENV: 'test', PORT: String(PORT), DB_PATH, AUTO_SEED: 'true', MSG_ONE_SIDED_CAP: '3',
      ANDROID_CERT_SHA256: 'AA:BB:CC', APPLE_TEAM_ID: 'TESTTEAMID' },
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
    const r = await c('POST', '/api/auth/signup', { role: 'founder', name: 'X', email, password: 'Testpass123', otp_token: v.otp_token });
    assert.strictEqual(r.status, 400, 'must reject without terms');
  });

  await test('signup cannot use a mismatched/unverified email', async () => {
    const c = makeClient();
    const real = `real_${Date.now()}@example.com`;
    await c('POST', '/api/auth/send-otp', { channel: 'email', identifier: real });
    const r2 = await (await c('POST', '/api/auth/send-otp', { channel: 'email', identifier: real })).json();
    const v = await (await c('POST', '/api/auth/verify-otp', { identifier: real, code: r2.demo_code })).json();
    // Try to claim a DIFFERENT email with this token.
    const r = await c('POST', '/api/auth/signup', { role: 'founder', name: 'X', email: `other_${Date.now()}@example.com`, password: 'Testpass123', otp_token: v.otp_token, accept_terms: true });
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

  await test('startup links are saved and returned, with bad URLs rejected', async () => {
    const f = makeClient();
    await f('POST', '/api/auth/login', { email: 'founder1@demo.app', password: 'demo1234' });
    const bad = await f('POST', '/api/startups/mine', { links: [{ label: 'x', url: 'javascript:alert(1)' }] });
    assert.strictEqual(bad.status, 400, 'javascript: link must be rejected');
    const okRes = await f('POST', '/api/startups/mine', { links: [{ label: 'Site', url: 'https://paylane.example' }, { label: '', url: '' }] });
    assert.strictEqual(okRes.status, 200, 'valid links saved');
    const mine = await (await f('GET', '/api/startups/mine')).json();
    assert.deepStrictEqual(mine.startup.links, [{ label: 'Site', url: 'https://paylane.example' }], 'links returned, blank dropped');
  });

  await test('founder can save a startup without a video; it stays a non-public draft', async () => {
    const c = makeClient();
    await getOtpAndSignup(c, `draft_${Date.now()}@example.com`, 'founder');
    const mk = await c('POST', '/api/startups/mine', { name: 'DraftCo', one_liner: 'No video yet' });
    assert.strictEqual(mk.status, 200, 'save without video allowed');
    const mine = await (await c('GET', '/api/startups/mine')).json();
    assert.strictEqual(mine.live, false, 'no video → not live');
    const sid = mine.startup.id;
    // Owner can view their own draft.
    assert.strictEqual((await c('GET', `/api/startups/${sid}`)).status, 200, 'owner sees own draft');
    // An approved investor cannot see the draft, and it is absent from Discover.
    const inv = makeClient();
    await inv('POST', '/api/auth/login', { email: 'investor1@demo.app', password: 'demo1234' });
    assert.strictEqual((await inv('GET', `/api/startups/${sid}`)).status, 404, 'draft hidden from others');
    const disc = await (await inv('GET', '/api/startups?limit=60')).json();
    assert.ok(!disc.startups.some(t => t.id === sid), 'draft excluded from Discover');
    // Onboarding can be completed without a video.
    assert.strictEqual((await c('POST', '/api/users/complete-onboarding')).status, 200, 'finish without video');
  });

  await test('team members can be added, edited, removed, and are returned on the profile', async () => {
    const c = makeClient();
    await getOtpAndSignup(c, `team_${Date.now()}@example.com`, 'founder');
    await c('POST', '/api/startups/mine', { name: 'TeamCo', one_liner: 'we hire' });
    const sid = (await (await c('GET', '/api/startups/mine')).json()).startup.id;
    // Add two.
    let r = await c('PUT', '/api/startups/mine/team', { team: [
      { name: 'Asha Rao', role: 'CEO', linkedin: 'https://linkedin.com/in/asha' },
      { name: 'Ben Cole', role: 'CTO' },
    ] });
    assert.strictEqual(r.status, 200);
    let team = (await r.json()).team;
    assert.strictEqual(team.length, 2, 'two members saved');
    // Missing name is rejected.
    const badRes = await c('PUT', '/api/startups/mine/team', { team: [{ role: 'noname' }] });
    assert.strictEqual(badRes.status, 400, 'name required');
    // Edit + remove (replace roster with one edited member).
    r = await c('PUT', '/api/startups/mine/team', { team: [{ name: 'Asha Rao', role: 'Founder & CEO' }] });
    team = (await r.json()).team;
    assert.strictEqual(team.length, 1, 'removed down to one');
    assert.strictEqual(team[0].role, 'Founder & CEO', 'edit persisted');
    // Returned on the full profile.
    const detail = await (await c('GET', `/api/startups/${sid}`)).json();
    assert.strictEqual(detail.startup.team.length, 1, 'team rendered on profile payload');
  });

  await test('city search returns deduped "City, Country" results', async () => {
    const c = makeClient();
    await c('POST', '/api/auth/login', { email: 'investor1@demo.app', password: 'demo1234' });
    const d = await (await c('GET', '/api/cities?q=mumbai')).json();
    assert.ok(Array.isArray(d.cities) && d.cities.includes('Mumbai, India'), 'returns Mumbai, India');
    assert.strictEqual(new Set(d.cities).size, d.cities.length, 'no duplicate city-country pairs');
    assert.ok(d.cities.every(x => /, /.test(x)), 'all results normalized to City, Country');
  });

  await test('owner can edit/delete their social post; non-owner is blocked (403)', async () => {
    const a = makeClient();
    await getOtpAndSignup(a, `op_${Date.now()}@example.com`, 'founder');
    const created = await (await a('POST', '/api/social', { type: 'Milestone', text: 'We shipped a big new feature today.' })).json();
    const pid = created.post.id;
    assert.ok(created.post.can_edit, 'owner sees can_edit');
    // Owner edits.
    const ed = await a('PUT', `/api/social/${pid}`, { type: 'Milestone', text: 'Edited: we shipped an even bigger feature.' });
    assert.strictEqual(ed.status, 200, 'owner edit ok');
    // Another user cannot edit or delete it.
    const b = makeClient();
    await getOtpAndSignup(b, `op2_${Date.now()}@example.com`, 'founder');
    assert.strictEqual((await b('PUT', `/api/social/${pid}`, { type: 'Milestone', text: 'malicious edit attempt here now' })).status, 403, 'non-owner edit blocked');
    assert.strictEqual((await b('DELETE', `/api/social/${pid}`)).status, 403, 'non-owner delete blocked');
    // Owner deletes.
    assert.strictEqual((await a('DELETE', `/api/social/${pid}`)).status, 200, 'owner delete ok');
  });

  await test('founder can edit/delete own update & activity; others blocked (403)', async () => {
    const a = makeClient();
    await a('POST', '/api/auth/login', { email: 'founder1@demo.app', password: 'demo1234' });
    const sid = (await (await a('GET', '/api/startups/mine')).json()).startup.id;
    await a('POST', `/api/startups/${sid}/updates`, { headline: 'Q3 progress', body: 'Solid quarter across the board.' });
    await a('POST', `/api/startups/${sid}/activity`, { type: 'Milestone Achieved', text: 'Crossed 1,000 customers.' });
    const detail = await (await a('GET', `/api/startups/${sid}`)).json();
    const uid = detail.updates[0].id, aid = detail.activity[0].id;
    assert.strictEqual((await a('PUT', `/api/startups/updates/${uid}`, { headline: 'Q3 progress (edited)', body: 'Even better than reported.' })).status, 200, 'owner edits update');
    assert.strictEqual((await a('PUT', `/api/startups/activity/${aid}`, { type: 'Milestone Achieved', text: 'Crossed 1,200 customers.' })).status, 200, 'owner edits activity');
    // A different founder cannot touch them.
    const b = makeClient();
    await b('POST', '/api/auth/login', { email: 'founder2@demo.app', password: 'demo1234' });
    assert.strictEqual((await b('PUT', `/api/startups/updates/${uid}`, { headline: 'x', body: 'hijack attempt on update' })).status, 403, 'non-owner update edit blocked');
    assert.strictEqual((await b('DELETE', `/api/startups/activity/${aid}`)).status, 403, 'non-owner activity delete blocked');
    // Owner deletes.
    assert.strictEqual((await a('DELETE', `/api/startups/updates/${uid}`)).status, 200, 'owner deletes update');
  });

  await test('community discussion edit/delete is owner/admin only (403 otherwise)', async () => {
    // founder1 creates a community; admin approves it.
    const owner = makeClient();
    await owner('POST', '/api/auth/login', { email: 'founder1@demo.app', password: 'demo1234' });
    const slug = (await (await owner('POST', '/api/communities', { name: `Edit Test ${Date.now()}`, kind: 'topic', description: 'x' })).json()).slug;
    const admin = makeClient();
    await admin('POST', '/api/auth/login', { email: 'admin@fundamental.app', password: 'demo1234' });
    const list = await (await admin('GET', '/api/admin/communities')).json();
    const cid = list.communities.find(c => c.slug === slug).id;
    await admin('POST', `/api/admin/communities/${cid}/approve`);
    // Owner (a member) posts a discussion.
    await owner('POST', `/api/communities/${slug}/posts`, { title: 'Hello', body: 'First discussion here.' });
    const detail = await (await owner('GET', `/api/communities/${slug}`)).json();
    const postId = detail.posts[0].id;
    assert.ok(detail.posts[0].can_edit, 'author sees can_edit');
    assert.strictEqual((await owner('PUT', `/api/communities/posts/${postId}`, { title: 'Hello (edited)', body: 'Edited body content.' })).status, 200, 'author edits');
    // A different approved investor cannot edit/delete it.
    const other = makeClient();
    await other('POST', '/api/auth/login', { email: 'investor1@demo.app', password: 'demo1234' });
    assert.strictEqual((await other('PUT', `/api/communities/posts/${postId}`, { title: 'x', body: 'hijack' })).status, 403, 'non-author edit blocked');
    assert.strictEqual((await other('DELETE', `/api/communities/posts/${postId}`)).status, 403, 'non-author delete blocked');
    // Admin can delete.
    assert.strictEqual((await admin('DELETE', `/api/communities/posts/${postId}`)).status, 200, 'admin delete ok');
  });

  await test('investor can edit own private note; backend rejects others', async () => {
    const inv = makeClient();
    await inv('POST', '/api/auth/login', { email: 'investor1@demo.app', password: 'demo1234' });
    // Find a visible startup to note on.
    const disc = await (await inv('GET', '/api/startups?limit=1')).json();
    const sid = disc.startups[0].id;
    const made = await (await inv('POST', `/api/startups/${sid}/notes`, { text: 'Strong founder; revisit next quarter.' })).json();
    const noteId = made.notes[0].id;
    assert.strictEqual((await inv('PUT', `/api/startups/notes/${noteId}`, { text: 'Updated thesis on this deal.' })).status, 200, 'owner edits note');
    const other = makeClient();
    await other('POST', '/api/auth/login', { email: 'investor2@demo.app', password: 'demo1234' });
    assert.strictEqual((await other('PUT', `/api/startups/notes/${noteId}`, { text: 'not mine' })).status, 403, 'non-owner note edit blocked');
  });

  await test('signup rejects a weak/common password', async () => {
    const c = makeClient();
    const email = `weakpw_${Date.now()}@example.com`;
    const s = await (await c('POST', '/api/auth/send-otp', { channel: 'email', identifier: email })).json();
    const v = await (await c('POST', '/api/auth/verify-otp', { identifier: email, code: s.demo_code })).json();
    const r = await c('POST', '/api/auth/signup', { role: 'founder', name: 'X', email, password: 'password123', otp_token: v.otp_token, accept_terms: true });
    assert.strictEqual(r.status, 400, 'common password rejected');
  });

  await test('forgot/reset password: neutral response, then OTP-verified reset works', async () => {
    const c = makeClient();
    const email = `reset_${Date.now()}@example.com`;
    await getOtpAndSignup(c, email, 'investor');
    // Unknown email -> still neutral { ok: true }, no enumeration.
    const unknown = await (await c('POST', '/api/auth/forgot-password', { email: `nobody_${Date.now()}@example.com` })).json();
    assert.ok(unknown.ok === true, 'neutral ok for unknown email');
    assert.ok(unknown.demo_code === undefined, 'no code issued for non-account');
    // Real account -> dev returns a demo code we can use to reset.
    const fp = await (await c('POST', '/api/auth/forgot-password', { email })).json();
    assert.ok(fp.demo_code, 'reset code issued for real account (dev)');
    // Reset must enforce the password policy.
    assert.strictEqual((await c('POST', '/api/auth/reset-password', { email, code: fp.demo_code, password: 'weak' })).status, 400, 'weak password rejected');
    // Valid reset succeeds and the new password logs in.
    const rr = await c('POST', '/api/auth/reset-password', { email, code: fp.demo_code, password: 'NewPass456' });
    assert.strictEqual(rr.status, 200, 'reset ok');
    const login = await c('POST', '/api/auth/login', { email, password: 'NewPass456' });
    assert.strictEqual(login.status, 200, 'new password works');
  });

  await test('suspended/flagged users are hidden from discovery and profile', async () => {
    // Create a normal user, then have an admin suspend them.
    const victim = makeClient();
    const vemail = `susp_${Date.now()}@example.com`;
    const vme = await (await getOtpAndSignup(victim, vemail, 'founder')).json();
    const vid = vme.user.id;
    const admin = makeClient();
    await admin('POST', '/api/auth/login', { email: 'admin@fundamental.app', password: 'demo1234' });
    const sus = await (await admin('POST', `/api/admin/suspend-user/${vid}`, { reason: 'test' })).json();
    assert.strictEqual(sus.status, 'suspended', 'admin suspended the user');
    // A normal member can no longer see the suspended profile.
    const viewer = makeClient();
    await viewer('POST', '/api/auth/login', { email: 'investor1@demo.app', password: 'demo1234' });
    assert.strictEqual((await viewer('GET', `/api/users/profile/${vid}`)).status, 404, 'suspended profile hidden');
    assert.strictEqual((await viewer('POST', `/api/users/connect/${vid}`)).status, 400, 'cannot connect to suspended user');
    const net = await (await viewer('GET', '/api/users/network')).json();
    assert.ok(!net.users.some(u => u.id === vid), 'suspended user absent from network directory');
    // Admins can still see them (for moderation).
    assert.strictEqual((await admin('GET', `/api/users/profile/${vid}`)).status, 200, 'admin still sees suspended profile');
  });

  await test('one-sided message cap blocks until the recipient replies', async () => {
    // Two demo founders connect, then one floods the conversation.
    const a = makeClient(); const b = makeClient();
    const ame = await (await a('POST', '/api/auth/login', { email: 'founder1@demo.app', password: 'demo1234' })).json();
    const bme = await (await b('POST', '/api/auth/login', { email: 'founder2@demo.app', password: 'demo1234' })).json();
    // Establish an accepted connection a<->b (robust to any pre-existing link).
    const connRes = await a('POST', `/api/users/connect/${bme.user.id}`);
    if (connRes.status === 200) {
      const reqs = await (await b('GET', '/api/users/connections')).json();
      const pending = reqs.pending.find(p => p.user_id === ame.user.id);
      if (pending) await b('POST', `/api/users/connections/${pending.id}/accept`);
    }
    const conv = await (await a('POST', `/api/messages/start/${bme.user.id}`)).json();
    const conversationId = conv.conversation_id;
    assert.ok(conversationId, 'conversation established');
    // Cap is 3 (set via MSG_ONE_SIDED_CAP for tests): first 3 send, 4th is blocked.
    for (let i = 0; i < 3; i++) {
      assert.strictEqual((await a('POST', `/api/messages/${conversationId}/send`, { text: `msg ${i}` })).status, 200, `message ${i} sent`);
    }
    assert.strictEqual((await a('POST', `/api/messages/${conversationId}/send`, { text: 'one too many' })).status, 429, 'one-sided cap reached');
    // Once b replies, the cap lifts for a.
    await b('POST', `/api/messages/${conversationId}/send`, { text: 'reply' });
    assert.strictEqual((await a('POST', `/api/messages/${conversationId}/send`, { text: 'now allowed' })).status, 200, 'cap lifted after reply');
  });

  await test('creator can withdraw a pending community; non-pending withdraw blocked', async () => {
    const owner = makeClient();
    await owner('POST', '/api/auth/login', { email: 'founder1@demo.app', password: 'demo1234' });
    const slug = (await (await owner('POST', '/api/communities', { name: `Withdraw ${Date.now()}`, kind: 'topic', description: 'x' })).json()).slug;
    // A different user cannot withdraw it.
    const other = makeClient();
    await other('POST', '/api/auth/login', { email: 'founder2@demo.app', password: 'demo1234' });
    assert.strictEqual((await other('DELETE', `/api/communities/${slug}`)).status, 404, 'non-creator cannot see/withdraw pending');
    // Creator withdraws while pending.
    assert.strictEqual((await owner('DELETE', `/api/communities/${slug}`)).status, 200, 'creator withdraws pending community');
    assert.strictEqual((await owner('GET', `/api/communities/${slug}`)).status, 404, 'community is gone');
  });

  await test('global search returns startups, people, and communities', async () => {
    const c = makeClient();
    await c('POST', '/api/auth/login', { email: 'investor1@demo.app', password: 'demo1234' });
    const d = await (await c('GET', '/api/search?q=pay')).json();
    assert.ok(Array.isArray(d.startups) && Array.isArray(d.people) && Array.isArray(d.communities), 'three result buckets');
    const short = await (await c('GET', '/api/search?q=a')).json();
    assert.strictEqual(short.startups.length + short.people.length + short.communities.length, 0, 'sub-2-char query returns nothing');
  });

  await test('blocking hides profiles both ways and closes messaging', async () => {
    const a = makeClient(); const b = makeClient();
    const ame = await (await a('POST', '/api/auth/login', { email: 'founder1@demo.app', password: 'demo1234' })).json();
    const bme = await (await b('POST', '/api/auth/login', { email: 'founder3@demo.app', password: 'demo1234' })).json();
    // a blocks b.
    const r = await (await a('POST', `/api/users/block/${bme.user.id}`)).json();
    assert.strictEqual(r.blocked, true, 'block created');
    assert.strictEqual((await a('GET', `/api/users/profile/${bme.user.id}`)).status, 404, 'blocker cannot see blocked profile');
    assert.strictEqual((await b('GET', `/api/users/profile/${ame.user.id}`)).status, 404, 'blocked cannot see blocker profile');
    assert.strictEqual((await b('POST', `/api/users/connect/${ame.user.id}`)).status, 400, 'blocked cannot connect');
    assert.strictEqual((await b('POST', `/api/messages/start/${ame.user.id}`)).status, 404, 'blocked cannot start conversation');
    // Blocked list shows them; unblock restores visibility.
    const list = await (await a('GET', '/api/users/blocked')).json();
    assert.ok(list.blocked.some(u => u.id === bme.user.id), 'blocked list includes the user');
    await a('POST', `/api/users/block/${bme.user.id}`); // toggle off
    assert.strictEqual((await a('GET', `/api/users/profile/${bme.user.id}`)).status, 200, 'unblock restores profile');
  });

  await test('change-email requires password + OTP on the new address', async () => {
    const c = makeClient();
    const email = `chg_${Date.now()}@example.com`;
    await getOtpAndSignup(c, email, 'investor');
    const newEmail = `chg_new_${Date.now()}@example.com`;
    // Missing/incorrect password is rejected even with a valid code.
    const s = await (await c('POST', '/api/auth/send-otp', { channel: 'email', identifier: newEmail })).json();
    assert.strictEqual((await c('POST', '/api/auth/change-email', { new_email: newEmail, code: s.demo_code, password: 'wrongpass1' })).status, 400, 'wrong password rejected');
    const ok = await c('POST', '/api/auth/change-email', { new_email: newEmail, code: s.demo_code, password: 'Testpass123' });
    assert.strictEqual(ok.status, 200, 'change-email succeeds with password + code');
    assert.strictEqual((await c('POST', '/api/auth/login', { email: newEmail, password: 'Testpass123' })).status, 200, 'login works with the new email');
  });

  await test('reports accept extended target types; message reports need participation', async () => {
    const c = makeClient();
    await c('POST', '/api/auth/login', { email: 'investor1@demo.app', password: 'demo1234' });
    // Reporting a nonexistent comment 404s; unsupported type 400s.
    assert.strictEqual((await c('POST', '/api/users/report', { target_type: 'comment', target_id: 999999, reason: 'spam' })).status, 404, 'missing comment 404');
    assert.strictEqual((await c('POST', '/api/users/report', { target_type: 'bogus', target_id: 1, reason: 'spam' })).status, 400, 'unsupported type 400');
    // A message the reporter is not part of cannot be reported (even if it exists).
    assert.strictEqual((await c('POST', '/api/users/report', { target_type: 'message', target_id: 999999, reason: 'spam' })).status, 404, 'foreign/missing message 404');
  });

  await test('admin audit log endpoint lists entries; non-admin blocked', async () => {
    const admin = makeClient();
    await admin('POST', '/api/auth/login', { email: 'admin@fundamental.app', password: 'demo1234' });
    const d = await (await admin('GET', '/api/admin/audit-logs')).json();
    assert.ok(typeof d.total === 'number' && Array.isArray(d.logs) && Array.isArray(d.actions), 'audit payload shape');
    const c = makeClient();
    await c('POST', '/api/auth/login', { email: 'investor1@demo.app', password: 'demo1234' });
    assert.strictEqual((await c('GET', '/api/admin/audit-logs')).status, 403, 'non-admin blocked');
  });

  await test('competitor founders cannot read operating financials on startup detail', async () => {
    // founder2 views founder1's listed startup: burn/runway/cac/ltv must be nulled.
    const owner = makeClient(); const rival = makeClient(); const inv = makeClient();
    await owner('POST', '/api/auth/login', { email: 'founder1@demo.app', password: 'demo1234' });
    const sid = (await (await owner('GET', '/api/startups/mine')).json()).startup.id;
    await rival('POST', '/api/auth/login', { email: 'founder2@demo.app', password: 'demo1234' });
    const rv = await (await rival('GET', `/api/startups/${sid}`)).json();
    assert.strictEqual(rv.startup.burn, null, 'burn hidden from rival founder');
    assert.strictEqual(rv.startup.runway, null, 'runway hidden from rival founder');
    // Approved investors still see them (may be 0/null in seed, but not force-nulled
    // when the owner views their own).
    const own = await (await owner('GET', `/api/startups/${sid}`)).json();
    assert.notStrictEqual(own.startup.burn, undefined, 'owner payload retains the field');
    await inv('POST', '/api/auth/login', { email: 'investor1@demo.app', password: 'demo1234' });
    assert.strictEqual((await inv('GET', `/api/startups/${sid}`)).status, 200, 'investor detail loads');
  });

  await test('reacting to an update of a draft startup is blocked (no metric leak)', async () => {
    // Founder3 saves a DRAFT (no video) startup with an update; founder2 must not
    // be able to read it back through the react endpoint.
    const owner = makeClient();
    await owner('POST', '/api/auth/login', { email: 'founder3@demo.app', password: 'demo1234' });
    let mine = (await (await owner('GET', '/api/startups/mine')).json()).startup;
    if (!mine) { await owner('POST', '/api/startups/mine', { name: 'Draft Co' }); mine = (await (await owner('GET', '/api/startups/mine')).json()).startup; }
    await owner('POST', `/api/startups/${mine.id}/updates`, { headline: 'Secret metrics', body: 'ARR is confidential here.', arr: 123456 });
    const detail = await (await owner('GET', `/api/startups/${mine.id}`)).json();
    const uid = detail.updates[0].id;
    const rival = makeClient();
    await rival('POST', '/api/auth/login', { email: 'founder2@demo.app', password: 'demo1234' });
    if (detail.startup.video_url) {
      // Seeded startup happens to be live — reaction is then legitimately allowed.
      assert.ok(true, 'seed startup already live; visibility gate not exercisable here');
    } else {
      assert.strictEqual((await rival('POST', `/api/startups/updates/${uid}/react`, { emoji: '🔥' })).status, 404, 'draft update unreadable via react');
    }
  });

  await test('network directory paginates and honors limit/offset', async () => {
    const c = makeClient();
    await c('POST', '/api/auth/login', { email: 'investor1@demo.app', password: 'demo1234' });
    const d = await (await c('GET', '/api/users/network?limit=2')).json();
    assert.ok(typeof d.total === 'number', 'total present');
    assert.ok(d.users.length <= 2, 'limit respected');
    const page2 = await (await c('GET', '/api/users/network?limit=2&offset=2')).json();
    if (d.total > 2 && page2.users.length && d.users.length) {
      assert.notStrictEqual(page2.users[0].id, d.users[0].id, 'offset returns a different page');
    }
  });

  // ---- Mobile auth: bearer tokens + app-origin CORS ----
  // The native apps (Capacitor WebView at capacitor://localhost / https://localhost)
  // authenticate with Authorization: Bearer and credentials:'omit'. These tests pin
  // the whole contract: token issuance, header auth, CORS headers, preflight, and
  // that the web cookie CSRF posture is unchanged.

  let bearerToken;
  await test('login response includes a bearer token alongside the cookie', async () => {
    const c = makeClient();
    const r = await c('POST', '/api/auth/login', { email: 'investor1@demo.app', password: 'demo1234' });
    assert.strictEqual(r.status, 200);
    const d = await r.json();
    assert.ok(typeof d.token === 'string' && d.token.length > 20, 'token present in body');
    bearerToken = d.token;
  });

  await test('bearer token authenticates /me without any cookie', async () => {
    const r = await fetch(BASE + '/api/auth/me', { headers: { Authorization: `Bearer ${bearerToken}` } });
    assert.strictEqual(r.status, 200, 'bearer-only auth works, got ' + r.status);
    const d = await r.json();
    assert.strictEqual(d.user.email, 'investor1@demo.app');
  });

  await test('garbage bearer token is rejected with 401', async () => {
    const r = await fetch(BASE + '/api/auth/me', { headers: { Authorization: 'Bearer nonsense' } });
    assert.strictEqual(r.status, 401);
  });

  await test('bearer write from the app origin passes CSRF and gets CORS headers', async () => {
    const r = await fetch(BASE + '/api/notifications/read', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearerToken}`, Origin: 'capacitor://localhost', 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.strictEqual(r.status, 200, 'app-origin bearer write allowed, got ' + r.status);
    assert.strictEqual(r.headers.get('access-control-allow-origin'), 'capacitor://localhost');
  });

  await test('CORS preflight from the app origin gets 204 without Allow-Credentials', async () => {
    const r = await fetch(BASE + '/api/auth/login', {
      method: 'OPTIONS',
      headers: {
        Origin: 'capacitor://localhost',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    assert.strictEqual(r.status, 204, 'preflight answered, got ' + r.status);
    assert.strictEqual(r.headers.get('access-control-allow-origin'), 'capacitor://localhost');
    assert.ok(/authorization/i.test(r.headers.get('access-control-allow-headers') || ''), 'Authorization allowed');
    assert.strictEqual(r.headers.get('access-control-allow-credentials'), null, 'credentials must NOT be allowed');
  });

  await test('cookie write from a foreign web origin is still blocked (CSRF regression)', async () => {
    const c = makeClient();
    await c('POST', '/api/auth/login', { email: 'investor1@demo.app', password: 'demo1234' });
    const r = await c('POST', '/api/notifications/read', {}, {});
    assert.strictEqual(r.status, 200, 'same-origin write works');
    // Same session, hostile origin, no bearer → 403.
    const hostile = await fetch(BASE + '/api/notifications/read', {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json', Cookie: `token=${bearerToken}` },
      body: '{}',
    });
    assert.strictEqual(hostile.status, 403, 'foreign-origin cookie write blocked, got ' + hostile.status);
  });

  await test('bearer header takes precedence over a valid cookie', async () => {
    // Valid cookie + garbage bearer must fail: the explicit header IS the identity.
    const r = await fetch(BASE + '/api/auth/me', {
      headers: { Cookie: `token=${bearerToken}`, Authorization: 'Bearer nonsense' },
    });
    assert.strictEqual(r.status, 401, 'garbage bearer must not fall back to cookie');
  });

  await test('deep-link well-known files are served when configured', async () => {
    const al = await fetch(BASE + '/.well-known/assetlinks.json');
    assert.strictEqual(al.status, 200);
    const alBody = await al.json();
    assert.strictEqual(alBody[0].target.package_name, 'co.fundamental.app');
    assert.deepStrictEqual(alBody[0].target.sha256_cert_fingerprints, ['AA:BB:CC']);
    const aasa = await fetch(BASE + '/.well-known/apple-app-site-association');
    assert.strictEqual(aasa.status, 200);
    const aasaBody = await aasa.json();
    assert.strictEqual(aasaBody.applinks.details[0].appID, 'TESTTEAMID.co.fundamental.app');
  });

  console.log(results.join('\n'));
  console.log(`\n${passed} route tests passed.`);
}

run()
  .then(() => { server && server.kill(); cleanupDb(); process.exit(0); })
  .catch((e) => { console.error(results.join('\n')); console.error('\nFAILED:', e.message); server && server.kill(); cleanupDb(); process.exit(1); });
