/**
 * Low-cost providers that replace Gemini (Cloudflare Workers AI, Sarvam; GitHub Models was retired in Jul 2026) and the
 * AI_DISABLED_PROVIDERS switch that takes a provider family out of the fleet.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  askAI, ResourceManager, filterDisabledProviders, generateCloudflareContent, generateGroqContent, generateSarvamContent,
  isTerminalProviderError,
} from '../scripts/lib/ai-service.js';

const realFetch = globalThis.fetch;
let lastRequest;

function stubFetch(body, status = 200) {
  globalThis.fetch = async (url, init) => {
    lastRequest = { url: String(url), init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
}
const OPENAI_SHAPE = { choices: [{ message: { content: 'Rates steady.' } }] };

afterEach(() => { globalThis.fetch = realFetch; });

test('Cloudflare Workers AI works with the global API key and an OpenAI-shaped result', async () => {
  stubFetch({ success: true, result: OPENAI_SHAPE });
  const out = await generateCloudflareContent('hi', undefined, {
    CLOUDFLARE_ACCOUNT_ID: 'acct', CLOUDFLARE_EMAIL: 'ops@example.com', CLOUDFLARE_API_KEY: 'global-key',
  });
  assert.equal(out, 'Rates steady.');
  assert.match(lastRequest.url, /accounts\/acct\/ai\/run\/@cf\/meta\/llama-3\.3-70b/);
  assert.equal(lastRequest.init.headers['X-Auth-Email'], 'ops@example.com');
  assert.equal(lastRequest.init.headers['X-Auth-Key'], 'global-key');
  assert.ok(lastRequest.body.max_tokens >= 2048, 'Workers AI defaults to 256 tokens, far too short for a briefing');
});

test('Cloudflare Workers AI still accepts a scoped API token and the legacy result shape', async () => {
  stubFetch({ success: true, result: { response: 'Legacy shape.' } });
  const out = await generateCloudflareContent('hi', undefined, { CF_ACCOUNT_ID: 'acct', CF_API_TOKEN: 'scoped' });
  assert.equal(out, 'Legacy shape.');
  assert.equal(lastRequest.init.headers.Authorization, 'Bearer scoped');
});

test('AI_DISABLED_PROVIDERS removes every node of a family', () => {
  const pool = ['Gemini-3.1-Pro', 'Vertex-Gemini-Flash', 'Groq', 'Cloudflare-Workers-AI'].map((name) => ({ name }));
  assert.deepEqual(filterDisabledProviders(pool, 'gemini').map((p) => p.name), ['Groq', 'Cloudflare-Workers-AI']);
  assert.deepEqual(filterDisabledProviders(pool, ' Gemini , cloudflare ').map((p) => p.name), ['Groq']);
  assert.equal(filterDisabledProviders(pool, '').length, 4);
});

beforeEach(() => {
  ResourceManager.failed.clear();
  ResourceManager.failedAt.clear();
  ResourceManager.cooldowns.clear();
  ResourceManager.inflight.clear();
});

test('askAI still runs when routing prefers a model no node serves (Gemini removed)', async () => {
  const reply = 'Institutional synthesis: rates steady, liquidity tight, credit spreads widening.';
  ResourceManager.pool = [{ name: 'Groq', tier: 1, roles: ['research'], match: /groq/, fn: async () => reply }];
  assert.equal(await askAI('Summarise.', { role: 'research' }), reply);
  assert.equal(await askAI('Summarise.', { role: 'research', model: 'node-editor' }), reply);
});

test('Groq defaults to a model the free tier serves and ignores retired ids', async () => {
  stubFetch(OPENAI_SHAPE);
  assert.equal(await generateGroqContent('hi', undefined, { GROQ_API_KEY: 'gsk_test' }), 'Rates steady.');
  assert.equal(lastRequest.body.model, 'openai/gpt-oss-120b');
  await generateGroqContent('hi', 'gemini-3.1-pro-preview', { GROQ_API_KEY: 'gsk_test' });
  assert.equal(lastRequest.body.model, 'openai/gpt-oss-120b');
});

test('Groq rate limits keep their status, so the node cools down instead of being blacklisted', async () => {
  stubFetch({ error: { message: 'Rate limit reached for model openai/gpt-oss-120b', code: 'rate_limit_exceeded' } }, 429);
  const err = await generateGroqContent('hi', undefined, { GROQ_API_KEY: 'gsk_test' }).catch((e) => e);
  assert.match(err.message, /429/);
  ResourceManager.markFailure('Groq', err.message);
  assert.equal(ResourceManager.failed.has('Groq'), false);
  assert.ok(ResourceManager.cooldowns.has('Groq'));
});

test('bridge pool keeps only routes to models the bridge serves', async () => {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) if (/API_KEY|_KEY$|TOKEN|GH_PAT|CLOUDFLARE|SAMBANOVA|CEREBRAS|GROQ|GEMINI|VAULT|BRIDGE|OPENROUTER|HF_/.test(k)) delete process.env[k];
  try {
    ResourceManager.pool = [];
    await ResourceManager.init({ SWARM_AI_BRIDGE: 'https://bridge.example' }, true);
    assert.deepEqual(ResourceManager.pool.map((n) => n.name).sort(), ['Groq-Bridge-20B-Proxy', 'Groq-Bridge-Proxy']);
  } finally {
    process.env = saved;
    ResourceManager.pool = [];
  }
});

test('Sarvam calls chat completions with the key, sarvam-105b, reasoning off and a long reply budget', async () => {
  stubFetch(OPENAI_SHAPE);
  assert.equal(await generateSarvamContent('hi', undefined, { SARVAM_API_KEY: 'sk_test' }), 'Rates steady.');
  assert.equal(lastRequest.url, 'https://api.sarvam.ai/v1/chat/completions');
  assert.equal(lastRequest.init.headers.Authorization, 'Bearer sk_test');
  assert.equal(lastRequest.init.headers['api-subscription-key'], 'sk_test');
  assert.equal(lastRequest.body.model, 'sarvam-105b');
  assert.equal(lastRequest.body.reasoning_effort, null, 'reasoning tokens are billed as output');
  assert.ok(lastRequest.body.max_tokens >= 4096, 'the API default of 2048 truncates edition sections');
});

test('Sarvam drops any think block from the reply', async () => {
  stubFetch({ choices: [{ message: { content: '<think>plan</think>\n{"ok":true}' } }] });
  assert.equal(await generateSarvamContent('hi', undefined, { SARVAM_API_KEY: 'sk_test' }), '{"ok":true}');
});

test('Sarvam: used-up credits are terminal even when sent as 429; real rate limits stay 429', async () => {
  stubFetch({ error: { message: 'Quota Exceeded', code: 'insufficient_quota_error' } }, 429);
  const quota = await generateSarvamContent('hi', undefined, { SARVAM_API_KEY: 'sk_test' }).catch((e) => e.message);
  assert.doesNotMatch(quota, /429/);
  assert.ok(isTerminalProviderError(quota), quota);

  stubFetch({ error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded_error' } }, 429);
  await assert.rejects(generateSarvamContent('hi', undefined, { SARVAM_API_KEY: 'sk_test' }), /Sarvam API Error: 429/);
  await assert.rejects(generateSarvamContent('hi', undefined, {}), /SARVAM_API_KEY missing/);
});

test('a Sarvam key adds a Sarvam node to the pool', async () => {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) if (/API_KEY|_KEY$|TOKEN|GH_PAT|CLOUDFLARE|SAMBANOVA|CEREBRAS|GROQ|GEMINI|VAULT|BRIDGE|OPENROUTER|HF_|SARVAM/.test(k)) delete process.env[k];
  try {
    ResourceManager.pool = [];
    await ResourceManager.init({ SARVAM_API_KEY: 'sk_test' }, true);
    const node = ResourceManager.pool.find((n) => n.name === 'Sarvam');
    assert.ok(node, 'Sarvam node registered');
    assert.ok(['research', 'generate', 'edit'].every((r) => node.roles.includes(r)));
  } finally {
    process.env = saved;
    ResourceManager.pool = [];
  }
});

test('Sarvam asks for a JSON object only when the caller wants JSON', async () => {
  stubFetch({ choices: [{ message: { content: '{"ok":true}' } }] });
  await generateSarvamContent('Reply with JSON only.', undefined, { SARVAM_API_KEY: 'sk_test', responseFormat: 'json' });
  assert.deepEqual(lastRequest.body.response_format, { type: 'json_object' });
  await generateSarvamContent('hi', undefined, { SARVAM_API_KEY: 'sk_test' });
  assert.equal(lastRequest.body.response_format, undefined);
});

test('askAI hands responseFormat to the provider without touching the caller env', async () => {
  const seen = [];
  const reply = 'Institutional synthesis: rates steady, liquidity tight, credit spreads widening.';
  ResourceManager.pool = [{ name: 'Probe', tier: 1, roles: ['generate'], match: /probe/, fn: async (p, m, c) => { seen.push(c.responseFormat); return reply; } }];
  const env = { SOME_KEY: 'x' };
  await askAI('Reply with JSON only.', { role: 'generate', env, responseFormat: 'json' });
  await askAI('Plain text.', { role: 'generate', env });
  assert.deepEqual(seen, ['json', undefined]);
  assert.equal(env.responseFormat, undefined);
});
