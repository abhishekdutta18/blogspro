import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../src/log.js';

const sink = () => {
  const lines = [];
  return { lines, write: chunk => lines.push(chunk) };
};

test('every log level goes to stderr as one JSON line, leaving stdout for data', () => {
  const stderr = sink();
  const log = createLogger({ stderr });
  log.info('run.start', { slot: 'H_x' });
  log.warn('llm.provider_failed', { provider: 'groq' });
  log.error('run.failed');
  assert.equal(stderr.lines.length, 3);
  const parsed = stderr.lines.map(line => JSON.parse(line));
  assert.deepEqual(parsed.map(p => p.level), ['info', 'warn', 'error']);
  assert.equal(parsed[0].slot, 'H_x');
  assert.ok(stderr.lines.every(line => line.endsWith('\n')));
});
