// Feature-parity + hardening tests for js/chart-engine.
// Parity targets reverse-engineered from: scripts/lib/templates.js (pipeline, Google Charts),
// js/chart-builder.js (admin), js/init.js (dashboard Google Charts), rl-*.html + terminal-dispatch.js (Chart.js).
// Run: node --test tests/chart-engine-features.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChart, ChartSpecError } from '../js/chart-engine/normalize.js';
import { toNumber } from '../js/chart-engine/payload.js';
import { niceTicks } from '../js/chart-engine/scale.js';
import { renderChart, extractChartBlocks } from '../js/chart-engine/index.js';

const count = (html, re) => (html.match(re) || []).length;
const withTimeout = (fn, ms = 500) => {
  const t0 = performance.now();
  fn();
  assert.ok(performance.now() - t0 < ms, `took ${Math.round(performance.now() - t0)}ms`);
};

// ── Security review fixes (H1–H4, M1–M4) ──────────────────────────
test('H1: niceTicks terminates when the step is below float precision', () => {
  withTimeout(() => niceTicks(1e16, 1e16 + 2, 5));
  assert.ok(niceTicks(1e16, 1e16 + 2, 5).length <= 50);
});

test('H2: toNumber rejects very long digit strings fast', () => {
  withTimeout(() => assert.equal(toNumber('9'.repeat(50_000) + 'x'), null));
});

test('H3: oversized payloads are rejected before any regex repair', () => {
  withTimeout(() => assert.throws(() => normalizeChart('{' + "'a\\".repeat(16_000)), ChartSpecError));
});

test('H4: extreme magnitudes are dropped, never produce NaN or throw', () => {
  const html = renderChart({ type: 'column', data: [['a', 1e308], ['b', 5], ['c', 1e-320], ['d', 7]] });
  assert.ok(!html.includes('NaN'));
});

test('H4: an all-null series in a multi-line chart does not emit NaN labels', () => {
  const html = renderChart({ type: 'line', data: [['x', 'a', 'b'], ['p', 1, null], ['q', 2, null]] });
  assert.ok(!html.includes('NaN'));
});

test('M1: "n/a" in the first row is data, not a header', () => {
  const spec = normalizeChart({ data: [['Q1', 'n/a'], ['Q2', 5], ['Q3', 7]] });
  assert.deepEqual(spec.categories, ['Q1', 'Q2', 'Q3']);
});

test('M1: numeric year headers are detected as a header row', () => {
  const spec = normalizeChart({ type: 'column', data: [['Region', 2023, 2024], ['North', 10.5, 12.1], ['South', 8.2, 9.4]] });
  assert.deepEqual(spec.series.map(s => s.name), ['2023', '2024']);
  assert.deepEqual(spec.categories, ['North', 'South']);
});

test('M2: prototype keys are not valid chart types', () => {
  assert.equal(normalizeChart({ type: '__proto__', data: [['a', 1]] }).type, 'bar');
  assert.equal(normalizeChart({ type: 'constructor', data: [['a', 1]] }).type, 'bar');
});

test('M3: article text cannot forge chart placeholder tokens', () => {
  const { text, restore } = extractChartBlocks('@@BP_CHART_0@@\n<chart-data>[["A",1],["B",2]]</chart-data>');
  assert.equal(count(restore(text), /class="bp-chart"/g), 1);
});

test('M4: identical charts on one page get unique ids', () => {
  const block = '<chart-data>[["A",1],["B",2]]</chart-data>';
  const { text, restore } = extractChartBlocks(`${block}\n${block}`);
  const ids = [...restore(text).matchAll(/<figure[^>]* id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, 2);
});

test('unclosed <chart-data> never leaks raw JSON', () => {
  const { text, restore, failures } = extractChartBlocks('Intro\n<chart-data>{"type":"bar","data":[["A",1]\n\nNext para');
  assert.ok(!restore(text).includes('"type"'));
  assert.equal(failures.length, 1);
  assert.match(restore(text), /Next para/);
});

// ── Chart types (parity) ──────────────────────────────────────────
test('bar = horizontal (Google BarChart semantics), column = vertical', () => {
  assert.equal(normalizeChart({ type: 'bar', data: [['a', 1]] }).orientation, 'horizontal');
  assert.equal(normalizeChart({ type: 'column', data: [['a', 1]] }).orientation, 'vertical');
  assert.match(renderChart({ type: 'bar', data: [['Banking', 5], ['IT', 3]] }), /data-orientation="horizontal"/);
});

test('stacked bars accept Google isStacked, Chart.js scales.stacked and plain stacked', () => {
  const rows = [['V', 'Success', 'Failure'], ['A', 5, 2], ['B', 3, 1]];
  assert.equal(normalizeChart({ type: 'column', isStacked: true, data: rows }).stacked, true);
  assert.equal(normalizeChart({ type: 'bar', options: { scales: { x: { stacked: true } } }, data: rows }).stacked, true);
  const html = renderChart({ type: 'column', stacked: true, data: rows });
  assert.equal(count(html, /class="bp-bar"/g), 4);
});

test('area chart draws a filled region under each line', () => {
  const html = renderChart({ type: 'area', data: [['t', 'v'], ['a', 1], ['b', 3], ['c', 2]] });
  assert.equal(count(html, /class="bp-area"/g), 1);
  assert.equal(count(html, /class="bp-line"/g), 1);
});

test('smooth curves use cubic segments (Chart.js tension / Google curveType)', () => {
  const spec = normalizeChart({ type: 'line', curveType: 'function', data: [['a', 1], ['b', 3], ['c', 2]] });
  assert.equal(spec.curve, 'smooth');
  assert.match(renderChart(spec), /class="bp-line"[^>]* d="M[^"]*C/);
});

test('dashed forecast series via Google lineDashStyle, Chart.js borderDash or dashed', () => {
  const spec = normalizeChart({
    type: 'line',
    series: { 1: { lineDashStyle: [4, 4] } },
    data: [['Q', 'Historical', 'Forecast'], ['Q1', 5, null], ['Q2', 6, 6], ['Q3', null, 7]],
  });
  assert.equal(spec.series[1].dashed, true);
  assert.match(renderChart(spec), /stroke-dasharray="6 4"/);
});

test('Google annotation role columns become point annotations, not a series', () => {
  const spec = normalizeChart({
    type: 'line',
    data: [['Quarter', 'Historical', { type: 'string', role: 'annotation' }], ['Q1', 5.1, '5.10'], ['Q2', 6.2, '6.20']],
  });
  assert.equal(spec.series.length, 1);
  assert.equal(spec.annotate, 'all');
  assert.match(renderChart(spec), /class="bp-annotation"/);
});

test('pie hole: Google pieHole, Chart.js cutout, solid pie', () => {
  assert.equal(normalizeChart({ type: 'pie', pieHole: 0.4, data: [['a', 1], ['b', 2]] }).hole, 0.4);
  assert.equal(normalizeChart({ type: 'doughnut', options: { cutout: '70%' }, data: [['a', 1], ['b', 2]] }).hole, 0.7);
  assert.equal(normalizeChart({ type: 'pie', pieHole: 0, data: [['a', 1], ['b', 2]] }).hole, 0);
});

test('gauge from Google data + red/yellow bands', () => {
  const spec = normalizeChart({ type: 'gauge', redFrom: 75, redTo: 100, yellowFrom: 50, yellowTo: 75, data: [['Label', 'Value'], ['Risk', 82]] });
  assert.equal(spec.type, 'gauge');
  assert.equal(spec.gauges[0].value, 82);
  assert.equal(spec.gauges[0].level, 'critical');
  const html = renderChart(spec);
  assert.match(html, /class="bp-gauge"/);
  assert.match(html, />CRITICAL</);
});

test('gauge from a plain value with min/max', () => {
  const spec = normalizeChart({ type: 'gauge', label: 'INR Stress', value: 40, min: 0, max: 100, yellowFrom: 40, yellowTo: 70 });
  assert.equal(spec.gauges[0].level, 'warning');
});

test('stats cards keep pre-formatted string values', () => {
  const html = renderChart({ type: 'stats', labels: ['Market Size', 'YoY Growth'], datasets: [{ name: 'values', values: ['$340B', '23%'] }] });
  assert.equal(count(html, /class="bp-stat"/g), 2);
  assert.match(html, /\$340B/);
});

test('stats never compact author-formatted numbers; unit attaches only to bare numbers', () => {
  const html = renderChart({ type: 'stats', unit: '%', labels: ['Rounds', 'Growth'], datasets: [{ name: 'v', values: ['2,847', '23'] }] });
  assert.match(html, />2,847%</);
  assert.match(html, />23%</);
  assert.doesNotMatch(html, /2\.8K/);
});

test('comparison table keeps text cells (admin "table" type)', () => {
  const html = renderChart({
    type: 'table',
    labels: ['Speed', 'Cost'],
    datasets: [{ name: 'Provider A', values: ['Fast', 'Low'] }, { name: 'Provider B', values: ['Medium', 'Medium'] }],
  });
  assert.match(html, /<table class="bp-table"/);
  assert.match(html, /Provider B/);
  assert.match(html, /Medium/);
});

test('sparkline has no axes, markers or legend and a compact canvas', () => {
  const html = renderChart({ type: 'sparkline', data: [['t', 'a', 'b'], ['1', 3, 4], ['2', 5, 2], ['3', 4, 6]] });
  assert.doesNotMatch(html, /bp-axes|bp-legend|r="4"/);
  assert.match(html, /viewBox="0 0 640 96"/);
});

test('fixed y range from Chart.js scales.y.min/max', () => {
  const spec = normalizeChart({ type: 'line', options: { scales: { y: { min: 0, max: 100 } } }, data: [['a', 40], ['b', 60]] });
  assert.equal(spec.yMin, 0);
  assert.equal(spec.yMax, 100);
  assert.match(renderChart(spec), />100</);
});

// ── Inputs, metadata, themes, targets ─────────────────────────────
test('accepts the Chart.js config shape { data: { labels, datasets } }', () => {
  const spec = normalizeChart({ type: 'bar', data: { labels: ['A', 'B'], datasets: [{ label: 'Success', data: [5, 3] }] } });
  assert.deepEqual(spec.categories, ['A', 'B']);
  assert.equal(spec.series[0].name, 'Success');
});

test('renders name, subtitle and source citation', () => {
  const html = renderChart({ type: 'column', name: 'Fig 1: UPI Volume', title: 'UPI', subtitle: '2020-2024', source: 'Source: NPCI', data: [['2020', 1], ['2021', 2]] });
  assert.match(html, /Fig 1: UPI Volume/);
  assert.match(html, /2020-2024/);
  assert.match(html, /Source: NPCI/);
});

test('rejects placeholder data for comparisons but allows flat trend lines', () => {
  assert.throws(() => normalizeChart({ type: 'column', data: [['a', 0], ['b', 0], ['c', 0]] }), /placeholder/);
  assert.throws(() => normalizeChart({ type: 'pie', data: [['a', 5], ['b', 5], ['c', 5]] }), /placeholder/);
  assert.equal(normalizeChart({ type: 'line', data: [['Q1', 6.5], ['Q2', 6.5], ['Q3', 6.5]] }).type, 'line');
});

test('light theme renders on a white surface', () => {
  assert.match(renderChart({ theme: 'light', data: [['a', 1], ['b', 2]] }), /background:#ffffff/);
  assert.match(renderChart({ data: [['a', 1], ['b', 2]] }, { theme: 'light' }), /background:#ffffff/);
});

test('safe custom id from payload, sanitised', () => {
  assert.match(renderChart({ id: 'chart_india qoq"><x', data: [['a', 1], ['b', 2]] }), /id="chart_indiaqoqx"/);
});

test('email target: no svg or details, open data table instead', () => {
  const html = renderChart({ type: 'column', title: 'Flows', data: [['a', 1], ['b', 2]] }, { target: 'email' });
  assert.doesNotMatch(html, /<svg|<details/);
  assert.match(html, /<table/);
});
