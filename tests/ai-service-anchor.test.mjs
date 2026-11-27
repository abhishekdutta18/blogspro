/**
 * The emergency anchor askAI dials after every recovery cycle failed. It must come from the live pool, so a
 * provider removed by AI_DISABLED_PROVIDERS (or never configured) is never dialled, and a node that failed
 * terminally this run (402, revoked key) is skipped. Regression: the anchor used to hard-code Cerebras, which
 * 402s, so the last resort could never succeed (daily/weekly pulse, 21-23 Nov 2026).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickAnchorNode, filterDisabledProviders } from '../scripts/lib/ai-service.js';

const node = (name) => ({ name, fn: async () => name });
const FULL_POOL = ['Groq', 'Cerebras', 'Sarvam', 'Cloudflare-Workers-AI'].map(node);

test('pickAnchorNode never returns a provider removed by AI_DISABLED_PROVIDERS', () => {
  const pool = filterDisabledProviders(FULL_POOL, 'gemini,cerebras');
  assert.equal(pickAnchorNode(pool)?.name, 'Sarvam');
});

test('pickAnchorNode skips nodes that failed terminally this run', () => {
  assert.equal(pickAnchorNode(FULL_POOL, new Set(['Sarvam']))?.name, 'Cerebras');
});

test('pickAnchorNode prefers Vertex 405B when it is pooled', () => {
  assert.equal(pickAnchorNode([...FULL_POOL, node('Vertex-Llama-405B')])?.name, 'Vertex-Llama-405B');
});

test('pickAnchorNode returns null when no anchor-capable node is usable', () => {
  assert.equal(pickAnchorNode([node('Groq'), node('Cloudflare-Workers-AI')]), null);
  assert.equal(pickAnchorNode(FULL_POOL, new Set(['Sarvam', 'Cerebras'])), null);
  assert.equal(pickAnchorNode([]), null);
});
