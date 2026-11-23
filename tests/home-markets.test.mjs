/**
 * Homepage market data tests — quote day range/open parsing, display formatting per instrument style,
 * merging with the previous file when a quote fails, and the publisher's atomic write and refusal to
 * replace good data with nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseChart } from '../scripts/lib/market-edition/market-data.js';
import { HOME_INSTRUMENTS, buildHomeMarkets, formatHomeItem } from '../scripts/lib/market-edition/home-markets.js';
import { publishHomeMarkets } from '../scripts/publish-home-markets.js';

const NOW = Date.UTC(2026, 10, 23, 7, 30);
const quote = (over = {}) => ({ ok: true, price: 25634.9, prevClose: 25800, change: -165.1, changePct: -0.64, dayHigh: 25700, dayLow: 25500.1, open: 25780, asOf: NOW - 60_000, exchangeTz: 'Asia/Kolkata', ...over });

test('parseChart also returns the day range and open, treating zero or missing as unknown', () => {
  const full = parseChart({ chart: { result: [{ meta: { regularMarketPrice: 110, chartPreviousClose: 100, regularMarketDayHigh: 111, regularMarketDayLow: 99 }, indicators: { quote: [{ open: [101] }] } }] } });
  assert.deepEqual([full.dayHigh, full.dayLow, full.open], [111, 99, 101]);
  const zeros = parseChart({ chart: { result: [{ meta: { regularMarketPrice: 4.9, regularMarketDayHigh: 0, regularMarketDayLow: 0 } }] } });
  assert.deepEqual([zeros.dayHigh, zeros.dayLow, zeros.open], [null, null, null]);
});

test('every homepage instrument has a Yahoo symbol and a known display style', () => {
  const styles = new Set(['inr', 'num', 'fx2', 'fx4', 'usd', 'usd0', 'yield']);
  for (const i of HOME_INSTRUMENTS) {
    assert.ok(i.symbol && i.yahoo, i.symbol);
    assert.ok(styles.has(i.style), `${i.symbol} style ${i.style}`);
  }
  assert.equal(new Set(HOME_INSTRUMENTS.map((i) => i.symbol)).size, HOME_INSTRUMENTS.length, 'symbols are unique');
});

test('formatHomeItem formats price, change, range and open by style, with chart data', () => {
  const points = [{ t: NOW - 120_000, close: 25700.123456 }, { t: NOW - 60_000, close: 25634.9 }];
  const nifty = formatHomeItem({ symbol: 'NSE:NIFTY', style: 'inr' }, quote({ points }), NOW);
  assert.deepEqual(nifty, {
    symbol: 'NSE:NIFTY', price: '25,634.90', change: '-0.64%', isPositive: false,
    range: '25,500.10 – 25,700.00', open: '25,780.00', asOf: NOW - 60_000, live: true,
    last: 25634.9, prevClose: 25800,
    fmt: { locale: 'en-IN', digits: 2, prefix: '', suffix: '' },
    points: [[Math.floor((NOW - 120_000) / 1000), 25700.1], [Math.floor((NOW - 60_000) / 1000), 25634.9]],
  });
  const lakh = formatHomeItem({ symbol: 'BSE:SENSEX', style: 'inr' }, quote({ price: 183410.21, changePct: 0.61, change: 1 }), NOW);
  assert.equal(lakh.price, '1,83,410.21', 'Indian grouping for INR indices');
  assert.equal(lakh.change, '+0.61%');

  const yieldItem = formatHomeItem({ symbol: 'US10Y', style: 'yield' }, quote({ price: 4.912, change: -0.14, changePct: -2.77, dayHigh: null, dayLow: null, open: null, asOf: NOW - 5 * 3600_000 }), NOW);
  assert.deepEqual([yieldItem.price, yieldItem.change, yieldItem.range, yieldItem.open, yieldItem.live], ['4.91%', '-14 bp', null, null, false]);

  assert.equal(formatHomeItem({ symbol: 'GOLD', style: 'usd' }, quote({ price: 3883.9 }), NOW).price, '$3,883.90');
  assert.equal(formatHomeItem({ symbol: 'BTCUSDT', style: 'usd0' }, quote({ price: 65220.4 }), NOW).price, '$65,220');
  assert.equal(formatHomeItem({ symbol: 'EURUSD', style: 'fx4' }, quote({ price: 1.09213 }), NOW).price, '1.0921');
  assert.equal(formatHomeItem({ symbol: 'X', style: 'num' }, quote({ changePct: null, change: null }), NOW).change, '—', 'no previous close: no change');
});

test('chart points are capped at 120, keep the latest point, and default to none', () => {
  const many = Array.from({ length: 300 }, (_, i) => ({ t: NOW - (300 - i) * 60_000, close: 100 + i }));
  const item = formatHomeItem({ symbol: 'BTCUSDT', style: 'usd0' }, quote({ points: many }), NOW);
  assert.ok(item.points.length <= 120);
  assert.deepEqual(item.points.at(-1), [Math.floor(many.at(-1).t / 1000), 399]);
  assert.ok(item.points.every((p, i, all) => i === 0 || p[0] > all[i - 1][0]), 'times increase');
  assert.deepEqual(item.fmt, { locale: 'en-US', digits: 0, prefix: '$', suffix: '' });
  assert.deepEqual(formatHomeItem({ symbol: 'X', style: 'num' }, quote(), NOW).points, []);
  assert.deepEqual(formatHomeItem({ symbol: 'US10Y', style: 'yield' }, quote(), NOW).fmt.suffix, '%');
});

test('buildHomeMarkets keeps the last good row for an instrument whose quote failed this time', () => {
  const instruments = [{ symbol: 'NSE:NIFTY', yahoo: '^NSEI', style: 'inr' }, { symbol: 'SPX', yahoo: '^GSPC', style: 'num' }];
  const previous = { generatedAt: NOW - 600_000, items: [{ symbol: 'SPX', price: '6,800.00', change: '-3.70%', isPositive: false, range: null, open: null, asOf: NOW - 9 * 3600_000, live: true }] };
  const out = buildHomeMarkets(instruments, [quote(), { ok: false }], { previous, now: NOW });
  assert.equal(out.generatedAt, NOW);
  assert.deepEqual(out.items.map((i) => i.symbol), ['NSE:NIFTY', 'SPX']);
  assert.equal(out.items[1].price, '6,800.00');
  assert.equal(out.items[1].live, false, 'a kept row is re-judged against now');
  assert.equal(out.fresh, 1);

  const nothing = buildHomeMarkets(instruments, [{ ok: false }, { ok: false }], { previous: null, now: NOW });
  assert.deepEqual([nothing.items.length, nothing.fresh], [0, 0]);
});

test('publishHomeMarkets writes atomically and never replaces good data with an all-failed fetch', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'home-markets-'));
  const out = path.join(dir, 'data', 'markets.json');
  const urls = [];
  const bar = Math.floor(NOW / 1000);
  const okFetch = async (url) => {
    urls.push(url);
    return { ok: true, json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 100, chartPreviousClose: 99, regularMarketTime: bar }, timestamp: [bar - 300, bar], indicators: { quote: [{ open: [99.5, 99.8], close: [99.8, 100] }] } }] } }) };
  };
  const first = await publishHomeMarkets({ out, fetchImpl: okFetch, now: NOW });
  assert.equal(first.written, true);
  assert.ok(urls.every((u) => u.includes('interval=5m&range=1d')), 'one intraday request per instrument gives quote and chart');
  const saved = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(saved.items.length, HOME_INSTRUMENTS.length);
  assert.deepEqual(saved.items[0].points, [[bar - 300, 99.8], [bar, 100]]);
  assert.deepEqual(fs.readdirSync(path.dirname(out)), ['markets.json'], 'no temp file left behind');

  const failFetch = async () => ({ ok: false, status: 503 });
  const second = await publishHomeMarkets({ out, fetchImpl: failFetch, now: NOW + 600_000 });
  assert.equal(second.written, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), saved, 'the good file is untouched');
  fs.rmSync(dir, { recursive: true, force: true });
});
