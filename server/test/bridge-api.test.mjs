/**
 * Relay mode: the VPS has only the Google client id; the auth worker holds the secret,
 * owns the registered callback URL, and hands back a signed assertion via /auth/bridge.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { signAssertion } from '../src/bridge.js';

const ORIGIN = 'http://localhost:4321';
const WORKER = 'https://auth-worker.example.dev';
const SECRET = 'r'.repeat(48);
const ADMIN = 'boss@example.com';
let base;
let server;

before(async () => {
  const config = loadConfig({
    DB_PATH: ':memory:', SITE_ORIGIN: ORIGIN, INSECURE_COOKIES: '1', ADMIN_EMAILS: ADMIN,
    GOOGLE_CLIENT_ID: 'gid', OAUTH_BRIDGE_ORIGIN: `${WORKER}/`, OAUTH_BRIDGE_SECRET: SECRET
  });
  server = createServer(createApp(config, { fetchImpl: () => { throw new Error('VPS must not call Google in relay mode'); } }).handle);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

/** Cookie-keeping browser that does not follow redirects. */
function browser() {
  const jar = new Map();
  return async (path) => {
    const res = await fetch(base + path, { headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, redirect: 'manual' });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair, ...attrs] = cookie.split(';');
      const [name, value] = pair.split('=');
      if (attrs.some(a => a.trim() === 'Max-Age=0')) jar.delete(name); else jar.set(name, value);
    }
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location'), body: text.startsWith('{') ? JSON.parse(text) : null };
  };
}

async function startLogin(get) {
  const start = await get('/auth/login/google');
  return { start, state: new URL(start.location).searchParams.get('state') };
}

const assertion = (state, overrides = {}, now) =>
  signAssertion({ provider: 'google', email: ADMIN, name: 'Boss', verified: true, state, ...overrides }, SECRET, now);

test('login start sends Google back to the worker callback, not the site', async () => {
  const { start } = await startLogin(browser());
  const url = new URL(start.location);
  assert.equal(url.hostname, 'accounts.google.com');
  assert.equal(url.searchParams.get('redirect_uri'), `${WORKER}/auth/callback/google`);
  assert.equal(url.searchParams.get('client_id'), 'gid');
});

test('a valid assertion bound to this browser opens an admin session', async () => {
  const get = browser();
  const { state } = await startLogin(get);
  const done = await get(`/auth/bridge?a=${await assertion(state)}`);
  assert.equal(done.location, '/login.html');
  const me = await get('/auth/me');
  assert.equal(me.body.user.email, ADMIN);
  assert.equal(me.body.user.role, 'admin');
});

test('an assertion carried to another browser is refused (state binding)', async () => {
  const { state } = await startLogin(browser());
  const attacker = browser();
  await startLogin(attacker);
  const res = await attacker(`/auth/bridge?a=${await assertion(state)}`);
  assert.equal(res.location, '/login.html?error=oauth&reason=state');
});

// A refusal clears the state cookie, so each case needs its own login attempt.
async function bridgeOutcome(makeToken) {
  const get = browser();
  const { state } = await startLogin(get);
  return (await get(`/auth/bridge?a=${await makeToken(state)}`)).location;
}

test('forged, expired and unverified assertions are refused', async () => {
  const fail = reason => `/login.html?error=oauth&reason=${reason}`;
  assert.equal(await bridgeOutcome(state =>
    signAssertion({ provider: 'google', email: ADMIN, verified: true, state }, 'x'.repeat(48))), fail('exchange'));
  assert.equal(await bridgeOutcome(state => assertion(state, {}, Date.now() - 10 * 60 * 1000)), fail('exchange'));
  assert.equal(await bridgeOutcome(state => assertion(state, { verified: false })), fail('unverified'));
});

test('an assertion works once: the state cookie is spent on success', async () => {
  const get = browser();
  const { state } = await startLogin(get);
  const token = await assertion(state);
  assert.equal((await get(`/auth/bridge?a=${token}`)).location, '/login.html');
  assert.equal((await get(`/auth/bridge?a=${token}`)).location, '/login.html?error=oauth&reason=state');
});

test('the direct callback is closed in relay mode', async () => {
  const get = browser();
  const { state } = await startLogin(get);
  const res = await get(`/auth/callback/google?code=x&state=${state}`);
  assert.equal(res.location, '/login.html?error=oauth&reason=unavailable');
});
