/**
 * Regression tests for how the AI fleet classifies provider errors.
 * Dead keys, unpaid plans and retired models never recover within a run, so the node must be
 * blacklisted on the first failure instead of being retried as a "temporary" error.
 * The messages below are the real bodies the providers returned on blogspro-ai-vps (2026-11-20).
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ResourceManager, isTerminalProviderError, generateInstitutionalBridgeContent } from '../scripts/lib/ai-service.js';

const TERMINAL_MESSAGES = [
  'Bridge Error: 500 - The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.',
  '402 Payment required to access this resource. Visit your billing tab.',
  '404 Model zai-glm-4.7 is archived and unavailable for the organization.',
  'OpenRouter Error: 401 - {"error":{"message":"User not found.","code":401}}',
  'GCS Upload Failed: The billing account for the owning project is disabled in state closed',
];
const TEMPORARY_MESSAGES = ['Bridge Error: 500', 'fetch failed', 'Bridge Error: 503 - upstream timeout'];

beforeEach(() => {
  ResourceManager.failed.clear();
  ResourceManager.failedAt.clear();
  ResourceManager.cooldowns.clear();
  ResourceManager.inflight.clear();
});

for (const message of TERMINAL_MESSAGES) {
  test(`terminal: ${message.slice(0, 60)}`, () => {
    assert.equal(isTerminalProviderError(message), true);
    ResourceManager.markFailure('Node-A', message);
    assert.ok(ResourceManager.failed.has('Node-A'), 'node should be blacklisted after one terminal failure');
  });
}

for (const message of TEMPORARY_MESSAGES) {
  test(`temporary: ${message}`, () => {
    assert.equal(isTerminalProviderError(message), false);
    ResourceManager.markFailure('Node-B', message);
    assert.equal(ResourceManager.failed.has('Node-B'), false);
  });
}

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test('bridge errors carry the upstream error text so they can be classified', async () => {
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: 'The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.' }),
    { status: 500, headers: { 'Content-Type': 'application/json' } },
  );
  await assert.rejects(
    generateInstitutionalBridgeContent('hi', 'llama-3.3-70b-versatile', { SWARM_AI_BRIDGE: 'https://bridge.test' }),
    (err) => err.message.startsWith('Bridge Error: 500') && isTerminalProviderError(err.message),
  );
});

test('revaluateFleet keeps recently blacklisted dead nodes out, but heals old ones', () => {
  ResourceManager.markFailure('Dead-Key', 'Invalid API Key');
  ResourceManager.failed.add('Stale');
  ResourceManager.failedAt.set('Stale', Date.now() - 2 * 60 * 60 * 1000);
  ResourceManager.revaluateFleet();
  assert.ok(ResourceManager.failed.has('Dead-Key'), 'a key that just failed must stay blacklisted');
  assert.equal(ResourceManager.failed.has('Stale'), false, 'an old blacklist entry is given another chance');
});
