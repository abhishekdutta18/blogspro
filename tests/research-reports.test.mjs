/**
 * Daily and weekly report tests: the report definitions, week-over-week quotes, the week's edition digest
 * read from snapshots, full report runs with fake fetch and AI, and the token-budget fallback.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EDITIONS, REPORTS, getEdition, resolveEdition } from '../scripts/lib/market-edition/editions.js';
import { PERIODS, fetchMarketSnapshot, snapshotToText } from '../scripts/lib/market-edition/market-data.js';
import { recentEditionsText } from '../scripts/lib/market-edition/week-digest.js';
import { generateMarketEdition } from '../scripts/lib/market-edition/index.js';
import { BudgetExceededError } from '../scripts/lib/token-budget.js';

const NOW = new Date('2026-11-22T01:00:00Z'); // Sunday 06:30 IST, the weekly slot

test('daily and weekly are reports, not editions, so the edition clock never picks them', () => {
  assert.equal(getEdition('daily').label, 'Daily strategy');
  assert.equal(getEdition('weekly').label, 'Weekly review');
  assert.equal(getEdition('weekly').period, PERIODS.week);
  assert.equal(getEdition('morning').period, PERIODS.session);
  assert.deepEqual(REPORTS.map((r) => r.id), ['daily', 'weekly']);
  for (let h = 0; h < 24; h += 1) {
    const id = resolveEdition(new Date(Date.UTC(2026, 10, 23, h))).id;
    assert.ok(EDITIONS.some((e) => e.id === id), `hour ${h} resolved to ${id}`);
  }
});

test('fetchMarketSnapshot asks for the period range and snapshotToText names the period', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return { ok: true, json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 105, chartPreviousClose: 100, currency: 'INR' } }] } }) };
  };
  const groups = await fetchMarketSnapshot({ fetchImpl, period: PERIODS.week });
  assert.ok(urls.length > 0 && urls.every((u) => u.includes('range=5d')));
  const text = snapshotToText(groups, NOW.getTime(), PERIODS.week);
  assert.match(text, /\+5\.00% over the last 5 sessions/);
  assert.doesNotMatch(text, /vs previous close/);
  assert.match(snapshotToText(groups, NOW.getTime()), /vs previous close/, 'editions keep the session wording');
});

function writeSnapshot(dir, name, snapshot, mtime) {
  const file = path.join(dir, `${name}.json`);
  fs.writeFileSync(file, typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot));
  fs.utimesSync(file, mtime, mtime);
}

test('recentEditionsText lists the last 7 days of edition titles and summaries, oldest first', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snaps-'));
  const day = (n) => new Date(NOW.getTime() - n * 86_400_000);
  writeSnapshot(dir, 'a', { edition: 'close', timeLabel: '20 Nov 2026, 16:00 IST', text: { title: 'Nifty slips', summary: 'Banks weighed.' } }, day(2));
  writeSnapshot(dir, 'b', { edition: 'morning', timeLabel: '18 Nov 2026, 08:00 IST', text: { title: 'Asia firm', summary: 'Rupee steady.' } }, day(4));
  writeSnapshot(dir, 'old', { edition: 'close', timeLabel: '1 Nov', text: { title: 'Too old', summary: 'x' } }, day(9));
  writeSnapshot(dir, 'nocomment', { edition: 'evening', timeLabel: '19 Nov', text: null }, day(3));
  writeSnapshot(dir, 'broken', '{not json', day(1));
  const text = recentEditionsText({ dir, now: NOW });
  assert.equal(text, '- 18 Nov 2026, 08:00 IST (morning): Asia firm. Rupee steady.\n- 20 Nov 2026, 16:00 IST (close): Nifty slips. Banks weighed.');
  assert.equal(recentEditionsText({ dir: path.join(dir, 'missing'), now: NOW }), '');
});

function fakeFetch() {
  return async (url) => {
    if (url.includes('finance.yahoo.com')) {
      const result = { meta: { regularMarketPrice: 103, chartPreviousClose: 100, currency: 'INR' }, timestamp: [1, 2], indicators: { quote: [{ close: [100, 103] }] } };
      return { ok: true, json: async () => ({ chart: { result: [result] } }) };
    }
    return { ok: true, text: async () => `<item><title>Markets rally as RBI holds rates and rupee firms</title><link>https://n.example/1</link><pubDate>${new Date().toUTCString()}</pubDate></item>` };
  };
}

function fakeWriter(prompt) {
  if (prompt.includes('Write the market description')) {
    return JSON.stringify({ title: 'A week of gains', summary: 'Nifty rose.', india: ['Nifty rose 3.00% over the week.'], global: ['US firm.'], macro: ['Rupee firm.'] });
  }
  if (prompt.includes('most market-relevant stories')) return JSON.stringify({ stories: [{ id: 1, analysis: 'Policy steady.' }] });
  return JSON.stringify({ thesis: ['Stay invested.'], sectors: [], risks: ['Oil.'], watch: ['CPI'] });
}

test('a weekly report uses week-over-week quotes, the week digest, and the weekly page labels', async () => {
  const prompts = [];
  const askAI = async (prompt, { role }) => {
    prompts.push(prompt);
    if (role === 'research') return '{"stance":"neutral","conviction":2,"points":["Flat week"]}';
    return fakeWriter(prompt);
  };
  const result = await generateMarketEdition({
    askAI, env: {}, now: NOW, editionId: 'weekly', fetchImpl: fakeFetch(), extraContext: 'THIS WEEK\'S EDITIONS:\n- Mon: Nifty slips.',
  });
  assert.equal(result.edition.id, 'weekly');
  assert.equal(prompts.length, 6, 'same fixed call count as an edition');
  assert.ok(prompts.every((p) => p.includes('over the last 5 sessions')));
  assert.ok(prompts.every((p) => p.includes('THIS WEEK\'S EDITIONS')));
  assert.match(prompts[3], /Weekly review/);
  const page = result.renderPage('https://blogspro.in/articles/weekly/x.html');
  assert.match(page, /Weekly review · /);
  assert.match(page, /<th scope="col">Week<\/th>/);
  assert.match(page, /last 5 sessions/);
});

test('a refused budget publishes the report without commentary instead of failing', async () => {
  let calls = 0;
  const askAI = async () => { calls += 1; throw new BudgetExceededError('day cap reached'); };
  const result = await generateMarketEdition({ askAI, env: {}, now: NOW, editionId: 'daily', fetchImpl: fakeFetch() });
  assert.equal(result.edition.id, 'daily');
  assert.equal(result.hasCommentary, false);
  assert.match(result.final, /Commentary is unavailable/);
  assert.ok(calls <= 5, 'board calls plus one overview attempt; refusals do not retry');
});
