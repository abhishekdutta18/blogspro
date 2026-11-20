import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const TOKEN = 'swarm-token-123';
const ENV = { SWARM_PROXY_TOKEN: TOKEN, GROQ_API_KEY: 'gsk-real-groq-key' };
const CHAT = { model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'hi' }] };

const realFetch = globalThis.fetch;
let upstreamCalls;
let upstreamReply;

beforeEach(() => {
  upstreamCalls = [];
  upstreamReply = () => new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), {
    status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'session=abc', 'x-request-id': 'r1' }
  });
  globalThis.fetch = async (url, init) => {
    upstreamCalls.push({ url, init });
    return upstreamReply();
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const call = (path, { method = 'POST', token = TOKEN, body = CHAT, env = ENV } = {}) => worker.fetch(
  new Request(`https://proxy.test${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  }),
  env
);

test('refuses everything when SWARM_PROXY_TOKEN is not set (fail closed)', async () => {
  const res = await call('/v1/groq/chat/completions', { env: { GROQ_API_KEY: 'k' } });
  assert.equal(res.status, 503);
  assert.equal(upstreamCalls.length, 0);
});

test('rejects a missing or wrong token without calling upstream', async () => {
  assert.equal((await call('/v1/groq/chat/completions', { token: null })).status, 401);
  assert.equal((await call('/v1/groq/chat/completions', { token: 'swarm-token-124' })).status, 401);
  assert.equal(upstreamCalls.length, 0);
});

test('forwards a chat call upstream with the provider key, never the swarm token', async () => {
  const res = await call('/v1/groq/chat/completions');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).choices[0].message.content, 'OK');
  assert.equal(upstreamCalls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(upstreamCalls[0].init.headers.Authorization, 'Bearer gsk-real-groq-key');
  assert.deepEqual(JSON.parse(upstreamCalls[0].init.body), CHAT);
});

test('passes upstream error statuses through so the swarm fallback still works', async () => {
  for (const status of [401, 402, 429, 503]) {
    upstreamReply = () => new Response('{"error":"x"}', { status, headers: { 'Content-Type': 'application/json' } });
    assert.equal((await call('/v1/groq/chat/completions')).status, status);
  }
});

test('drops upstream headers such as cookies and request ids', async () => {
  const res = await call('/v1/groq/chat/completions');
  assert.equal(res.headers.get('Set-Cookie'), null);
  assert.equal(res.headers.get('x-request-id'), null);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('answers 401 for a provider with no key on the proxy, so the fleet skips it', async () => {
  const res = await call('/v1/sambanova/chat/completions');
  assert.equal(res.status, 401);
  assert.match((await res.json()).error, /No key is set for sambanova/);
  assert.equal(upstreamCalls.length, 0);
});

test('lists configured providers by name only, never key values', async () => {
  const res = await call('/v1/providers', { method: 'GET' });
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(text).filter(p => p.configured).map(p => p.name), ['groq']);
  assert.doesNotMatch(text, /gsk-real-groq-key/);
});

test('rejects unknown providers, wrong methods, streaming, bad JSON and oversized bodies', async () => {
  assert.equal((await call('/v1/gemini/chat/completions')).status, 404);
  assert.equal((await call('/v1/groq/chat/completions', { method: 'GET' })).status, 405);
  assert.equal((await call('/v1/groq/chat/completions', { body: { ...CHAT, stream: true } })).status, 400);
  assert.equal((await call('/v1/groq/chat/completions', { body: '{not json' })).status, 400);
  assert.equal((await call('/v1/groq/chat/completions', { body: { messages: [] } })).status, 400);
  const huge = { ...CHAT, messages: [{ role: 'user', content: 'x'.repeat(300 * 1024) }] };
  assert.equal((await call('/v1/groq/chat/completions', { body: huge })).status, 413);
  assert.equal((await call('/vault')).status, 404);
  assert.equal(upstreamCalls.length, 0);
});

test('lists model ids for a provider using its key, and nothing else from the payload', async () => {
  upstreamReply = () => new Response(JSON.stringify({ data: [{ id: 'b-model', owned_by: 'x' }, { id: 'a-model' }, { nope: 1 }] }), { status: 200 });
  const res = await call('/v1/groq/models', { method: 'GET' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), ['a-model', 'b-model']);
  assert.equal(upstreamCalls[0].url, 'https://api.groq.com/openai/v1/models');
  assert.equal(upstreamCalls[0].init.headers.Authorization, 'Bearer gsk-real-groq-key');
  assert.equal((await call('/v1/groq/models')).status, 405);
  assert.equal((await call('/v1/sambanova/models', { method: 'GET' })).status, 401);
  assert.equal((await call('/v1/groq/models', { method: 'GET', token: 'wrong' })).status, 401);
});

test('reports 502 when the provider cannot be reached', async () => {
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  assert.equal((await call('/v1/groq/chat/completions')).status, 502);
});
