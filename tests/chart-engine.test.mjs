// Tests for js/chart-engine — the zero-dependency SVG chart engine.
// Run: node --test tests/chart-engine.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** The wide SVG only: figures also carry a narrow copy, so mark counts are taken from one. */
const wideSvg = html => html.split('<div class="bp-narrow"')[0];
import { normalizeChart, parsePayload, toNumber, ChartSpecError } from '../js/chart-engine/normalize.js';
import { niceTicks } from '../js/chart-engine/scale.js';
import { compactNumber, formatValue, escapeHtml } from '../js/chart-engine/format.js';
import { renderChart, extractChartBlocks } from '../js/chart-engine/index.js';

// ── parsing ─────────────────────────────────────
test('parsePayload strips markdown code fences', () => {
  assert.deepEqual(parsePayload('```json\n[["A", 1]]\n```'), [['A', 1]]);
});

test('parsePayload repairs single quotes, unquoted keys and trailing commas', () => {
  assert.deepEqual(parsePayload("{ name: 'SPX', value: 5200, }"), { name: 'SPX', value: 5200 });
});

test('parsePayload rejects garbage with ChartSpecError, never evaluates it', () => {
  assert.throws(() => parsePayload('alert(1)'), ChartSpecError);
});

test('toNumber reads currency, percent and thousands separators', () => {
  assert.equal(toNumber('₹1,200.5'), 1200.5);
  assert.equal(toNumber('14.2%'), 14.2);
  assert.equal(toNumber('-3'), -3);
  assert.equal(toNumber('n/a'), null);
  assert.equal(toNumber(Infinity), null);
});

// ── normalizing all three payload shapes ────────
test('normalizes Google DataTable shape with header row', () => {
  const spec = normalizeChart({ type: 'line', title: 'Drift', data: [['Month', 'Index', 'Peer'], ['Jan', 90, 88], ['Feb', 92, 91]] });
  assert.equal(spec.type, 'line');
  assert.deepEqual(spec.categories, ['Jan', 'Feb']);
  assert.deepEqual(spec.series.map(s => s.name), ['Index', 'Peer']);
  assert.deepEqual(spec.series[1].values, [88, 91]);
});

test('normalizes bare [[label, value]] array as a single-series bar', () => {
  const spec = normalizeChart('[["DXY", 104.0], ["10Y", 4.25]]');
  assert.equal(spec.type, 'bar');
  assert.equal(spec.series.length, 1);
  assert.deepEqual(spec.series[0].values, [104, 4.25]);
});

test('normalizes admin chart-builder labels/datasets shape', () => {
  const spec = normalizeChart({ type: 'bar', labels: ['Q1', 'Q2'], datasets: [{ label: 'Rev', data: [1, 2] }], unit: '%' });
  assert.deepEqual(spec.categories, ['Q1', 'Q2']);
  assert.equal(spec.series[0].name, 'Rev');
  assert.equal(spec.unit, '%');
});

test('maps type aliases and falls back to bar for unknown types', () => {
  assert.equal(normalizeChart({ type: 'column', data: [['A', 1]] }).type, 'bar');
  assert.equal(normalizeChart({ type: 'area', data: [['A', 1]] }).type, 'line');
  assert.equal(normalizeChart({ type: 'radar3d', data: [['A', 1]] }).type, 'bar');
});

test('pie with negative values degrades to bar instead of lying', () => {
  assert.equal(normalizeChart({ type: 'pie', data: [['A', 5], ['B', -2]] }).type, 'bar');
});

test('pie folds slices beyond the cap into Other', () => {
  const rows = Array.from({ length: 9 }, (_, i) => [`S${i}`, 10 + i]); // varied: uniform pies are rejected as placeholders
  const spec = normalizeChart({ type: 'pie', data: rows });
  assert.equal(spec.categories.length, 7);
  assert.equal(spec.categories.at(-1), 'Other');
  assert.equal(spec.series[0].values.at(-1), 16 + 17 + 18);
});

test('caps series count so palette never cycles', () => {
  const header = ['X', ...Array.from({ length: 10 }, (_, i) => `s${i}`)];
  const spec = normalizeChart({ data: [header, ['a', ...Array(10).fill(1)]] });
  assert.equal(spec.series.length, 6);
});

test('rejects payloads with no finite values', () => {
  assert.throws(() => normalizeChart({ data: [['A', 'x'], ['B', 'y']] }), ChartSpecError);
});

test('rejects single key/value objects that are not chartable', () => {
  assert.throws(() => normalizeChart({ name: 'SPX', value: 5200 }), ChartSpecError);
});

test('returned spec is frozen (immutable)', () => {
  const spec = normalizeChart([['A', 1]]);
  assert.ok(Object.isFrozen(spec) && Object.isFrozen(spec.series[0].values));
});

// ── scale + format ──────────────────────────────
test('niceTicks lands on 1/2/5 steps without float noise', () => {
  assert.deepEqual(niceTicks(0, 0.95, 5), [0, 0.2, 0.4, 0.6, 0.8, 1]);
  assert.deepEqual(niceTicks(0, 104, 5), [0, 20, 40, 60, 80, 100, 120]);
});

test('niceTicks handles a flat domain', () => {
  const ticks = niceTicks(5, 5, 5);
  assert.ok(ticks[0] < 5 && ticks.at(-1) > 5);
});

test('compactNumber and formatValue', () => {
  assert.equal(compactNumber(1500), '1.5K');
  assert.equal(compactNumber(2_300_000), '2.3M');
  assert.equal(formatValue(14.2, '%'), '14.2%');
  assert.equal(formatValue(1200, '₹'), '₹1,200'); // rupees group (lakh/crore), never K/M
  assert.equal(formatValue(3, 'bps'), '3 bps');
  assert.equal(formatValue(89, '$B'), '$89B');
  assert.equal(formatValue(-12, '₹Cr'), '-₹12Cr');
});

test('escapeHtml neutralises markup', () => {
  assert.equal(escapeHtml('<img onerror="x">&'), '&lt;img onerror=&quot;x&quot;&gt;&amp;');
});

// ── rendering ───────────────────────────────────
test('renderChart emits accessible figure with svg and data table', () => {
  const html = renderChart({ type: 'bar', title: 'Flows', data: [['Asset', 'Flow'], ['Equity', 1500], ['Debt', 1200]] });
  assert.match(html, /^<figure class="bp-chart"/);
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-labelledby=/);
  assert.match(html, /<table/);
  assert.equal((wideSvg(html).match(/<path class="bp-bar"/g) || []).length, 2);
});

test('renderChart escapes hostile titles and labels', () => {
  const html = renderChart({ title: '<script>x()</script>', data: [['<b>', 1]] });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<b>'));
});

test('renderChart is deterministic (stable ids for clean git diffs)', () => {
  const input = { type: 'line', data: [['A', 1], ['B', 2]] };
  assert.equal(renderChart(input), renderChart(input));
});

test('line chart breaks the path at missing values', () => {
  const html = renderChart({ type: 'line', data: [['T', 'V'], ['a', 1], ['b', 'n/a'], ['c', 3], ['d', 4]] });
  const d = html.match(/class="bp-line"[^>]* d="([^"]+)"/)[1];
  assert.equal((d.match(/M/g) || []).length, 2);
});

test('pie renders one ring segment per slice', () => {
  const html = renderChart({ type: 'pie', data: [['S', 'A'], ['Bank', 35], ['Tech', 65]] });
  assert.equal((wideSvg(html).match(/class="bp-slice"/g) || []).length, 2);
});

test('multi-series charts get a legend, single series does not', () => {
  assert.match(renderChart({ data: [['X', 'A', 'B'], ['a', 1, 2]] }), /bp-legend/);
  assert.doesNotMatch(renderChart({ data: [['a', 1]] }), /bp-legend/);
});

// ── pipeline integration ────────────────────────
test('extractChartBlocks shields charts from markdown parsing and restores them', () => {
  const md = 'Intro\n<chart-data>[["A", 1], ["B", 2]]</chart-data>\nOutro';
  const { text, restore, failures } = extractChartBlocks(md);
  assert.ok(!text.includes('chart-data'));
  const wrapped = text.replace(/^(.+)$/gm, '<p style="x">$1</p>'); // simulate parseMD wrapping
  const out = restore(wrapped);
  assert.match(out, /<figure class="bp-chart"/);
  assert.ok(!out.includes('<p style="x"><figure'));
  assert.equal(failures.length, 0);
});

test('extractChartBlocks reports invalid payloads instead of leaking raw JSON', () => {
  const { text, restore, failures } = extractChartBlocks('x <chart-data>{oops</chart-data> y');
  assert.equal(failures.length, 1);
  assert.ok(!restore(text).includes('{oops'));
});
