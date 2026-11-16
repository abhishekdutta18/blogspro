// Mobile + interaction: a narrow SVG variant for small containers, two-line label wrapping,
// and the progressive-enhancement runtime (tap tooltips, line crosshair) inlined once per page.
// Run: node --test tests/chart-engine-mobile.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderChart, extractChartBlocks, CHART_PROMPT_EXAMPLES, chartPageAssets } from '../js/chart-engine/index.js';
import { renderBody } from '../scripts/lib/templates.js';

const CHAR_WIDTH = 0.6; // average glyph width as a share of font size (generous for digits/caps)

/** The SVG inside the wrapper with the given class (bp-wide | bp-narrow), or null. */
function svgIn(html, cls) {
  const m = html.match(new RegExp(`<div class="${cls}"[^>]*>(<svg[\\s\\S]*?</svg>)</div>`));
  return m ? m[1] : null;
}

const viewBoxWidth = svg => Number(svg.match(/viewBox="0 0 ([\d.]+) [\d.]+"/)[1]);

const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Horizontal extent of every top-level <text> (rotated axis titles live in a transform and are skipped). */
function textExtents(svg) {
  const unrotated = svg.replace(/<g transform="[^"]*rotate[\s\S]*?<\/g>/g, '');
  return [...unrotated.matchAll(/<text[^>]* x="([-\d.]+)"[^>]* font-size="(\d+)"[^>]* text-anchor="(\w+)"[^>]*>([^<]*)<\/text>/g)]
    .map(([, x, size, anchor, content]) => {
      const w = decode(content).length * Number(size) * CHAR_WIDTH;
      const left = anchor === 'start' ? Number(x) : anchor === 'end' ? Number(x) - w : Number(x) - w / 2;
      return { content: decode(content), left, right: left + w };
    });
}

const SVG_EXAMPLES = CHART_PROMPT_EXAMPLES.filter(e => !['stats', 'table'].includes(e.type));

// ── Narrow variant ──
test('cartesian, pie and gauge charts ship a wide and a narrow SVG', () => {
  for (const example of SVG_EXAMPLES) {
    const html = renderChart(example);
    assert.ok(svgIn(html, 'bp-wide'), `${example.type}: wide svg`);
    assert.equal(viewBoxWidth(svgIn(html, 'bp-narrow')), 360, `${example.type}: narrow svg is 360 wide`);
  }
});

test('only the wide SVG is visible without page CSS (RSS readers, CSS-stripping clients)', () => {
  const html = renderChart(CHART_PROMPT_EXAMPLES[0]);
  assert.match(html, /<div class="bp-narrow" style="display:none">/);
  assert.doesNotMatch(html, /<div class="bp-wide"[^>]*display:none/);
});

test('sparklines stay a single SVG (no text to protect)', () => {
  const html = renderChart({ type: 'line', sparkline: true, data: [['a', 1], ['b', 3], ['c', 2]] });
  assert.equal(svgIn(html, 'bp-narrow'), null);
  assert.equal((html.match(/<svg /g) || []).length, 1);
});

test('the two SVGs never share an element id', () => {
  const html = renderChart(CHART_PROMPT_EXAMPLES[2]);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids}`);
});

test('no label is clipped by the canvas edge, in either layout', () => {
  for (const example of SVG_EXAMPLES) {
    const html = renderChart(example);
    for (const cls of ['bp-wide', 'bp-narrow']) {
      const svg = svgIn(html, cls);
      const width = viewBoxWidth(svg);
      for (const t of textExtents(svg)) {
        assert.ok(t.left >= -1 && t.right <= width + 1, `${example.type}/${cls}: "${t.content}" spans ${Math.round(t.left)}–${Math.round(t.right)} of ${width}`);
      }
    }
  }
});

test('a narrow pie puts its legend below the donut, not beside it', () => {
  const svg = svgIn(renderChart(CHART_PROMPT_EXAMPLES[3]), 'bp-narrow');
  const ringBottom = Math.max(...[...svg.matchAll(/<circle class="bp-slice" cx="[\d.]+" cy="([\d.]+)" r="([\d.]+)" fill="none" stroke="[^"]+" stroke-width="([\d.]+)"/g)]
    .map(([, cy, r, w]) => Number(cy) + Number(r) + Number(w) / 2));
  const legendSection = svg.slice(svg.indexOf('<g class="bp-legend">'));
  const legendTop = Math.min(...[...legendSection.matchAll(/<rect x="[\d.]+" y="([\d.]+)"/g)].map(m => Number(m[1])));
  assert.ok(legendTop > ringBottom, `legend top ${legendTop} should be below donut bottom ${ringBottom}`);
});

test('a long legend wraps onto more rows instead of running off the canvas', () => {
  const names = ['Large-cap banks', 'Mid-cap pharma', 'Small-cap IT', 'PSU energy', 'Auto ancillaries'];
  const data = [['Q', ...names], ['Q1', 1, 2, 3, 4, 5], ['Q2', 2, 3, 4, 5, 6]];
  const svg = svgIn(renderChart({ type: 'column', legend: true, data }), 'bp-narrow');
  const legend = svg.match(/<g class="bp-legend">([\s\S]*?)<\/g>/)[1];
  const rows = new Set([...legend.matchAll(/<text[^>]* y="([\d.]+)"/g)].map(m => m[1]));
  assert.ok(rows.size >= 2, 'legend should wrap to at least two rows');
});

// ── Label wrapping ──
test('long column labels wrap to two lines instead of truncating', () => {
  const html = renderChart({ type: 'column', data: [['Sector', 'Flow'], ['Financial Services', 4], ['Information Technology', 3], ['Energy', 2]] });
  const svg = svgIn(html, 'bp-wide');
  assert.match(svg, />Financial</);
  assert.match(svg, />Services</);
  assert.doesNotMatch(svg, /Financial…/);
});

test('long horizontal-bar labels wrap to two lines inside the category gutter', () => {
  const svg = svgIn(renderChart({ type: 'bar', data: [['Sector', 'Flow'], ['Banking & Financial Services', 4], ['IT', 3]] }), 'bp-wide');
  assert.match(svg, />Banking &amp;</);
  assert.match(svg, />Financial Serv/);
});

// ── Interaction hooks ──
test('line charts expose the crosshair geometry and per-point hooks for the runtime', () => {
  const svg = svgIn(renderChart(CHART_PROMPT_EXAMPLES[2]), 'bp-wide');
  assert.match(svg, /<g class="bp-crosshair" data-x="[\d.,]+" data-top="[\d.]+" data-bottom="[\d.]+"><\/g>/);
  assert.match(svg, /<circle[^>]*data-i="0"[^>]*data-cat="Q1-25"[^>]*data-label="Actual: 4\.8%"/);
});

test('figures carry their ink color so tooltips match the theme', () => {
  assert.match(renderChart(CHART_PROMPT_EXAMPLES[0], { theme: 'light' }), /<figure class="bp-chart"[^>]*data-ink="#[0-9a-f]{6}"/i);
});

// ── Page runtime ──
test('chartPageAssets inlines the container-query CSS and the enhancement script', () => {
  const assets = chartPageAssets();
  assert.match(assets, /@container/);
  assert.match(assets, /<script>\(function enhanceCharts/);
  assert.doesNotMatch(assets.slice(assets.indexOf('<script>') + 8), /<\/script>[\s\S]*<\/script>/, 'one script element only');
});

test('renderBody adds the page runtime once on the web, never in email or chart-free pages', () => {
  const chart = `<chart-data>${JSON.stringify(CHART_PROMPT_EXAMPLES[0])}</chart-data>`;
  const web = renderBody(`Intro\n\n${chart}\n\n${chart}`);
  assert.equal((web.match(/<script>\(function enhanceCharts/g) || []).length, 1);
  assert.doesNotMatch(renderBody(`Intro\n\n${chart}`, { target: 'email' }), /<script|@container/);
  assert.doesNotMatch(renderBody('Just text, no charts.'), /<script|@container/);
});

test('extractChartBlocks reports how many charts it rendered', () => {
  const chart = `<chart-data>${JSON.stringify(CHART_PROMPT_EXAMPLES[0])}</chart-data>`;
  assert.equal(extractChartBlocks(`${chart}\n\n<chart-data>{bad</chart-data>`).count, 1);
});

test('value-axis labels on a narrow horizontal bar never overlap each other', () => {
  const svg = svgIn(renderChart(CHART_PROMPT_EXAMPLES[1]), 'bp-narrow');
  const axis = svg.match(/<g class="bp-axes">([\s\S]*?)<\/g>/)[1];
  const ticks = textExtents(axis).filter(t => /₹/.test(t.content)).sort((a, b) => a.left - b.left);
  assert.ok(ticks.length >= 2, 'keeps at least two labels');
  ticks.slice(1).forEach((t, k) => assert.ok(t.left >= ticks[k].right + 4, `"${ticks[k].content}" overlaps "${t.content}"`));
});
