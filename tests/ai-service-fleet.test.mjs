/**
 * Regression tests for the AI fleet's recovery loop in askAI.
 * When every provider keeps failing with a temporary error (5xx, bridge errors), askAI must give up
 * after a bounded number of recovery cycles instead of retrying until the process is killed.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { askAI, ResourceManager } from '../scripts/lib/ai-service.js';

const PROVIDER_COUNT = 5;
/** Generous bound: 4 attempts per recovery cycle, a handful of cycles. A runaway loop blows far past it. */
const MAX_EXPECTED_CALLS = 24;
/** After this many calls the fake starts succeeding, so a runaway loop resolves instead of hanging the suite. */
const RUNAWAY_ESCAPE_AFTER = 60;
const VALID_RESPONSE = 'Institutional synthesis: rates steady, liquidity tight, credit spreads widening.';

let calls = 0;

function failingProvider(index) {
  return {
    name: `Fake-${index}`,
    tier: 1,
    roles: ['generate'],
    match: /fake-model/,
    fn: async () => {
      calls += 1;
      if (calls > RUNAWAY_ESCAPE_AFTER) return VALID_RESPONSE;
      throw new Error('Bridge Error: 500');
    },
  };
}

beforeEach(() => {
  calls = 0;
  ResourceManager.pool = Array.from({ length: PROVIDER_COUNT }, (_, i) => failingProvider(i));
  ResourceManager.failed.clear();
  ResourceManager.failedAt.clear();
  ResourceManager.cooldowns.clear();
  ResourceManager.inflight.clear();
});

test('askAI gives up with FLEET_EXHAUSTION_PERMANENT when every provider keeps failing (swarm job)', async () => {
  await assert.rejects(
    askAI('Summarise the session.', { model: 'auto', jobId: 'swarm-hourly-test' }),
    /FLEET_EXHAUSTION_PERMANENT/,
  );
  assert.ok(calls <= MAX_EXPECTED_CALLS, `expected at most ${MAX_EXPECTED_CALLS} provider calls, got ${calls}`);
});

test('askAI gives up for non-swarm jobs too', async () => {
  await assert.rejects(
    askAI('Summarise the session.', { model: 'auto', jobId: 'manual-test' }),
    /FLEET_EXHAUSTION_PERMANENT/,
  );
  assert.ok(calls <= MAX_EXPECTED_CALLS, `expected at most ${MAX_EXPECTED_CALLS} provider calls, got ${calls}`);
});

test('askAI still recovers when a later provider succeeds', async () => {
  ResourceManager.pool[2].fn = async () => { calls += 1; return VALID_RESPONSE; };
  const out = await askAI('Summarise the session.', { model: 'auto', jobId: 'swarm-hourly-test' });
  assert.equal(out, VALID_RESPONSE);
});
