/**
 * Tests for the homepage's live market loader (frontend/src/lib/markets.js): the published file is
 * network data, so malformed rows are dropped; the label states its time and turns into "Last updated"
 * when the publisher stalls; and figures go into the page by data-attribute with textContent only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkets, marketsLabel, applyMarkets } from '../frontend/src/lib/markets.js';

const NOW = Date.UTC(2026, 10, 23, 7, 35); // 13:05 IST
const row = (over = {}) => ({ symbol: 'NSE:NIFTY', price: '25,454.95', change: '-1.34%', isPositive: false, range: '25,447.95 – 25,992.60', open: '25,929.15', asOf: NOW, live: true, ...over });

test('parseMarkets keeps valid rows keyed by symbol and drops malformed ones', () => {
  const data = parseMarkets({ generatedAt: NOW, items: [row(), row({ symbol: '<img>' }), row({ symbol: 'SPX', price: 42 }), row({ symbol: 'US10Y', range: null, open: null })] });
  assert.deepEqual([...data.items.keys()], ['NSE:NIFTY', 'US10Y']);
  assert.equal(data.items.get('US10Y').range, null);
  assert.equal(data.updatedAt, NOW);
});

test('parseMarkets rejects a file without a timestamp or usable rows', () => {
  assert.equal(parseMarkets(null), null);
  assert.equal(parseMarkets({ items: [row()] }), null);
  assert.equal(parseMarkets({ generatedAt: NOW, items: [] }), null);
  assert.equal(parseMarkets({ generatedAt: NOW, items: [row({ price: 'x'.repeat(200) })] }), null);
});

test('marketsLabel gives the IST time and flags a stalled publisher', () => {
  assert.equal(marketsLabel(NOW, NOW + 60_000), 'Updated 23 Nov, 13:05 IST');
  assert.equal(marketsLabel(NOW, NOW + 7 * 3600_000), 'Last updated 23 Nov, 13:05 IST');
});

/** Minimal DOM: rows with data-field cells, plus one label element. */
function fakePage(symbols) {
  const cell = () => {
    const classes = new Set(['text-up']);
    return { textContent: 'old', classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), has: (c) => classes.has(c) } };
  };
  const rows = symbols.map((symbol) => {
    const cells = { price: cell(), change: cell(), range: cell(), open: cell() };
    return { dataset: { marketSymbol: symbol }, title: '', cells, querySelector: (sel) => cells[sel.match(/data-field="(\w+)"/)[1]] };
  });
  const label = { textContent: 'Close, 14 Nov 2026' };
  const root = { querySelectorAll: (sel) => (sel === '[data-market-symbol]' ? rows : [label]) };
  return { root, rows, label };
}

test('applyMarkets fills matching rows, recolours the change, and leaves unknown symbols as built', () => {
  const page = fakePage(['NSE:NIFTY', 'IN10Y']);
  const data = parseMarkets({ generatedAt: NOW, items: [row({ open: null })] });
  applyMarkets(page.root, data, NOW);
  const [nifty, gsec] = page.rows;
  assert.equal(nifty.cells.price.textContent, '25,454.95');
  assert.equal(nifty.cells.change.textContent, '-1.34%');
  assert.ok(nifty.cells.change.classList.has('text-down') && !nifty.cells.change.classList.has('text-up'));
  assert.equal(nifty.cells.open.textContent, '—', 'a missing figure shows a dash, not the stale built value');
  assert.equal(gsec.cells.price.textContent, 'old');
  assert.equal(page.label.textContent, 'Updated 23 Nov, 13:05 IST');
});

test('parseMarkets keeps chart data that is well formed and drops the rest', () => {
  const fmt = { locale: 'en-IN', digits: 2, prefix: '', suffix: '' };
  const points = [[100, 25_700.1], [400, 25_634.9], [300, 1], ['x', 2], [700, null], [1000, 25_650]];
  const item = parseMarkets({ generatedAt: NOW, items: [row({ last: 25_650, prevClose: 25_800, fmt, points })] }).items.get('NSE:NIFTY');
  assert.deepEqual(item.points, [[100, 25_700.1], [400, 25_634.9], [1000, 25_650]], 'bad and out-of-order points are dropped');
  assert.deepEqual([item.last, item.prevClose, item.fmt], [25_650, 25_800, fmt]);

  const odd = parseMarkets({ generatedAt: NOW, items: [row({ last: 'x', fmt: { locale: 'xx', digits: 2 }, points: 'nope' })] }).items.get('NSE:NIFTY');
  assert.deepEqual([odd.last, odd.prevClose, odd.fmt, odd.points], [null, null, null, []]);
  const injected = parseMarkets({ generatedAt: NOW, items: [row({ fmt: { ...fmt, prefix: '<b>' } })] }).items.get('NSE:NIFTY');
  assert.equal(injected.fmt, null, 'only known prefixes and suffixes are accepted');
});
