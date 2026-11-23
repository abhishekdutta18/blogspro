/**
 * Free-tier providers that replace Gemini (Cloudflare Workers AI; GitHub Models was retired in Jul 2026) and the
 * AI_DISABLED_PROVIDERS switch that takes a provider family out of the fleet.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  askAI, ResourceManager, filterDisabledProviders, generateCloudflareContent, generateGroqContent,
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
