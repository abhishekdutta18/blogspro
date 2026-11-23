/**
 * Token budget tests: the rolling 24-hour ledger file, cap resolution from env, and the budgeted askAI wrapper
 * that refuses a call before it is sent when the run or day cap would be exceeded.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BudgetExceededError, createBudgetedAskAI, estimateTokens, ledgerFile, readLedger, resolveCaps,
} from '../scripts/lib/token-budget.js';

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-')), 'token-ledger.json');
const NOW = new Date('2026-11-23T00:05:00Z');

test('estimateTokens counts about four characters per token and treats non-strings as text', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
  assert.equal(estimateTokens(null), 0);
  assert.equal(estimateTokens({ a: 1 }), estimateTokens('{"a":1}'));
});

test('readLedger keeps only the last 24 hours, and survives a missing, corrupt or old-format file', () => {
  const file = tmpFile();
  assert.deepEqual(readLedger(file, NOW), { entries: [] });
  fs.writeFileSync(file, 'not json');
  assert.deepEqual(readLedger(file, NOW), { entries: [] });
  fs.writeFileSync(file, JSON.stringify({ day: '2026-11-22', used: { daily: 5000 } }));
  assert.deepEqual(readLedger(file, NOW), { entries: [] });
  const hour = 3_600_000;
  fs.writeFileSync(file, JSON.stringify({ entries: [
    { t: NOW.getTime() - 25 * hour, freq: 'hourly', tokens: 9000 },
    { t: NOW.getTime() - 7 * hour, freq: 'hourly', tokens: 4000 },
    { t: NOW.getTime() - hour, freq: 'daily', tokens: 'bad' },
  ] }));
  assert.deepEqual(readLedger(file, NOW), { entries: [{ t: NOW.getTime() - 7 * hour, freq: 'hourly', tokens: 4000 }] });
});

test('ledgerFile prefers TOKEN_LEDGER_FILE, then the systemd state directory', () => {
  assert.equal(ledgerFile({ TOKEN_LEDGER_FILE: '/x/l.json', STATE_DIRECTORY: '/s' }), '/x/l.json');
  assert.equal(ledgerFile({ STATE_DIRECTORY: '/var/lib/blogspro-pulse' }), '/var/lib/blogspro-pulse/token-ledger.json');
  assert.ok(ledgerFile({}).endsWith(path.join('.blogspro', 'token-ledger.json')));
});

test('resolveCaps uses defaults and accepts positive integer overrides only', () => {
  const defaults = resolveCaps('daily', {});
  assert.ok(defaults.runCap > 0 && defaults.dayCap > defaults.runCap);
  assert.equal(resolveCaps('daily', { TOKEN_BUDGET_DAILY_RUN: '12000' }).runCap, 12000);
  assert.equal(resolveCaps('weekly', { TOKEN_BUDGET_DAY: '90000' }).dayCap, 90000);
  assert.equal(resolveCaps('daily', { TOKEN_BUDGET_DAILY_RUN: 'lots' }).runCap, defaults.runCap);
  assert.equal(resolveCaps('daily', { TOKEN_BUDGET_DAILY_RUN: '-5' }).runCap, defaults.runCap);
});

test('budgeted askAI records prompt and reply tokens per frequency in the day ledger', async () => {
  const file = tmpFile();
  const askAI = async () => 'x'.repeat(400);
  const budget = createBudgetedAskAI({ askAI, freq: 'daily', file, runCap: 10_000, dayCap: 50_000, replyReserve: 100, now: () => NOW });
  const reply = await budget.askAI('p'.repeat(800), { role: 'generate' });
  assert.equal(reply.length, 400);
  assert.deepEqual(budget.usage(), { run: 300, day: 300, calls: 1, refused: 0 });
  assert.deepEqual(readLedger(file, NOW), { entries: [{ t: NOW.getTime(), freq: 'daily', tokens: 300 }] });
});

test('budgeted askAI refuses a call that would pass the run cap, without calling the model', async () => {
  const file = tmpFile();
  let calls = 0;
  const askAI = async () => { calls += 1; return 'ok'; };
  const budget = createBudgetedAskAI({ askAI, freq: 'weekly', file, runCap: 1_000, dayCap: 50_000, replyReserve: 500, now: () => NOW });
  await assert.rejects(budget.askAI('p'.repeat(2400)), (error) => error instanceof BudgetExceededError && /run cap/.test(error.message));
  assert.equal(calls, 0);
  assert.equal(budget.usage().refused, 1);
});

test('budgeted askAI counts other runs in the last 24 hours, across midnight UTC, against the day cap', async () => {
  const file = tmpFile();
  // An edition the evening before (16:30 UTC) still counts against the 00:05 UTC daily run, as Groq's limits roll.
  fs.writeFileSync(file, JSON.stringify({ entries: [{ t: Date.parse('2026-11-22T16:30:00Z'), freq: 'hourly', tokens: 49_500 }] }));
  const budget = createBudgetedAskAI({ askAI: async () => 'ok', freq: 'daily', file, runCap: 10_000, dayCap: 50_000, replyReserve: 600, now: () => NOW });
  await assert.rejects(budget.askAI('short prompt'), /day cap/);
});

test('a failed call still charges its prompt, since the provider may have read it', async () => {
  const file = tmpFile();
  const askAI = async () => { throw new Error('429 rate limited'); };
  const budget = createBudgetedAskAI({ askAI, freq: 'daily', file, runCap: 10_000, dayCap: 50_000, replyReserve: 100, now: () => NOW });
  await assert.rejects(budget.askAI('p'.repeat(400)), /429/);
  assert.equal(readLedger(file, NOW).entries[0].tokens, 100);
});

test('an unwritable ledger does not stop the run; usage is still tracked in memory', async () => {
  const budget = createBudgetedAskAI({
    askAI: async () => 'ok', freq: 'daily', file: '/proc/definitely/not/writable/ledger.json',
    runCap: 10_000, dayCap: 50_000, replyReserve: 10, now: () => NOW,
  });
  await budget.askAI('hello');
  assert.equal(budget.usage().calls, 1);
});
