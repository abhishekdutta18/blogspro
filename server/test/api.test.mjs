import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

const ORIGIN = 'http://localhost:4321';
const ADMIN = 'boss@example.com';
let base;
let server;
let app;

/** Fake Google: any code yields a verified ID token for the email encoded in the code. */
const fakeGoogle = async (url, init) => {
  const email = new URLSearchParams(init.body.toString()).get('code');
  const claims = { iss: 'https://accounts.google.com', aud: 'gid', sub: `sub-${email}`, email, email_verified: true, exp: 9999999999 };
  const idToken = `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
  return { ok: true, status: 200, json: async () => ({ id_token: idToken }) };
};

before(async () => {
  const config = loadConfig({
    DB_PATH: ':memory:', SITE_ORIGIN: ORIGIN, INSECURE_COOKIES: '1', ADMIN_EMAILS: ADMIN,
    GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret'
  });
  app = createApp(config, { fetchImpl: fakeGoogle });
  server = createServer(app.handle);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

/** Minimal browser: keeps cookies, sends the site Origin on writes. */
function client() {
  const jar = new Map();
  const store = res => (res.headers.getSetCookie?.() || []).forEach(c => {
    const [pair, ...attrs] = c.split(';');
    const [name, value] = pair.split('=');
    if (attrs.some(a => a.trim() === 'Max-Age=0')) jar.delete(name); else jar.set(name, value);
  });
  return {
    jar,
    async call(method, path, body, { origin = ORIGIN } = {}) {
      const headers = { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
      if (origin) headers.Origin = origin;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
      store(res);
      const text = await res.text();
      return { status: res.status, location: res.headers.get('location'), body: text ? JSON.parse(text) : null };
    }
  };
}

async function googleSignIn(browser, email) {
  const start = await browser.call('GET', '/auth/login/google');
  const state = new URL(start.location).searchParams.get('state');
  return browser.call('GET', `/auth/callback/google?code=${encodeURIComponent(email)}&state=${state}`);
}

test('registration always creates a reader and records the requested role', async () => {
  const browser = client();
  const res = await browser.call('POST', '/auth/register', { name: 'Ann', email: 'ann@example.com', password: 'longenough1', role: 'editor', requestedRole: 'admin' });
  assert.equal(res.status, 200);
  assert.equal(res.body.role, 'reader');
  assert.equal(res.body.user.requestedRole, 'editor');
  assert.equal((await browser.call('GET', '/auth/me')).body.user.email, 'ann@example.com');
});

test('a password account on an admin address is NOT admin (address unverified)', async () => {
  const res = await client().call('POST', '/auth/register', { name: 'Imposter', email: 'other-admin@example.com', password: 'longenough1', role: 'admin' });
  assert.equal(res.body.role, 'reader');
});

test('names carrying markup are rejected (admin panel renders them as HTML)', async () => {
  const res = await client().call('POST', '/auth/register', { name: '<img src=x onerror=alert(1)>', email: 'x@example.com', password: 'longenough1' });
  assert.equal(res.status, 400);
});

test('login: wrong password and unknown email look the same; right password works', async () => {
  const browser = client();
  await browser.call('POST', '/auth/register', { name: 'Lee', email: 'lee@example.com', password: 'correct-horse' });
  assert.equal((await client().call('POST', '/auth/login', { email: 'lee@example.com', password: 'nope-nope' })).body.error, 'INVALID_LOGIN_CREDENTIALS');
  assert.equal((await client().call('POST', '/auth/login', { email: 'nobody@example.com', password: 'nope-nope' })).body.error, 'INVALID_LOGIN_CREDENTIALS');
  assert.equal((await client().call('POST', '/auth/login', { email: 'LEE@example.com', password: 'correct-horse' })).status, 200);
});

test('state-changing requests from another site are refused (CSRF)', async () => {
  const res = await client().call('POST', '/auth/login', { email: 'a@b.co', password: 'whatever1' }, { origin: 'https://evil.example' });
  assert.equal(res.status, 403);
  assert.equal((await client().call('POST', '/api/subscribe', { email: 'a@b.co' }, { origin: null })).status, 403);
});

test('readers: own profile only, cannot change own role or email, no admin data', async () => {
  const browser = client();
  const { body } = await browser.call('POST', '/auth/register', { name: 'Rae', email: 'rae@example.com', password: 'longenough1' });
  const id = body.user.id;
  assert.equal((await browser.call('GET', `/api/data/users/${id}`)).status, 200);
  assert.equal((await browser.call('GET', '/api/data/users')).status, 403);
  assert.equal((await browser.call('GET', '/api/data/subscribers')).status, 403);
  assert.equal((await browser.call('GET', '/api/data/posts')).status, 403);
  assert.equal((await browser.call('PUT', `/api/data/users/${id}`, { role: 'admin' })).status, 400);
  assert.equal((await browser.call('PUT', `/api/data/users/${id}`, { email: 'new@example.com' })).status, 400);
  const renamed = await browser.call('PUT', `/api/data/users/${id}`, { name: 'Rae B', updatedAt: 'x' });
  assert.equal(renamed.body.name, 'Rae B');
  assert.equal(renamed.body.role, 'reader');
});

test('admin saving own profile with unchanged email and role works; changing them does not', async () => {
  const admin = client();
  await googleSignIn(admin, ADMIN);
  const me = (await admin.call('GET', '/auth/me')).body;
  assert.equal(me.profile.email, ADMIN);
  const save = await admin.call('PUT', `/api/data/users/${me.user.id}`, { name: 'Boss', bio: 'hi', photoURL: '', email: ADMIN, role: 'admin', updatedAt: 'now' });
  assert.equal(save.status, 200);
  assert.equal(save.body.name, 'Boss');
  assert.equal((await admin.call('PUT', `/api/data/users/${me.user.id}`, { role: 'reader' })).status, 400, 'no self-demotion lockout');
});

test('Google sign-in with a verified allow-listed email makes an admin session', async () => {
  const browser = client();
  const res = await googleSignIn(browser, ADMIN);
  assert.equal(res.status, 303);
  assert.equal(res.location, '/login.html');
  assert.equal((await browser.call('GET', '/auth/me')).body.user.role, 'admin');
});

test('OAuth callback rejects a forged or missing state', async () => {
  const browser = client();
  await browser.call('GET', '/auth/login/google');
  const res = await browser.call('GET', '/auth/callback/google?code=x@example.com&state=forged');
  assert.equal(res.location, '/login.html?error=oauth&reason=state');
  assert.equal((await browser.call('GET', '/auth/me')).body.authenticated, false);
});

test('pre-registered unverified account is taken back by the real owner via Google', async () => {
  const attacker = client();
  const email = 'victim@example.com';
  await attacker.call('POST', '/auth/register', { name: 'Fake', email, password: 'attacker-pass' });
  await googleSignIn(client(), email);
  assert.equal((await attacker.call('GET', '/auth/me')).body.authenticated, false, 'attacker session revoked');
  assert.equal((await client().call('POST', '/auth/login', { email, password: 'attacker-pass' })).status, 401, 'attacker password cleared');
});

test('admin manages posts; the public sees only published ones', async () => {
  const admin = client();
  await googleSignIn(admin, ADMIN);
  const draft = await admin.call('POST', '/api/data/posts', { title: 'Draft', published: false });
  const live = await admin.call('POST', '/api/data/posts', { title: 'Live', published: true, id: 'ignored' });
  assert.equal(draft.status, 201);
  assert.notEqual(live.body.id, 'ignored');
  const updated = await admin.call('PUT', `/api/data/posts/${draft.body.id}`, { subtitle: 'kept' });
  assert.equal(updated.body.title, 'Draft', 'merge keeps existing fields');

  const pub = await client().call('GET', '/api/public/data/posts');
  assert.deepEqual(pub.body.map(p => p.title), ['Live']);
  assert.equal((await client().call('GET', `/api/public/data/posts/${draft.body.id}`)).status, 404);
  assert.equal((await client().call('GET', '/api/public/data/users')).status, 404);
  assert.equal((await admin.call('DELETE', `/api/data/posts/${draft.body.id}`)).status, 200);
});

test('admin can change roles; unknown roles are refused', async () => {
  const admin = client();
  await googleSignIn(admin, ADMIN);
  const user = (await client().call('POST', '/auth/register', { name: 'Ed', email: 'ed@example.com', password: 'longenough1', role: 'editor' })).body.user;
  assert.equal((await admin.call('PUT', `/api/data/users/${user.id}`, { role: 'superuser' })).status, 400);
  const promoted = await admin.call('PUT', `/api/data/users/${user.id}`, { role: 'editor', requestedRole: null });
  assert.equal(promoted.body.role, 'editor');
  assert.equal(promoted.body.requestedRole, null);
});

test('newsletter signups are stored once, with no sign-in', async () => {
  const first = await client().call('POST', '/api/subscribe', { email: 'Reader@Example.com', source: 'blogspro.in' });
  const again = await client().call('POST', '/api/subscribe', { email: 'reader@example.com' });
  assert.deepEqual([first.body.alreadySubscribed, again.body.alreadySubscribed], [false, true]);
  assert.equal((await client().call('POST', '/api/subscribe', { email: 'not-an-email' })).status, 400);
});

test('pipeline actions answer 501 instead of pretending to work', async () => {
  const admin = client();
  await googleSignIn(admin, ADMIN);
  assert.equal((await admin.call('POST', '/api/data/swarm/dispatch', {})).status, 501);
});

test('logout ends the session server-side', async () => {
  const browser = client();
  await browser.call('POST', '/auth/register', { name: 'Out', email: 'out@example.com', password: 'longenough1' });
  const cookie = browser.jar.get('bp_sid');
  await browser.call('POST', '/auth/logout');
  const replay = await fetch(`${base}/auth/me`, { headers: { Cookie: `bp_sid=${cookie}` } }).then(r => r.json());
  assert.equal(replay.authenticated, false);
});

test('password change signs out other devices', async () => {
  const laptop = client();
  await laptop.call('POST', '/auth/register', { name: 'Pat', email: 'pat@example.com', password: 'first-pass' });
  const phone = client();
  await phone.call('POST', '/auth/login', { email: 'pat@example.com', password: 'first-pass' });
  assert.equal((await laptop.call('POST', '/auth/password', { password: 'second-pass' })).status, 200);
  assert.equal((await phone.call('GET', '/auth/me')).body.authenticated, false);
  assert.equal((await laptop.call('GET', '/auth/me')).body.authenticated, true);
});

test('login is rate limited per address and email', async () => {
  const statuses = [];
  for (let i = 0; i < 11; i += 1) {
    statuses.push((await client().call('POST', '/auth/login', { email: 'brute@example.com', password: 'guess-guess' })).status);
  }
  assert.equal(statuses.at(-1), 429);
});
