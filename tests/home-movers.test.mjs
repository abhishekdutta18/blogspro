/**
 * Top-movers tests: constituent list parsing (NSE CSV, S&P CSV, Wikipedia wikitext for Sensex and
 * Nikkei), number parsing, ranking and breadth, the coverage rule, trading windows, Yahoo's stop on a 429,
 * and the publisher refreshing only markets that are due.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { csvFields, parseNseCsv, parseSp500Csv, parseSensexWikitext, parseNikkeiWikitext } from '../scripts/lib/home-movers/constituents.js';
import { parseNumber, normalizeTicker, yahooChanges } from '../scripts/lib/home-movers/quotes.js';
import { rankMovers, membersWithQuotes, isTrading, publishHomeMovers } from '../scripts/publish-home-movers.js';

test('list parsers read each source format', () => {
  assert.deepEqual(csvFields('3M,"Saint Paul, Minnesota",x'), ['3M', 'Saint Paul, Minnesota', 'x']);
  assert.deepEqual(parseNseCsv('Company Name,Industry,Symbol,Series,ISIN Code\nReliance Industries Ltd.,Oil,RELIANCE,EQ,INE002A01018\nBad,,<x>,EQ,\n'),
    [{ symbol: 'RELIANCE.NS', name: 'Reliance Industries Ltd.' }]);
  assert.deepEqual(parseSp500Csv('Symbol,Security,GICS Sector\nBRK.B,Berkshire Hathaway,Financials\nMMM,3M,"Industrials, misc"\n').map((m) => m.symbol), ['BRK.B', 'MMM']);
  const sensex = '{| class="wikitable sortable" id="constituents"\n!Company\n!Symbol\n|-\n![[Adani Ports & SEZ]]\n|ADANIPORTS.BO\n|532921\n|-\n![[Asian Paints|Asian Paints Ltd]]\n|ASIANPAINT.BO\n|500820\n';
  assert.deepEqual(parseSensexWikitext(sensex), [{ symbol: 'ADANIPORTS.NS', name: 'Adani Ports & SEZ' }, { symbol: 'ASIANPAINT.NS', name: 'Asian Paints Ltd' }]);
  const nikkei = 'intro *[[Not]] ({{tyo2|1111}})\n==Components==\n*[[Toyota|Toyota Motor]] Corp. ({{tyo2|7203}})\n*\'\'\'[[KDDI]] Corp. ({{TYO|9433}})\'\'\'\n';
  assert.deepEqual(parseNikkeiWikitext(nikkei), [{ symbol: '7203.T', name: 'Toyota Motor Corp.' }, { symbol: '9433.T', name: 'KDDI Corp.' }]);
});

test('parseNumber and normalizeTicker handle Nasdaq formats', () => {
  assert.deepEqual(['$1,234.50', '+1.60%', '-0.919%', '', 'n/a'].map(parseNumber), [1234.5, 1.6, -0.919, null, null]);
  assert.deepEqual(['BRK.B', 'BRK/B', 'brk-b'].map(normalizeTicker), ['BRK-B', 'BRK-B', 'BRK-B']);
});

test('rankMovers gives the top and bottom five with breadth, and no gainers on an all-red day', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ symbol: `S${i}.NS`, name: `Stock ${i}`, price: 100 + i, changePct: i - 6.004 }));
  const ranked = rankMovers(rows);
  assert.deepEqual(ranked.gainers.map((g) => g.symbol), ['S11', 'S10', 'S9', 'S8', 'S7']);
  assert.deepEqual(ranked.losers.map((g) => g.symbol), ['S0', 'S1', 'S2', 'S3', 'S4']);
  assert.equal(ranked.losers[0].changePct, -6);
  assert.deepEqual([ranked.count, ranked.advancers, ranked.decliners], [12, 5, 7]);
  assert.deepEqual(rankMovers(rows.map((r) => ({ ...r, changePct: -1 }))).gainers, []);
});

test('membersWithQuotes needs prices for 80% of members', () => {
  const members = Array.from({ length: 10 }, (_, i) => ({ symbol: `S${i}`, name: `N${i}` }));
  const lookup = (n) => (s) => (Number(s.slice(1)) < n ? { price: 1, changePct: 1 } : undefined);
  assert.equal(membersWithQuotes(members, lookup(8)).length, 8);
  assert.equal(membersWithQuotes(members, lookup(7)), null);
});

test('isTrading follows each market window on weekdays only', () => {
  const at = (iso) => Date.parse(iso);
  assert.equal(isTrading('IN', at('2026-11-23T06:00Z')), true); // Mon 11:30 IST
  assert.equal(isTrading('IN', at('2026-11-23T12:00Z')), false);
  assert.equal(isTrading('JP', at('2026-11-23T02:00Z')), true);
  assert.equal(isTrading('US', at('2026-11-23T15:00Z')), true);
  assert.equal(isTrading('US', at('2026-11-22T15:00Z')), false, 'Sunday');
});

test('yahooChanges stops requesting after a 429', async () => {
  const symbols = Array.from({ length: 20 }, (_, i) => `S${i}.NS`);
  let calls = 0;
  const body = { chart: { result: [{ meta: { regularMarketPrice: 101, chartPreviousClose: 100 } }] } };
  const fetchImpl = async () => {
    calls += 1;
    return calls === 4 ? { ok: false, status: 429 } : { ok: true, status: 200, json: async () => body };
  };
  const { quotes, rateLimited } = await yahooChanges(symbols, { fetchImpl, concurrency: 1 });
  assert.equal(rateLimited, true);
  assert.equal(calls, 4);
  assert.equal(quotes.size, 3);
  assert.ok(Math.abs(quotes.get('S0.NS').changePct - 1) < 1e-9);
});

test('publishHomeMovers refreshes due markets and keeps the rest', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'home-movers-'));
  const out = path.join(dir, 'movers.json');
  const state = path.join(dir, 'lists.json');
  const now = Date.parse('2026-11-23T15:00Z'); // US open, India and Japan closed
  const sp = Array.from({ length: 500 }, (_, i) => ({ symbol: `T${i}`, name: `Co ${i}` }));
  const fresh = { fetchedAt: now, members: [] };
  fs.writeFileSync(state, JSON.stringify({ sp500: { fetchedAt: now, members: sp }, nifty50: fresh, niftyBank: fresh, sensex: fresh, nikkei225: fresh }));
  const previousNifty = { id: 'nifty50', name: 'Nifty 50', fetchedAt: now - 3600_000, count: 50, gainers: [], losers: [] };
  fs.writeFileSync(out, JSON.stringify({ generatedAt: 0, indices: [previousNifty, { id: 'nikkei225', fetchedAt: now - 3600_000 }, { id: 'sensex', fetchedAt: now - 3600_000 }, { id: 'niftyBank', fetchedAt: now - 3600_000 }] }));
  const screenerRows = sp.map((m, i) => ({ symbol: m.symbol, name: m.name, lastsale: `$${10 + i}`, pctchange: `${(i % 7) - 3}%` }));
  const ndxRows = sp.slice(0, 100).map((m) => ({ symbol: m.symbol, companyName: `${m.name} Common Stock` }));
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.includes('screener')) return { ok: true, json: async () => ({ data: { rows: screenerRows } }) };
    if (url.includes('nasdaq100')) return { ok: true, json: async () => ({ data: { data: { rows: ndxRows } } }) };
    return { ok: false, status: 500 };
  };
  const result = await publishHomeMovers({ out, state, fetchImpl, now });
  assert.deepEqual(result.due, ['US']);
  assert.deepEqual(result.fresh, ['sp500', 'nasdaq100']);
  assert.ok(!urls.some((u) => u.includes('yahoo')), 'closed markets with a fresh copy make no Yahoo requests');
  const saved = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.deepEqual(saved.indices.map((i) => i.id), ['nifty50', 'sensex', 'niftyBank', 'sp500', 'nasdaq100', 'nikkei225']);
  assert.deepEqual(saved.indices[0], previousNifty);
  const ndx = saved.indices.find((i) => i.id === 'nasdaq100');
  assert.equal(ndx.count, 100);
  assert.equal(ndx.gainers[0].name, 'Co 6', 'Nasdaq share-class wording is trimmed from names');
  fs.rmSync(dir, { recursive: true, force: true });
});
