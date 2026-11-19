// Failure resistance: an engine bug must cost readers as little as possible (narrow layout →
// wide only → data table), never ship invisible NaN geometry, and never flood error reporting
// from the browser runtime. A seeded fuzz pass guards the contract "invalid input is rejected
// with ChartSpecError; everything else renders".
// Run: node --test tests/chart-engine-resilience.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderChart, extractChartBlocks, enhanceCharts, CHART_PROMPT_EXAMPLES, ChartSpecError } from '../js/chart-engine/index.js';
import { hasBrokenGeometry, renderLayers } from '../js/chart-engine/degrade.js';

// ── Geometry guard ──
test('non-finite numbers in geometry attributes are detected', () => {
  assert.equal(hasBrokenGeometry('<rect x="10" width="NaN" height="4"/>'), true);
  assert.equal(hasBrokenGeometry('<path d="M0,0L10,Infinity"/>'), true);
  assert.equal(hasBrokenGeometry('<circle cx="-Infinity" cy="2" r="3"/>'), true);
});

test('the text "NaN" in labels, titles or data attributes is not mistaken for broken geometry', () => {
  assert.equal(hasBrokenGeometry('<text x="4" y="8">NaN</text><circle cx="1" cy="2" r="3" data-cat="NaN" data-label="NaN: 4"/>'), false);
});

// ── Degradation ladder ──
const boom = () => { throw new TypeError('renderer bug'); };

test('both layouts render: the wide/narrow pair is returned and nothing is reported', () => {
  const reports = [];
  const out = renderLayers({ wide: () => '<svg>w</svg>', narrow: () => '<svg>n</svg>' }, r => reports.push(r));
  assert.deepEqual(out, { wide: '<svg>w</svg>', narrow: '<svg>n</svg>' });
  assert.deepEqual(reports, []);
});

test('a failing narrow layout falls back to the wide one and is reported', () => {
  const reports = [];
  const out = renderLayers({ wide: () => '<svg>w</svg>', narrow: boom }, r => reports.push(r));
  assert.deepEqual(out, { wide: '<svg>w</svg>', narrow: null });
  assert.deepEqual(reports, [{ stage: 'narrow', error: 'TypeError: renderer bug' }]);
});

test('NaN geometry counts as a failure, not as output', () => {
  const reports = [];
  const out = renderLayers({ wide: () => '<svg><rect width="NaN"/></svg>', narrow: () => '<svg>n</svg>' }, r => reports.push(r));
  assert.equal(out, null);
  assert.equal(reports[0].stage, 'wide');
  assert.match(reports[0].error, /non-finite/);
});

test('a failing wide layout gives up on SVG entirely (caller shows the data table)', () => {
  const reports = [];
  assert.equal(renderLayers({ wide: boom, narrow: () => '<svg>n</svg>' }, r => reports.push(r)), null);
  assert.deepEqual(reports.map(r => r.stage), ['wide']);
});

test('extractChartBlocks reports no degradation for healthy charts', () => {
  const page = CHART_PROMPT_EXAMPLES.map(e => `<chart-data>${JSON.stringify(e)}</chart-data>`).join('\n\n');
  const result = extractChartBlocks(page);
  assert.deepEqual(result.degraded, []);
  assert.equal(result.failures.length, 0);
});

// ── Seeded fuzz: the engine's contract under hostile input ──
const VALUES = [0, -1, 1e-12, 1e15, -1e300, 5e-324, null, 'NaN', 'Infinity', '', '₹4,210', true, [], {}, 2 ** 53];
const LABELS = ['', 'a'.repeat(300), '<script>x</script>', '2025-02-30', '2025-11-10', 'Q1', 'Q1', '‮'];
const TYPES = ['column', 'bar', 'line', 'area', 'pie', 'gauge', 'waterfall', 'heatmap', 'candlestick', 'ohlc', 'stats', 'table', 'mystery'];
const OPTIONS = [['stacked', true], ['horizontal', true], ['curve', 'step'], ['unit', '₹'], ['references', [{ value: 1e300 }]], ['references', [{ from: 5, to: 2 }]], ['totals', ['nope']], ['min', 1e20], ['sparkline', true]];

function* hostileInputs(count) {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pick = list => list[Math.floor(rnd() * list.length)];
  for (let i = 0; i < count; i++) {
    const ex = JSON.parse(JSON.stringify(pick(CHART_PROMPT_EXAMPLES)));
    if (Array.isArray(ex.data) && ex.data.length > 1) {
      const row = 1 + Math.floor(rnd() * (ex.data.length - 1));
      ex.data[row] = ex.data[row].map((c, j) => (j === 0 ? (rnd() < 0.3 ? pick(LABELS) : c) : rnd() < 0.5 ? pick(VALUES) : c));
    }
    if (rnd() < 0.4) ex.type = pick(TYPES);
    if (rnd() < 0.5) { const [k, v] = pick(OPTIONS); ex[k] = v; }
    yield ex;
  }
}

test('hostile input is either rejected with ChartSpecError or renders without broken geometry', () => {
  let rendered = 0;
  for (const input of hostileInputs(600)) {
    try {
      const html = renderChart(input);
      assert.equal(hasBrokenGeometry(html), false, `broken geometry for ${JSON.stringify(input).slice(0, 200)}`);
      rendered += 1;
    } catch (err) {
      assert.ok(err instanceof ChartSpecError, `engine bug (${err}) for ${JSON.stringify(input).slice(0, 200)}`);
    }
  }
  assert.ok(rendered > 100, `only ${rendered} of 600 rendered — the fuzz is not exercising renderers`);
});

// ── Browser runtime: one error disables it once instead of firing on every pointer move ──
function fakeDocument() {
  const attrs = new Map();
  const listeners = new Map();
  const reported = [];
  const doc = {
    documentElement: {
      hasAttribute: k => attrs.has(k),
      setAttribute: (k, v) => attrs.set(k, v),
      getAttribute: k => attrs.get(k) ?? null,
    },
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    removeEventListener: (type, fn) => listeners.set(type, (listeners.get(type) ?? []).filter(f => f !== fn)),
    defaultView: { reportError: err => reported.push(err) },
  };
  const fire = (type, event) => (listeners.get(type) ?? []).forEach(fn => fn(event));
  return { doc, attrs, listeners, reported, fire };
}

test('a runtime error is reported once, then the runtime switches itself off', () => {
  const { doc, attrs, listeners, reported, fire } = fakeDocument();
  enhanceCharts(doc);
  const exploding = { type: 'pointermove', pointerType: 'mouse', target: { closest: () => { throw new Error('dom bug'); } } };
  fire('pointermove', exploding);
  fire('pointermove', exploding);
  fire('pointerdown', { ...exploding, type: 'pointerdown' });
  assert.equal(reported.length, 1);
  assert.match(String(reported[0]), /dom bug/);
  assert.equal(attrs.get('data-bp-charts'), 'off');
  assert.equal([...listeners.values()].flat().length, 0, 'all listeners removed');
});

test('switching off puts native <title> tooltips back on marks the runtime had prepared', () => {
  const { doc, fire } = fakeDocument();
  const markAttrs = new Map([['data-tip', 'FY25 RE: 4.8%'], ['aria-label', 'FY25 RE: 4.8%']]);
  const prepended = [];
  const mark = {
    getAttribute: k => markAttrs.get(k) ?? null,
    removeAttribute: k => markAttrs.delete(k),
    prepend: node => prepended.push(node),
  };
  const svgAttrs = new Set(['data-bp-ready']);
  const svg = { removeAttribute: k => svgAttrs.delete(k), querySelectorAll: () => [mark] };
  doc.querySelectorAll = sel => (sel === 'svg[data-bp-ready]' ? [svg] : []);
  doc.createElementNS = (ns, tag) => ({ ns, tag, textContent: '' });
  enhanceCharts(doc);
  fire('pointermove', { type: 'pointermove', pointerType: 'mouse', target: { closest: () => { throw new Error('dom bug'); } } });
  assert.deepEqual(prepended.map(n => [n.tag, n.textContent]), [['title', 'FY25 RE: 4.8%']]);
  assert.equal(markAttrs.has('data-tip'), false);
  assert.equal(markAttrs.get('aria-label'), 'FY25 RE: 4.8%', 'aria-label stays for screen readers');
  assert.equal(svgAttrs.has('data-bp-ready'), false);
});

test('browser degradations are warned and breadcrumbed, never raised as Sentry events', async () => {
  const { browserDegradeReporter } = await import('../js/chart-engine/browser.js');
  const warned = [];
  const crumbs = [];
  const original = console.warn;
  console.warn = (...args) => warned.push(args.join(' '));
  try {
    browserDegradeReporter('chart-builder', { trackEvent: (name, data) => crumbs.push([name, data]) })({ stage: 'narrow', error: 'TypeError: x' });
    browserDegradeReporter('chart-builder', {})({ stage: 'wide', error: 'RangeError: y' }); // no Sentry on the page
  } finally {
    console.warn = original;
  }
  assert.equal(warned.length, 2);
  assert.match(warned[0], /engine defect.*narrow.*TypeError: x/);
  assert.deepEqual(crumbs, [['chart_degraded', { stage: 'narrow', error: 'TypeError: x', source: 'chart-builder' }]]);
});

// ── Page-build telemetry: degraded charts are engine defects, not content problems ──
test('degraded charts are logged as engine defects with the stage that failed', async () => {
  const { reportChartDegradations } = await import('../scripts/lib/chart-telemetry.js');
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    reportChartDegradations([{ index: 2, stage: 'narrow', error: 'TypeError: x is undefined' }], { target: 'web' });
  } finally {
    console.error = original;
  }
  assert.equal(logged.length, 1);
  assert.match(logged[0], /chart #3/);
  assert.match(logged[0], /narrow/);
  assert.match(logged[0], /TypeError: x is undefined/);
});
