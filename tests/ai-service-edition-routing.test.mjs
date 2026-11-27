/**
 * Routing rules the market editions depend on (evidence: editions of 26 Nov 2026 on the pipeline VPS).
 * - Groq was offered a web-search tool on every call, so JSON section calls came back as tool-call markup
 *   (Qwen) or as an exhausted tool loop with no content (gpt-oss). JSON calls get no tools.
 * - A reply that is only tool-call markup is a failed node: askAI moves to another provider instead of
 *   handing the markup to the writer, where it burned one of the section's two attempts.
 * - Groq's free Qwen model allows 1,000 output tokens per minute and rejects any longer request outright,
 *   so a node with an output cap is skipped for calls that expect more.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  askAI, ResourceManager, generateGroqContent, stripToolCallMarkup, GROQ_QWEN_MAX_OUTPUT_TOKENS,
} from '../scripts/lib/ai-service.js';

const REPLY = '{"title":"Markets steady","summary":"Rates steady, liquidity tight, credit spreads widening."}';
const TOOL_MARKUP = '<tool_call> <function=search_web> <parameter=query> US stock market S&P 500 close '
  + 'November 25 2026 </parameter> </function> </tool_call> <tool_call> <function=search_web> '
  + '<parameter=query> Nifty close </parameter> </function> </tool_call>';

const realFetch = globalThis.fetch;
let requests = [];

beforeEach(() => {
  requests = [];
  ResourceManager.failed.clear();
  ResourceManager.failedAt.clear();
  ResourceManager.cooldowns.clear();
  ResourceManager.quotaCooldowns.clear();
  ResourceManager.inflight.clear();
});
afterEach(() => { globalThis.fetch = realFetch; });

function stubGroq() {
  globalThis.fetch = async (url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: REPLY } }] }), { status: 200 });
  };
}

test('Groq gets no tools for a JSON call, and keeps them for free-text research', async () => {
  stubGroq();
  await generateGroqContent('Reply with JSON only.', undefined, { GROQ_API_KEY: 'gsk_test', responseFormat: 'json' });
  assert.equal(requests[0].tools, undefined, 'a JSON section must be written from the prompt, not web searches');
  assert.equal(requests[0].tool_choice, undefined);
  await generateGroqContent('Research this.', undefined, { GROQ_API_KEY: 'gsk_test' });
  assert.ok(Array.isArray(requests[1].tools), 'free-text calls still may search');
});

test('stripToolCallMarkup removes tool-call blocks and keeps any real answer', () => {
  assert.equal(stripToolCallMarkup(TOOL_MARKUP), '');
  assert.equal(stripToolCallMarkup(`${TOOL_MARKUP}\n${REPLY}`), REPLY);
  assert.equal(stripToolCallMarkup(REPLY), REPLY, 'ordinary replies are untouched');
  assert.equal(stripToolCallMarkup('<function=web_search>{"q":"x"}</function>'), '');
});

test('a reply that is only tool-call markup fails that node and askAI moves on to another provider', async () => {
  const served = [];
  ResourceManager.pool = [
    { name: 'Qwen', tier: 0, roles: ['generate'], match: /x/, fn: async () => { served.push('Qwen'); return TOOL_MARKUP; } },
    { name: 'Sarvam', tier: 1, roles: ['generate'], match: /x/, fn: async () => { served.push('Sarvam'); return REPLY; } },
  ];
  const out = await askAI('Reply with JSON only.', { role: 'generate', responseFormat: 'json' });
  assert.equal(out, REPLY);
  assert.deepEqual(served, ['Qwen', 'Sarvam']);
  assert.equal(ResourceManager.failed.has('Qwen'), false, 'markup is a bad reply, not a dead key');
});

test('tool-call markup around a real answer is stripped, not treated as a failure', async () => {
  ResourceManager.pool = [{ name: 'Qwen', tier: 0, roles: ['generate'], match: /x/, fn: async () => `${TOOL_MARKUP}\n${REPLY}` }];
  assert.equal(await askAI('Reply with JSON only.', { role: 'generate' }), REPLY);
});

test('a node whose output cap is below the expected reply is skipped; short calls may still use it', () => {
  ResourceManager.pool = [
    { name: 'Groq-Qwen', maxOutputTokens: 1000, tier: 0, roles: ['generate'], match: /x/, fn: async () => REPLY },
    { name: 'Sarvam', tier: 1, roles: ['generate'], match: /x/, fn: async () => REPLY },
  ];
  assert.equal(ResourceManager.getAvailable(0, null, { role: 'generate', outputTokens: 2200 }).name, 'Sarvam');
  assert.equal(ResourceManager.getAvailable(0, null, { role: 'generate', outputTokens: 600 }).name, 'Groq-Qwen');
  assert.equal(ResourceManager.getAvailable(0, null, { role: 'generate' }).name, 'Groq-Qwen', 'no estimate: no filter');
});

test('askAI routes a long section past an output-capped node without calling it', async () => {
  const served = [];
  ResourceManager.pool = [
    { name: 'Groq-Qwen', maxOutputTokens: 1000, tier: 0, roles: ['generate'], match: /x/, fn: async () => { served.push('Qwen'); return REPLY; } },
    { name: 'Groq', tier: 1, roles: ['generate'], match: /x/, fn: async () => { served.push('Groq'); return REPLY; } },
  ];
  await askAI('Write the overview.', { role: 'generate', outputTokens: 2200 });
  assert.deepEqual(served, ['Groq']);
});

test('the Groq Qwen node is capped at the free tier\'s 1,000 output tokens per minute', () => {
  assert.equal(GROQ_QWEN_MAX_OUTPUT_TOKENS, 1000);
});
