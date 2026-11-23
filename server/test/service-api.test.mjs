import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

const TOKEN = 'svc_'.padEnd(48, 'x');
const servers = [];

async function start(env) {
  const config = loadConfig({ DB_PATH: ':memory:', SITE_ORIGIN: 'http://localhost:4321', INSECURE_COOKIES: '1', ...env });
  const server = createServer(createApp(config).handle);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

let base;
before(async () => { base = await start({ SERVICE_TOKEN: TOKEN }); });
after(() => servers.forEach(server => server.close()));

/** Server-to-server call: bearer token, no Origin header, no cookies. */
function call(path, { method = 'GET', body, token = TOKEN } = {}) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

test('the service API is off when SERVICE_TOKEN is unset or too short', async () => {
  for (const env of [{}, { SERVICE_TOKEN: 'short' }]) {
    const offBase = await start(env);
    const res = await fetch(`${offBase}/api/service/data/posts`, { headers: { authorization: 'Bearer short' } });
    assert.equal(res.status, 404);
  }
});

test('a missing or wrong token is refused', async () => {
  assert.equal((await call('/api/service/data/posts', { token: null })).status, 401);
  assert.equal((await call('/api/service/data/posts', { token: `${TOKEN}y` })).status, 401);
});

test('writes work without an Origin header and merge like Firestore set+merge', async () => {
  const created = await call('/api/service/data/swarm_fragments', { method: 'POST', body: { topic: 'liquidity', score: 3 } });
  assert.equal(created.status, 201);
  const { id } = await created.json();

  const put = await call('/api/service/data/posts/rtgs', { method: 'PUT', body: { title: 'RTGS', published: true } });
  assert.equal(put.status, 200);
  const merged = await (await call('/api/service/data/posts/rtgs', { method: 'PUT', body: { views: 5 } })).json();
  assert.equal(merged.title, 'RTGS');
  assert.equal(merged.views, 5);

  const fragment = await (await call(`/api/service/data/swarm_fragments/${id}`)).json();
  assert.equal(fragment.topic, 'liquidity');
});

test('lists filter with where, sort with orderBy and cap with limit', async () => {
  for (const [email, status, n] of [['a@x.io', 'active', 1], ['b@x.io', 'unsubscribed', 2], ['c@x.io', 'active', 3]]) {
    await call(`/api/service/data/subscribers/${email}`, { method: 'PUT', body: { email, status, n } });
  }
  const active = await (await call('/api/service/data/subscribers?where=status:active&orderBy=n%20desc')).json();
  assert.deepEqual(active.map(s => s.email), ['c@x.io', 'a@x.io']);
  const one = await (await call('/api/service/data/subscribers?where=status:active&limit=1&orderBy=n')).json();
  assert.deepEqual(one.map(s => s.email), ['a@x.io']);
  const published = await (await call('/api/service/data/posts?where=published:true')).json();
  assert.ok(published.every(p => p.published === true));
  assert.equal((await call('/api/service/data/posts?where=nocolon')).status, 400);
});

test('delete removes the document and reports a missing one', async () => {
  await call('/api/service/data/telemetry_logs/t1', { method: 'PUT', body: { ok: true } });
  assert.equal((await call('/api/service/data/telemetry_logs/t1', { method: 'DELETE' })).status, 200);
  assert.equal((await call('/api/service/data/telemetry_logs/t1')).status, 404);
  assert.equal((await call('/api/service/data/telemetry_logs/t1', { method: 'DELETE' })).status, 404);
});

test('account collections are out of reach and paths are validated', async () => {
  assert.equal((await call('/api/service/data/users')).status, 404);
  assert.equal((await call('/api/service/data/sessions/x', { method: 'PUT', body: {} })).status, 404);
  assert.equal((await call('/api/service/data/posts/a/b')).status, 404);
  assert.equal((await call('/api/service/other')).status, 404);
});

test('the service token grants nothing on the cookie routes', async () => {
  const res = await call('/api/data/posts');
  assert.equal(res.status, 401);
});

test('repeated bad tokens are rate limited per address', async () => {
  const limitedBase = await start({ SERVICE_TOKEN: TOKEN });
  const codes = [];
  for (let i = 0; i < 22; i += 1) {
    const res = await fetch(`${limitedBase}/api/service/data/posts`, { headers: { authorization: 'Bearer wrong' } });
    codes.push(res.status);
  }
  assert.equal(codes.at(-1), 429);
  // A valid token still works for the same address.
  const ok = await fetch(`${limitedBase}/api/service/data/posts`, { headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal(ok.status, 200);
});
