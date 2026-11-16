// Finance-native polish: Indian number formatting, polarity colors, reference lines/bands.
// Run: node --test tests/chart-engine-finance.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** The wide SVG only: figures also carry a narrow copy, so mark counts are taken from one. */
const wideSvg = html => html.split('<div class="bp-narrow"')[0];
import { formatValue } from '../js/chart-engine/format.js';
import { renderChart, normalizeChart, DARK_THEME, LIGHT_THEME } from '../js/chart-engine/index.js';

// ── Number formatting ──
test('a unit that already carries a scale is grouped, never compacted again', () => {
  assert.equal(formatValue(4210, '₹Cr'), '₹4,210Cr'); // was "₹4.2KCr"
  assert.equal(formatValue(-1850, '₹Cr'), '-₹1,850Cr');
  assert.equal(formatValue(89, '$B'), '$89B');
  assert.equal(formatValue(1250, '$B'), '$1,250B');
});

test('rupee scale units use Indian digit grouping', () => {
  assert.equal(formatValue(123456, '₹Cr'), '₹1,23,456Cr');
});

test('bare rupee amounts compact to lakh and crore', () => {
  assert.equal(formatValue(45000, '₹'), '₹45,000');
  assert.equal(formatValue(250000, '₹'), '₹2.5L');
  assert.equal(formatValue(12500000, '₹'), '₹1.25Cr');
  assert.equal(formatValue(-30000000, '₹'), '-₹3Cr');
  assert.equal(formatValue(2.5e12, '₹'), '₹2.5L Cr');
});

test('non-rupee formatting is unchanged', () => {
  assert.equal(formatValue(1500, '$'), '$1.5K');
  assert.equal(formatValue(4.25, '%'), '4.25%');
  assert.equal(formatValue(2300000), '2.3M');
  assert.equal(formatValue(25, 'bps'), '25 bps');
});

// ── Polarity ──
const flows = { type: 'bar', title: 'FII flows', unit: '₹Cr', data: [['Sector', 'Flow'], ['Financials', 4210], ['IT', -1850], ['Energy', 960]] };
const fills = html => [...wideSvg(html).matchAll(/class="bp-bar" d="[^"]*" fill="([^"]+)"/g)].map(m => m[1]);

test('a single mixed-sign series colors bars by sign (blue gains, red losses)', () => {
  assert.deepEqual(fills(renderChart(flows, { theme: 'light' })), [LIGHT_THEME.positive, LIGHT_THEME.negative, LIGHT_THEME.positive]);
  assert.deepEqual(fills(renderChart(flows, { theme: 'dark' })), [DARK_THEME.positive, DARK_THEME.negative, DARK_THEME.positive]);
});

test('polarity never overrides series identity or same-sign data', () => {
  const twoSeries = { type: 'column', data: [['Q', 'A', 'B'], ['Q1', 3, -2], ['Q2', -1, 4]] };
  assert.ok(fills(renderChart(twoSeries, { theme: 'light' })).every(f => LIGHT_THEME.series.includes(f)));
  const allPositive = { type: 'column', data: [['A', 3], ['B', 5], ['C', 2]] };
  assert.deepEqual([...new Set(fills(renderChart(allPositive, { theme: 'light' })))], [LIGHT_THEME.series[0]]);
});

// ── Reference lines and target bands ──
const cpi = {
  type: 'line', title: 'CPI', unit: '%',
  data: [['Q', 'CPI'], ['Q1', 4.8], ['Q2', 5.1], ['Q3', 4.4]],
  references: [{ value: 6.5, label: 'Repo rate' }, { from: 2, to: 6, label: 'RBI tolerance band' }],
};

test('references normalize to lines and bands (sorted, bounded)', () => {
  const spec = normalizeChart({ ...cpi, references: [...cpi.references, { from: 9, to: 7 }, { value: 'x' }, ...Array(6).fill({ value: 1 })] });
  assert.deepEqual(spec.references[0], { kind: 'line', value: 6.5, label: 'Repo rate' });
  assert.deepEqual(spec.references[1], { kind: 'band', from: 2, to: 6, label: 'RBI tolerance band' });
  assert.deepEqual(spec.references[2], { kind: 'band', from: 7, to: 9, label: '' });
  assert.ok(spec.references.length <= 4);
});

test('reference lines and bands render, and the value axis stretches to show them', () => {
  const html = renderChart(cpi, { theme: 'light' });
  assert.match(html, /class="bp-reference-band"/);
  assert.match(html, /class="bp-reference-line"/);
  assert.match(html, /Repo rate/);
  assert.match(html, />7%</, 'axis must reach past the 6.5 repo line');
});

test('reference labels are escaped', () => {
  const html = renderChart({ ...cpi, references: [{ value: 6, label: '<img src=x onerror=alert(1)>' }] });
  assert.doesNotMatch(html, /<img/);
});

test('pies and gauges ignore references', () => {
  const html = renderChart({ type: 'pie', data: [['A', 40], ['B', 60]], references: [{ value: 50, label: 'Half' }] });
  assert.doesNotMatch(html, /bp-reference/);
});

test('a loss label on a horizontal bar sits right of the zero line, clear of the category gutter', () => {
  const html = renderChart(flows, { theme: 'light' });
  const zeroX = Number(html.match(/<line x1="([\d.]+)"[^>]*stroke="[^"]*"[^>]*\/><text[^>]*>₹0Cr</)[1]);
  const lossX = Number(html.match(/<text class="bp-annotation" x="([\d.]+)"[^>]*>-₹1,850Cr</)[1]);
  assert.ok(lossX > zeroX, `loss label x=${lossX} should be right of zero x=${zeroX}`);
});
