/**
 * Free-tier providers that replace Gemini (GitHub Models, Cloudflare Workers AI) and the
 * AI_DISABLED_PROVIDERS switch that takes a provider family out of the fleet.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  askAI, ResourceManager, filterDisabledProviders, generateCloudflareContent, generateGitHubModelsContent,
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

test('GitHub Models calls the inference endpoint with the PAT', async () => {
  stubFetch(OPENAI_SHAPE);
  const out = await generateGitHubModelsContent('hi', undefined, { GH_PAT: 'ghp_test' });
  assert.equal(out, 'Rates steady.');
  assert.equal(lastRequest.url, 'https://models.github.ai/inference/chat/completions');
  assert.equal(lastRequest.init.headers.Authorization, 'Bearer ghp_test');
  assert.equal(lastRequest.body.model, 'openai/gpt-4.1-mini');
});

test('GitHub Models errors keep the status so dead tokens are blacklisted', async () => {
  stubFetch({ error: { message: 'Bad credentials' } }, 401);
  await assert.rejects(generateGitHubModelsContent('hi', undefined, { GH_PAT: 'bad' }), /401/);
});

test('AI_DISABLED_PROVIDERS removes every node of a family', () => {
  const pool = ['Gemini-3.1-Pro', 'Vertex-Gemini-Flash', 'GitHub-Models', 'Cloudflare-Workers-AI'].map((name) => ({ name }));
  assert.deepEqual(filterDisabledProviders(pool, 'gemini').map((p) => p.name), ['GitHub-Models', 'Cloudflare-Workers-AI']);
  assert.deepEqual(filterDisabledProviders(pool, ' Gemini , cloudflare ').map((p) => p.name), ['GitHub-Models']);
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
  ResourceManager.pool = [{ name: 'GitHub-Models', tier: 1, roles: ['research'], match: /github/, fn: async () => reply }];
  assert.equal(await askAI('Summarise.', { role: 'research' }), reply);
  assert.equal(await askAI('Summarise.', { role: 'research', model: 'node-editor' }), reply);
});
