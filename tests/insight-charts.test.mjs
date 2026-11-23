/**
 * Homepage bonds, movers, forecasts and macro charts: the published files are network data, so the
 * parsers keep only well-formed values; the chart specs join history to forecast; mover text carries signs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBonds, parseMovers, parseForecasts } from '../frontend/src/lib/insights.js';
import { parsePolicy } from '../frontend/src/lib/policy.js';
import { yieldCurveSpec, macroSpec, dailyForecastSpec, spreadTicks, maturityLabel } from '../frontend/src/lib/insightCharts.js';
import { formatChange, formatPrice, breadthText } from '../frontend/src/lib/movers.js';

const curve = [[0.25, 5.6], [1, 6.1], [10, 7.26], [40, 7.98]];
const bondsRaw = {
  tenors: { asOn: '2026-11-20', gsec: [{ bucket: '10Y', years: 10, yield: 7.21, security: '6.33% GS 2035' }, { bucket: '<x>', years: -1, yield: 7 }] },
  zcyc: { latest: { date: '2026-11-20', curve }, previous: { date: '2026-11-19', curve: curve.map(([m, y]) => [m, y + 0.05]) } },
};

test('parseBonds keeps the curves and valid benchmarks only', () => {
  const bonds = parseBonds(bondsRaw);
  assert.equal(bonds.latest.curve.length, 4);
  assert.deepEqual(bonds.benchmarks.map((b) => b.bucket), ['10Y']);
  assert.equal(parseBonds({ zcyc: { latest: { date: 'x', curve } } }), null);
  assert.equal(parseBonds({ zcyc: { latest: { date: '2026-11-20', curve: [[1, 'a']] } } }), null);
  assert.equal(parseBonds({ ...bondsRaw, zcyc: { latest: bondsRaw.zcyc.latest } }).previous, null);
});

test('parseMovers orders indices, drops bad rows and keeps signs consistent', () => {
  const m = (symbol, changePct) => ({ symbol, name: `Co ${symbol}`, price: 10, changePct });
  const movers = parseMovers({ generatedAt: 1, indices: [
    { id: 'sp500', name: 'S&P 500', fetchedAt: 5, currency: 'USD', gainers: [m('AAPL', 2), m('<b>', 3), m('X', -1)], losers: [m('Y', -2)] },
    { id: 'nifty50', name: 'Nifty 50', fetchedAt: 5, currency: 'INR', gainers: [], losers: [] },
    { id: 'evil', name: 'x', fetchedAt: 5 },
  ] });
  assert.deepEqual(movers.indices.map((i) => i.id), ['nifty50', 'sp500']);
  assert.deepEqual(movers.indices[1].gainers.map((g) => g.symbol), ['AAPL']);
  assert.equal(parseMovers({ indices: [] }), null);
});

test('parseForecasts keys daily by symbol and macro by key, rejecting inverted bands', () => {
  const f = parseForecasts({ model: 'TimesFM', confidence: 0.8, generatedAt: 9,
    daily: { series: [{ id: 'NSE:NIFTY', history: [['2026-11-20', 1], ['2026-11-23', 2]], forecast: [{ step: 1, value: 2, lower: 1, upper: 3 }] }, { id: 'BAD', history: [['2026-11-20', 1], ['2026-11-21', 1]], forecast: [{ step: 1, value: 2, lower: 3, upper: 1 }] }] },
    macro: { series: [{ key: 'cpi', forecast: [{ period: '2026-11', value: 5, lower: 4, upper: 6 }] }] } });
  assert.deepEqual([...f.daily.keys()], ['NSE:NIFTY']);
  assert.equal(f.macro.get('cpi')[0].period, '2026-11');
  assert.equal(parseForecasts({}), null);
});

test('parsePolicy keeps macro history sorted and bounded', () => {
  const policy = parsePolicy({ macro: { fetchedAt: 1, indicators: [], history: [
    { key: 'cpi', label: 'CPI inflation', frequency: 'monthly', points: [['2026-02', 5], ['2026-01', 4], ['2026-13', 9], ['2026-03', 'x']] },
    { key: 'other', label: 'x', frequency: 'monthly', points: [['2026-01', 1], ['2026-02', 1]] },
  ] } });
  assert.deepEqual(policy.macro.history.map((s) => s.key), ['cpi']);
  assert.deepEqual(policy.macro.history[0].points, [['2026-01', 4], ['2026-02', 5]]);
});

test('chart specs: yield curve compares days, forecasts continue the last point', () => {
  const spec = yieldCurveSpec(parseBonds(bondsRaw));
  assert.deepEqual(spec.series.map((s) => s.cls), ['lc-compare', 'lc-accent']);
  assert.equal(spec.hover[2].title, '10y: 7.26%');
  assert.equal(spec.hover[2].detail, '-5 bp vs 2026-11-19');
  assert.deepEqual(spec.xTicks.map((t) => t.label), ['1y', '5y', '10y', '15y', '20y', '30y', '40y']);
  assert.equal(maturityLabel(0.25), '3 mo');

  const series = { key: 'cpi', label: 'CPI inflation', frequency: 'monthly', points: [['2026-09', 6], ['2026-10', 6.1]] };
  const macro = macroSpec(series, [{ period: '2026-11', value: 5.7, lower: 4.5, upper: 6.8 }]);
  assert.deepEqual(macro.series[1].points, [[1, 6.1], [2, 5.7]]);
  assert.deepEqual(macro.bands[0].points, [[1, 6.1, 6.1], [2, 4.5, 6.8]]);
  assert.match(macro.hover.at(-1).detail, /80%: 4\.5% to 6\.8%/);
  assert.equal(macroSpec(series).bands.length, 0, 'no forecast, no band');

  const daily = dailyForecastSpec('Nifty 50', { history: [['2026-11-20', 100], ['2026-11-23', 101]], forecast: [{ step: 1, value: 102, lower: 99, upper: 104 }] }, (v) => v.toFixed(0));
  assert.equal(daily.xTicks.at(-1).label, '+1');
  assert.match(daily.label, /ends at 102/);
});

test('spreadTicks never crowds the last label', () => {
  const labels = Array.from({ length: 65 }, (_, i) => `L${i}`);
  const ticks = spreadTicks(labels, 5);
  assert.equal(ticks.at(-1).x, 64);
  assert.ok(ticks.slice(0, -1).every((t) => 64 - t.x >= 6));
});

test('mover text carries the sign and the index currency', () => {
  assert.deepEqual([formatChange(1.234), formatChange(-0.4), formatChange(0)], ['+1.23%', '-0.40%', '0.00%']);
  assert.equal(formatPrice(1234.5, 'INR'), '₹1,234.50');
  assert.equal(formatPrice(2345, 'JPY').replace(/\s/g, ''), '￥2,345');
  assert.match(breadthText({ count: 50, advancers: 31, decliners: 18, fetchedAt: Date.UTC(2026, 10, 23, 10, 0), note: 'n' }), /^31 of 50 rose, 18 fell · prices at 23 Nov, 15:30 IST · n$/);
});
