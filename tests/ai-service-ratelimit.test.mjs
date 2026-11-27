/**
 * Rate-limit handling in the AI balancer. Groq's free tier caps tokens per day per model and answers 429 with
 * "Please try again in 16m28.5s"; the direct Groq node and both Groq bridges draw on the same organization.
 * The balancer must honour the provider's own wait, bench every node that shares the exhausted quota, and keep
 * that knowledge through an emergency reset instead of hammering the same model every minute.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ResourceManager, parseRetryAfterMs, rateLimitCooldownMs } from '../scripts/lib/ai-service.js';

const TPD_ERROR = 'Groq API Error: 429 rate_limit_exceeded - Rate limit reached for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 199500, Requested 1800. Please try again in 16m28.5s. Need more tokens? Upgrade to Dev Tier today.';
const MINUTE = 60 * 1000;

const node = (name, quota) => ({ name, quota, tier: 1, roles: ['generate'], match: /x/, fn: async () => 'ok' });

beforeEach(() => {
  ResourceManager.pool = [
    node('Groq', 'groq:openai/gpt-oss-120b'),
    node('Groq-Bridge-Proxy', 'groq:openai/gpt-oss-120b'),
    node('Groq-Bridge-20B-Proxy', 'groq:openai/gpt-oss-20b'),
    node('Sarvam'),
  ];
  ResourceManager.failed.clear();
  ResourceManager.failedAt.clear();
  ResourceManager.cooldowns.clear();
  ResourceManager.quotaCooldowns.clear();
  ResourceManager.inflight.clear();
});

test('parseRetryAfterMs reads hours, minutes, seconds and milliseconds', () => {
  assert.equal(parseRetryAfterMs(TPD_ERROR), 16 * MINUTE + 28500);
  assert.equal(parseRetryAfterMs('Please try again in 1h2m3s.'), 3600000 + 2 * MINUTE + 3000);
  assert.equal(parseRetryAfterMs('try again in 2.302s'), 2302);
  assert.equal(parseRetryAfterMs('Please try again in 830ms'), 830);
  assert.equal(parseRetryAfterMs('Bridge Error: 500'), null);
  assert.equal(parseRetryAfterMs(undefined), null);
});

test('rateLimitCooldownMs follows the hint within bounds and defaults to a minute', () => {
  assert.equal(rateLimitCooldownMs(TPD_ERROR), 16 * MINUTE + 28500 + 1000, 'hint plus a one-second margin');
  assert.equal(rateLimitCooldownMs('429 rate_limit_exceeded'), MINUTE, 'no hint: the old one-minute pause');
  assert.equal(rateLimitCooldownMs('try again in 200ms'), 5000, 'floor');
  assert.equal(rateLimitCooldownMs('try again in 9h'), 60 * MINUTE, 'ceiling');
});

test('a daily-limit 429 benches every node on the same quota for the hinted time', () => {
  ResourceManager.markFailure('Groq', TPD_ERROR);
  const available = new Set();
  for (let seed = 0; seed < 8; seed++) available.add(ResourceManager.getAvailable(seed)?.name);
  assert.deepEqual([...available].sort(), ['Groq-Bridge-20B-Proxy', 'Sarvam'], 'the bridge on the same model is skipped too');
  const until = ResourceManager.quotaCooldowns.get('groq:openai/gpt-oss-120b');
  assert.ok(until - Date.now() > 16 * MINUTE, 'cooldown follows "try again in 16m28.5s"');
});

test('a node without a declared quota still cools down on its own', () => {
  ResourceManager.markFailure('Sarvam', 'Sarvam API Error: 429 - slow down, try again in 3s');
  const names = new Set();
  for (let seed = 0; seed < 8; seed++) names.add(ResourceManager.getAvailable(seed)?.name);
  assert.ok(!names.has('Sarvam'));
  assert.ok(names.has('Groq'), 'other nodes are untouched');
});

test('an emergency reset keeps quota cooldowns, so an exhausted model is not retried at once', async () => {
  ResourceManager.markFailure('Groq', TPD_ERROR);
  ResourceManager.cooldowns.set('Sarvam', Date.now() + MINUTE);
  const saved = ResourceManager.init;
  ResourceManager.init = async () => {};
  try {
    await ResourceManager.emergencyReset();
  } finally {
    ResourceManager.init = saved;
  }
  assert.equal(ResourceManager.cooldowns.size, 0, 'short node cooldowns still clear');
  assert.ok(ResourceManager.quotaCooldowns.get('groq:openai/gpt-oss-120b') > Date.now());
});
