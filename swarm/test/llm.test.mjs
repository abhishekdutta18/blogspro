import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chat, LlmError } from '../src/llm/client.js';
import { createFleet, FleetExhaustedError } from '../src/llm/fleet.js';
import { resolveProviders } from '../src/llm/providers.js';
import { loadConfig, ConfigError } from '../src/config.js';
import { completion, jsonResponse, provider, fakeFetch } from './helpers.mjs';

const MESSAGES = [{ role: 'user', content: 'hi' }];
const noSleep = async () => {};

test('chat returns the completion text with provider and model', async () => {
  const { impl, calls } = fakeFetch({ 'a.test': () => completion('hello') });
  const result = await chat(provider('a'), MESSAGES, { timeoutMs: 1000, fetchImpl: impl });
  assert.deepEqual(result, { text: 'hello', provider: 'a', model: 'a-model' });
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-key');
  assert.equal(JSON.parse(calls[0].init.body).model, 'a-model');
});

test('chat classifies HTTP failures by status', async () => {
  const cases = [[401, 'auth'], [403, 'auth'], [402, 'billing'], [404, 'model_unavailable'], [429, 'rate_limit'], [503, 'server'], [400, 'bad_request']];
  for (const [status, kind] of cases) {
    const { impl } = fakeFetch({ 'a.test': () => jsonResponse(status, { error: 'x' }) });
    await assert.rejects(chat(provider('a'), MESSAGES, { timeoutMs: 1000, fetchImpl: impl }),
      error => error instanceof LlmError && error.kind === kind && error.status === status);
  }
});

test('chat rejects an empty completion as bad_response', async () => {
  const { impl } = fakeFetch({ 'a.test': () => completion('   ') });
  await assert.rejects(chat(provider('a'), MESSAGES, { timeoutMs: 1000, fetchImpl: impl }), { kind: 'bad_response' });
});

test('chat reports a timeout when the request is aborted', async () => {
  const hang = (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  const { impl } = fakeFetch({ 'a.test': hang });
  await assert.rejects(chat(provider('a'), MESSAGES, { timeoutMs: 20, fetchImpl: impl }), { kind: 'timeout' });
});

test('fleet falls through to the next provider on failure', async () => {
  const { impl, calls } = fakeFetch({ 'a.test': () => jsonResponse(429, {}), 'b.test': () => completion('from b') });
  const fleet = createFleet({ providers: [provider('a'), provider('b')], timeoutMs: 1000, pauseMs: 1, fetchImpl: impl, sleep: noSleep });
  const result = await fleet.complete(MESSAGES);
  assert.equal(result.provider, 'b');
  assert.deepEqual(calls.map(c => c.host), ['a.test', 'b.test']);
});

test('fleet skips a provider for the rest of the run once its key is rejected', async () => {
  const { impl, calls } = fakeFetch({ 'a.test': () => jsonResponse(401, {}), 'b.test': () => completion('ok') });
  const fleet = createFleet({ providers: [provider('a'), provider('b')], timeoutMs: 1000, pauseMs: 1, fetchImpl: impl, sleep: noSleep });
  await fleet.complete(MESSAGES);
  await fleet.complete(MESSAGES);
  assert.deepEqual(calls.map(c => c.host), ['a.test', 'b.test', 'b.test']);
});

test('fleet pauses once after a full failed round, then succeeds on the second round', async () => {
  const pauses = [];
  const { impl } = fakeFetch({ 'a.test': (_u, _i, n) => (n === 1 ? jsonResponse(503, {}) : completion('recovered')) });
  const fleet = createFleet({ providers: [provider('a')], timeoutMs: 1000, pauseMs: 65_000, fetchImpl: impl, sleep: async ms => pauses.push(ms) });
  const result = await fleet.complete(MESSAGES);
  assert.equal(result.text, 'recovered');
  assert.deepEqual(pauses, [65_000]);
});

test('fleet gives up after two rounds and lists every attempt', async () => {
  const { impl } = fakeFetch({ 'a.test': () => jsonResponse(503, {}), 'b.test': () => jsonResponse(429, {}) });
  const fleet = createFleet({ providers: [provider('a'), provider('b')], timeoutMs: 1000, pauseMs: 1, fetchImpl: impl, sleep: noSleep });
  await assert.rejects(fleet.complete(MESSAGES), error => error instanceof FleetExhaustedError && error.attempts.length === 4);
});

test('fleet does not pause or retry when every provider is rejected or out of credits', async () => {
  const pauses = [];
  const { impl, calls } = fakeFetch({ 'a.test': () => jsonResponse(401, {}), 'b.test': () => jsonResponse(402, {}), 'c.test': () => jsonResponse(404, {}) });
  const fleet = createFleet({ providers: [provider('a'), provider('b'), provider('c')], timeoutMs: 1000, pauseMs: 5, fetchImpl: impl, sleep: async ms => pauses.push(ms) });
  await assert.rejects(fleet.complete(MESSAGES), error => error instanceof FleetExhaustedError && /a:auth, b:billing, c:model_unavailable/.test(error.message));
  assert.deepEqual(pauses, []);
  assert.equal(calls.length, 3);
});

test('resolveProviders keeps only providers with keys, in order, with model overrides', () => {
  const env = { GROQ_API_KEY: 'g', SAMBANOVA_API_KEY: 's', SWARM_GROQ_MODEL: 'custom' };
  assert.deepEqual(resolveProviders(env).map(p => [p.name, p.model]), [['groq', 'custom'], ['sambanova', 'Meta-Llama-3.3-70B-Instruct']]);
  assert.deepEqual(resolveProviders({ ...env, SWARM_PROVIDER_ORDER: 'groq,sambanova' }).map(p => p.name), ['groq', 'sambanova']);
  assert.throws(() => resolveProviders({ SWARM_PROVIDER_ORDER: 'gemini' }), /unknown providers: gemini/);
});

test('proxy mode routes every provider through the proxy with the swarm token', () => {
  const env = { SWARM_PROXY_URL: 'https://blogspro-ai-proxy.example.workers.dev/', SWARM_PROXY_TOKEN: 'tok', GROQ_API_KEY: 'ignored' };
  const providers = resolveProviders(env);
  assert.deepEqual(providers.map(p => p.baseUrl), [
    'https://blogspro-ai-proxy.example.workers.dev/v1/groq',
    'https://blogspro-ai-proxy.example.workers.dev/v1/openrouter',
    'https://blogspro-ai-proxy.example.workers.dev/v1/mistral',
    'https://blogspro-ai-proxy.example.workers.dev/v1/sambanova'
  ]);
  assert.ok(providers.every(p => p.apiKey === 'tok' && p.viaProxy));
});

test('proxy mode refuses a missing token and a non-https URL', () => {
  assert.throws(() => loadConfig({ SWARM_PROXY_URL: 'https://p.test' }), ConfigError);
  assert.throws(() => loadConfig({ SWARM_PROXY_URL: 'http://p.test', SWARM_PROXY_TOKEN: 't' }), /must use https/);
  assert.equal(resolveProviders({ SWARM_PROXY_URL: 'http://localhost:8787', SWARM_PROXY_TOKEN: 't' })[0].baseUrl, 'http://localhost:8787/v1/groq');
  assert.throws(() => loadConfig({ GROQ_API_KEY: 'g', SWARM_PROVIDER_ORDER: 'cerebras' }), ConfigError);
});

test('loadConfig fails fast without any provider key, and on bad numbers', () => {
  assert.throws(() => loadConfig({}), ConfigError);
  assert.throws(() => loadConfig({ CEREBRAS_API_KEY: 'c' }), ConfigError, 'Cerebras was dropped; its key alone is not enough');
  assert.throws(() => loadConfig({ GROQ_API_KEY: 'g', SWARM_MIN_HEADLINES: 'zero' }), ConfigError);
  const config = loadConfig({ GROQ_API_KEY: 'g', SWARM_DB_PATH: '/tmp/x.db' });
  assert.equal(config.dbPath, '/tmp/x.db');
  assert.equal(config.fleetPauseMs, 65_000);
});
