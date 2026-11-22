// New chart forms: waterfall, heatmap, candlestick/OHLC, and a true time axis for line charts.
// Run: node --test tests/chart-engine-forms.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderChart, normalizeChart, ChartSpecError, DARK_THEME, LIGHT_THEME, CHART_PROMPT_EXAMPLES } from '../js/chart-engine/index.js';
import { timeTicks, parseIsoDate } from '../js/chart-engine/time.js';

const wideSvg = html => html.split('<div class="bp-narrow"')[0];
const narrowSvg = html => html.split('<div class="bp-narrow"')[1] ?? '';
const attrs = (html, cls, attr) => [...html.matchAll(new RegExp(`class="${cls}"[^>]*? ${attr}="([^"]+)"`, 'g'))].map(m => m[1]);

/** WCAG relative luminance of #rrggbb. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// ── Waterfall ──
const bridge = {
  type: 'waterfall', title: 'Nifty earnings bridge', unit: '₹Cr', totals: ['FY24', 'FY25'],
  data: [['Step', 'Change'], ['FY24', 1000], ['Banks', 240], ['IT', -90], ['Energy', 60], ['FY25', null]],
};

test('waterfall resolves totals to running levels', () => {
  const spec = normalizeChart(bridge);
  assert.equal(spec.type, 'waterfall');
  assert.deepEqual(spec.totals, [true, false, false, false, true]);
  assert.deepEqual(spec.series[0].values, [1000, 240, -90, 60, 1210]);
});

test('a waterfall total with a value resets the running level (opening balances)', () => {
  const spec = normalizeChart({ ...bridge, data: [['Step', 'Change'], ['Open', 500], ['A', 50], ['Restated', 600], ['B', -20]], totals: ['Open', 'Restated'] });
  assert.deepEqual(spec.series[0].values, [500, 50, 600, -20]);
});

test('waterfall steps float between running levels, colored by sign, totals neutral', () => {
  const html = wideSvg(renderChart(bridge, { theme: 'light' }));
  const fills = attrs(html, 'bp-step', 'fill');
  assert.deepEqual(fills, [LIGHT_THEME.textMuted, LIGHT_THEME.positive, LIGHT_THEME.negative, LIGHT_THEME.positive, LIGHT_THEME.textMuted]);
  assert.equal((html.match(/class="bp-connector"/g) || []).length, 4);
  assert.match(html, />\+₹240Cr</);
  assert.match(html, />-₹90Cr</);
  assert.match(html, />₹1,210Cr</);
});

test('waterfall step tops follow the running total', () => {
  const html = wideSvg(renderChart(bridge));
  const ys = [...html.matchAll(/class="bp-step" x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/g)].map(m => [Number(m[1]), Number(m[2])]);
  // Banks rises from the FY24 top; IT falls from the Banks top (its rect starts at the higher level).
  assert.ok(Math.abs(ys[1][0] + ys[1][1] - ys[0][0]) < 0.2, 'Banks starts at the FY24 level');
  assert.ok(Math.abs(ys[2][0] - ys[1][0]) < 0.2, 'IT starts at the Banks level');
});

// ── Heatmap ──
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const returns = {
  type: 'heatmap', title: 'Nifty monthly returns', unit: '%',
  data: [['Year', ...MONTHS], ['2023', -2.4, -2, 0.3, 4.1, 2.6, 3.5, 2.9, -2.5, 2, -2.8, 5.5, 7.9], ['2024', -0.03, 1.2, 1.6, 1.2, -0.3, 6.6, 3.9, 1.1, 2.3, -6.2, -0.3, -2]],
};

test('a heatmap keeps all twelve month columns (the six-series cap is for colored series)', () => {
  const spec = normalizeChart(returns);
  assert.equal(spec.type, 'heatmap');
  assert.equal(spec.series.length, 12);
  assert.equal((wideSvg(renderChart(returns)).match(/class="bp-cell"/g) || []).length, 24);
});

test('mixed-sign heatmaps diverge (red losses, blue gains); single-sign ones are one hue', () => {
  const html = wideSvg(renderChart(returns, { theme: 'light' }));
  const fill = label => html.match(new RegExp(`class="bp-cell"[^>]* fill="(#[0-9a-f]{6})"[^>]*><title>${label}</title>`))[1];
  const [r1, , b1] = [1, 3, 5].map(i => parseInt(fill('2023 · Dec: 7.9%').slice(i, i + 2), 16));
  const [r2, , b2] = [1, 3, 5].map(i => parseInt(fill('2024 · Oct: -6.2%').slice(i, i + 2), 16));
  assert.ok(b1 > r1, 'gain is blue');
  assert.ok(r2 > b2, 'loss is red');
  const levels = { type: 'heatmap', data: [['Row', 'A', 'B', 'C'], ['x', 1, 5, 9]] };
  const fills = attrs(wideSvg(renderChart(levels, { theme: 'light' })), 'bp-cell', 'fill');
  const lum = fills.map(luminance);
  assert.ok(lum[0] > lum[1] && lum[1] > lum[2], 'light theme: larger = darker');
  const darkLum = attrs(wideSvg(renderChart(levels, { theme: 'dark' })), 'bp-cell', 'fill').map(luminance);
  assert.ok(darkLum[0] < darkLum[1] && darkLum[1] < darkLum[2], 'dark theme: larger = brighter');
});

test('every heatmap value label meets 4.5:1 contrast on its own cell', () => {
  for (const theme of ['light', 'dark']) {
    const html = wideSvg(renderChart(returns, { theme }));
    const pairs = [...html.matchAll(/class="bp-cell"[^>]* fill="(#[0-9a-f]{6})"[\s\S]*?<text class="bp-cell-label"[^>]* fill="(#[0-9a-f]{6})"/g)];
    assert.ok(pairs.length > 0, `${theme}: labels drawn`);
    pairs.forEach(([, cell, ink]) => assert.ok(contrast(cell, ink) >= 4.5, `${theme}: ${ink} on ${cell} = ${contrast(cell, ink).toFixed(2)}`));
  }
});

test('narrow heatmaps drop value labels that would not fit their cells', () => {
  const narrow = narrowSvg(renderChart(returns));
  assert.match(narrow, /class="bp-cell"/);
  assert.doesNotMatch(narrow, /class="bp-cell-label"/);
});

test('heatmaps ship a color key and draw missing values as empty cells', () => {
  const html = wideSvg(renderChart({ type: 'heatmap', data: [['Row', 'A', 'B'], ['x', 1, null], ['y', 3, 4]] }));
  assert.match(html, /class="bp-color-key"/);
  assert.match(html, /<title>x · B: no data<\/title>/);
});

// ── Candlestick / OHLC ──
const candles = {
  type: 'candlestick', title: 'Nifty 50, week of 10 Nov', unit: '',
  data: [['Date', 'Open', 'High', 'Low', 'Close'], ['2025-11-10', 25500, 25700, 25450, 25690], ['2025-11-11', 25690, 25720, 25520, 25560], ['2025-11-12', 25560, 25900, 25540, 25870]],
};

test('candles color by direction with the polarity pair, bodies between open and close', () => {
  const html = wideSvg(renderChart(candles, { theme: 'dark' }));
  assert.deepEqual(attrs(html, 'bp-candle', 'fill'), [DARK_THEME.positive, DARK_THEME.negative, DARK_THEME.positive]);
  assert.equal((html.match(/class="bp-wick"/g) || []).length, 3);
  assert.match(html, /<title>2025-11-11 · O 25,690 · H 25,720 · L 25,520 · C 25,560<\/title>/);
});

test('a price axis does not start at zero', () => {
  const html = wideSvg(renderChart(candles));
  assert.doesNotMatch(html, />0</);
});

test('candlestick rows where the high is below the open or close are rejected', () => {
  const bad = { ...candles, data: [['Date', 'Open', 'High', 'Low', 'Close'], ['d1', 100, 99, 90, 95]] };
  assert.throws(() => normalizeChart(bad), err => err instanceof ChartSpecError && /high/.test(err.message));
});

test('ohlc draws open/close ticks instead of bodies', () => {
  const html = wideSvg(renderChart({ ...candles, type: 'ohlc' }));
  assert.equal((html.match(/class="bp-candle"/g) || []).length, 0);
  assert.equal((html.match(/class="bp-ohlc"/g) || []).length, 3);
});

test('candlestick date labels are shortened, never raw ISO strings', () => {
  const html = wideSvg(renderChart(candles));
  assert.match(html, />10 Nov</);
  assert.doesNotMatch(html, />2025-11-10</);
});

// ── Time axis ──
test('ISO dates parse strictly', () => {
  assert.equal(parseIsoDate('2025-02-28'), Date.UTC(2025, 1, 28));
  assert.equal(parseIsoDate('2025-03'), Date.UTC(2025, 2, 1));
  assert.equal(parseIsoDate('2025-02-30'), null);
  assert.equal(parseIsoDate('Q1-25'), null);
});

test('time ticks pick a calendar unit that fits', () => {
  const months = timeTicks(Date.UTC(2025, 0, 15), Date.UTC(2025, 11, 1), 8);
  assert.ok(months.length <= 8 && months.length >= 3);
  assert.ok(months.every(t => /^[A-Z][a-z]{2} '25$/.test(t.label)), months.map(t => t.label).join());
  const years = timeTicks(Date.UTC(2005, 0, 1), Date.UTC(2025, 0, 1), 6);
  assert.ok(years.every(t => /^\d{4}$/.test(t.label)));
  const days = timeTicks(Date.UTC(2025, 10, 3), Date.UTC(2025, 10, 14), 6);
  assert.ok(days.every(t => /^\d{1,2} Nov$/.test(t.label)));
});

const uneven = { type: 'line', unit: '%', data: [['Date', 'Repo'], ['2025-06-06', 5.5], ['2025-02-07', 6.25], ['2025-04-09', 6], ['2025-12-05', 5.25]] };

test('dated line charts place points by time and sort them', () => {
  const spec = normalizeChart(uneven);
  assert.deepEqual(spec.categories, ['2025-02-07', '2025-04-09', '2025-06-06', '2025-12-05']);
  const xs = [...wideSvg(renderChart(uneven)).matchAll(/<circle cx="([\d.]+)" cy="[\d.]+" r="9"/g)].map(m => Number(m[1]));
  const gap = (a, b) => xs[b] - xs[a];
  // Feb 7 → Apr 9 is 61 days, Jun 6 → Dec 5 is 182 days.
  assert.ok(Math.abs(gap(2, 3) / gap(0, 1) - 182 / 61) < 0.05, `spacing ratio ${gap(2, 3) / gap(0, 1)}`);
  assert.doesNotMatch(wideSvg(renderChart(uneven)), />2025-02-07</, 'axis shows calendar ticks, not raw dates');
});

test('categories that are not all dates keep even spacing', () => {
  const spec = normalizeChart({ type: 'line', data: [['Q', 'V'], ['2025-01-01', 1], ['Q2', 2], ['2025-09-01', 3]] });
  assert.equal(spec.times, null);
});

// ── Prompt examples ──
test('the prompt examples include each new form', () => {
  const types = CHART_PROMPT_EXAMPLES.map(e => e.type);
  for (const t of ['waterfall', 'heatmap', 'candlestick']) assert.ok(types.includes(t), t);
});

test('value-axis labels never repeat, even for tight ranges at large magnitudes (Nifty 25,600 / 25,650)', () => {
  const html = wideSvg(renderChart({ type: 'line', data: [['D', 'Nifty'], ['a', 25610], ['b', 25690], ['c', 25640]] }));
  const axis = html.match(/<g class="bp-axes">([\s\S]*?)<\/g>/)[1];
  const labels = [...axis.matchAll(/text-anchor="end"[^>]*>([^<]+)</g)].map(m => m[1]);
  assert.ok(labels.length >= 3);
  assert.equal(new Set(labels).size, labels.length, `duplicate tick labels: ${labels}`);
});

test('a price axis prints full digits ("25,600"), never compact "25.6K"', () => {
  const html = wideSvg(renderChart(candles));
  const axis = html.match(/<g class="bp-axes">([\s\S]*?)<\/g>/)[1];
  assert.match(axis, />25,\d00</);
  assert.doesNotMatch(axis, /\dK</);
});

test('a missing heatmap cell is an outline, never a fill that could read as zero', () => {
  const html = wideSvg(renderChart({ type: 'heatmap', data: [['Row', 'A', 'B'], ['x', -1, null], ['y', 3, 4]] }));
  assert.match(html, /<rect class="bp-cell"[^>]* fill="none" stroke="[^"]+" stroke-dasharray="2 2"><title>x · B: no data<\/title>/);
});

// ── Step curve (policy rates hold until the next decision) ──
const repo = { type: 'line', curve: 'step', unit: '%', data: [['Date', 'Repo'], ['2025-02-07', 6.25], ['2025-04-09', 6], ['2025-06-06', 5.5]] };

test('step curves accept ours, Chart.js stepped and Google-style aliases', () => {
  assert.equal(normalizeChart(repo).curve, 'step');
  assert.equal(normalizeChart({ ...repo, curve: undefined, stepped: true }).curve, 'step');
  assert.equal(normalizeChart({ ...repo, curve: undefined, options: { elements: { line: { stepped: true } } } }).curve, 'step');
  assert.equal(normalizeChart({ ...repo, curve: undefined, data: { labels: ['a', 'b'], datasets: [{ data: [1, 2], stepped: 'before' }] } }).curve, 'step');
});

test('a step line holds each value flat until the next point, then moves vertically', () => {
  const d = wideSvg(renderChart(repo)).match(/class="bp-line"[^>]* d="([^"]+)"/)[1];
  assert.match(d, /^M[\d.]+,[\d.]+H[\d.]+V[\d.]+H[\d.]+V[\d.]+$/, d);
  assert.doesNotMatch(d, /[LC]/);
});

test('a stepped area closes back to the baseline', () => {
  const d = wideSvg(renderChart({ ...repo, type: 'area' })).match(/class="bp-area" d="([^"]+)"/)[1];
  assert.match(d, /H[\d.]+V[\d.]+L[\d.]+,[\d.]+L[\d.]+,[\d.]+Z$/);
});

// ── Shapes models write naturally (from the dist/ corpus audit) ──
test('data written as a name -> value map becomes rows', () => {
  const spec = normalizeChart({ type: 'pie', title: 'Scenario weights', data: { 'Base Case': 40, 'Extreme Bull': 30, 'Tail Risk Bear': 30 } });
  assert.deepEqual(spec.categories, ['Base Case', 'Extreme Bull', 'Tail Risk Bear']);
  assert.deepEqual(spec.series[0].values, [40, 30, 30]);
});

test('a map of maps with the same keys becomes one series per outer key', () => {
  const spec = normalizeChart({
    type: 'column',
    data: { 'Swarm sentiment': { baseCase: 0, extremeBull: 20, tailRiskBear: 80 }, 'Scenario weights': { baseCase: 30, extremeBull: 40, tailRiskBear: 30 } },
  });
  assert.deepEqual(spec.categories, ['baseCase', 'extremeBull', 'tailRiskBear']);
  assert.deepEqual(spec.series.map(s => s.name), ['Swarm sentiment', 'Scenario weights']);
  assert.deepEqual(spec.series[1].values, [30, 40, 30]);
});

test('a bare top-level map of numeric maps (no "data" key) is read the same way', () => {
  const raw = '{"swarmConsensusSentiment":{"baseCase":0,"extremeBull":20,"tailRiskBear":80},"scenarioProbabilityWeights":{"baseCase":30,"extremeBull":40,"tailRiskBear":30}}';
  assert.equal(normalizeChart(raw).series.length, 2);
});

test('ambiguous maps (a scalar beside a map, or mismatched keys) are rejected, not guessed', () => {
  assert.throws(() => normalizeChart({ data: { sentiment: 75, weights: { base: 40, bull: 30 } } }), ChartSpecError);
  assert.throws(() => normalizeChart({ data: { a: { x: 1, y: 2 }, b: { x: 1, z: 2 } } }), ChartSpecError);
});

test('a map cannot smuggle prototype keys or unbounded rows', () => {
  const spec = normalizeChart(JSON.parse('{"data":{"__proto__":5,"a":1,"b":2}}'));
  assert.ok(!Object.prototype.polluted);
  assert.ok(spec.categories.length <= 3);
  const huge = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, i + 1]));
  assert.ok(normalizeChart({ data: huge }).categories.length <= 60);
});

test('<br> line breaks inserted by an upstream HTML step do not break chart JSON', async () => {
  const { extractChartBlocks } = await import('../js/chart-engine/index.js');
  const md = '<chart-data><br>{<br>  "type": "pie",<br>  "data": [["A", 40], ["B", 60]]<br>}<br></chart-data>';
  const { failures, count } = extractChartBlocks(md);
  assert.equal(failures.length, 0, failures[0]?.error);
  assert.equal(count, 1);
});
