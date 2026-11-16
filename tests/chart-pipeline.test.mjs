// Pipeline-side chart tests: the LLM-facing schema, the validator, Mermaid rescue, the
// sanitizer, and the apex template. Run: node --test tests/chart-pipeline.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHART_PROMPT_SPEC, CHART_PROMPT_EXAMPLES } from '../js/chart-engine/prompt-spec.js';
import { auditCharts, mermaidToChart, extractChartBlocks } from '../js/chart-engine/index.js';
import { validateContent } from '../scripts/lib/validator.js';
import { sanitizeJSON } from '../scripts/lib/sanitizer.js';
import { getApexTemplate } from '../scripts/lib/templates.js';
import { STRUCTURAL_RULES, CHART_SYNC_RULE } from '../scripts/lib/prompts.js';

// ── The schema shown to the LLM can never drift from the engine ──
test('every example in the LLM chart spec renders through the engine', () => {
  assert.ok(CHART_PROMPT_EXAMPLES.length >= 6);
  CHART_PROMPT_EXAMPLES.forEach(example => {
    const { failures } = auditCharts(`<chart-data>${JSON.stringify(example)}</chart-data>`);
    assert.deepEqual(failures, [], `example ${example.type} failed`);
  });
});

test('the spec text embeds the examples and forbids mermaid', () => {
  assert.match(CHART_PROMPT_SPEC, /<chart-data>/);
  assert.match(CHART_PROMPT_SPEC, /"type":"column"/);
  assert.match(CHART_PROMPT_SPEC, /never.*mermaid/i);
});

test('interactive query prompt asks for engine charts', async () => {
  const { getInteractiveQueryPrompt } = await import('../scripts/lib/prompts.js');
  const prompt = getInteractiveQueryPrompt('RBI path?', '');
  assert.doesNotMatch(prompt, /```mermaid|Mermaid/);
  assert.ok(prompt.includes(CHART_PROMPT_SPEC));
});

test('prompts no longer instruct the model to emit mermaid charts', () => {
  assert.doesNotMatch(STRUCTURAL_RULES, /must use .{0,10}mermaid/i);
  assert.doesNotMatch(CHART_SYNC_RULE, /mermaid.{0,20}chart blocks \(Min/i);
  assert.ok(CHART_SYNC_RULE.includes(CHART_PROMPT_SPEC));
});

// ── Validator uses the engine, reports every bad chart with the reason ──
test('auditCharts reports each chart with its engine error', () => {
  const text = '<chart-data>{"type":"column","data":[["A",1],["B",2]]}</chart-data>' +
    '<chart-data>{ "sentiment": [1,2], "macro": [3] }</chart-data>';
  const { count, failures } = auditCharts(text);
  assert.equal(count, 2);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].index, 1);
  assert.match(failures[0].error, /no chartable data/);
});

test('validator rejects unrenderable charts with an actionable message', () => {
  const content = '<chart-data>{ "sentiment": [1,2], "macro": [3] }</chart-data>';
  const failures = validateContent(content, { logToRL: false });
  assert.ok(failures.some(f => /CHART_REJECTED.*chart #1.*no chartable data/i.test(f)), failures.join(' | '));
});

test('validator accepts any position and multiple valid charts', () => {
  const content = 'Intro <chart-data>{"type":"column","title":"A","data":[["x",1],["y",2]]}</chart-data> middle ' +
    '<chart-data>{"type":"line","title":"B","data":[["Q1",1],["Q2",3]]}</chart-data> end';
  const failures = validateContent(content, { logToRL: false });
  assert.ok(!failures.some(f => /chart/i.test(f)), failures.join(' | '));
});

// ── Mermaid rescue: content already written with mermaid still renders ──
test('mermaid pie converts to a pie chart', () => {
  const spec = mermaidToChart('pie title Allocation\n  "Banking" : 35\n  "Tech" : 65');
  assert.equal(spec.type, 'pie');
  assert.equal(spec.title, 'Allocation');
  assert.deepEqual(spec.data, [['Banking', 35], ['Tech', 65]]);
});

test('mermaid xychart converts bars and lines into one chart', () => {
  const src = 'xychart-beta\n  title "CPI vs Repo"\n  x-axis [Q1, Q2, Q3]\n  y-axis "Percent" 0 --> 8\n  bar [5.1, 4.8, 4.4]\n  line [6.5, 6.5, 6.25]';
  const spec = mermaidToChart(src);
  assert.equal(spec.type, 'column');
  assert.equal(spec.title, 'CPI vs Repo');
  assert.deepEqual(spec.data[0], ['', 'Series 1', 'Series 2']);
  assert.deepEqual(spec.data[1], ['Q1', 5.1, 6.5]);
  assert.equal(spec.yLabel, 'Percent');
});

test('unsupported mermaid (flowcharts) is left alone', () => {
  assert.equal(mermaidToChart('graph TD; A-->B'), null);
});

test('extractChartBlocks renders mermaid chart fences and records the rescue', () => {
  const md = 'Text\n```mermaid\npie title Mix\n  "A" : 40\n  "B" : 60\n```\nMore';
  const { text, restore, rescued } = extractChartBlocks(md);
  const html = restore(text);
  assert.match(html, /class="bp-chart"/);
  assert.doesNotMatch(html, /```mermaid/);
  assert.equal(rescued, 1);
});

// ── Sanitizer must not corrupt valid chart JSON ──
test('sanitizer leaves engine-parseable chart JSON untouched (apostrophes survive)', () => {
  const block = `<chart-data>{"type":"column","title":"India's CPI","data":[["Q1",5.1],["Q2",4.8]]}</chart-data>`;
  const out = sanitizeJSON(`Body text ${'x '.repeat(10)} ${block}`);
  assert.ok(out.includes(`"India's CPI"`), out);
});

// ── Monthly apex reports render charts server-side ──
test('apex template renders charts as SVG and drops the Google Charts loader', () => {
  const html = getApexTemplate({
    title: 'Tome', excerpt: 'x', dateLabel: 'Nov 2026', fileName: 'tome.html', freq: 'monthly',
    content: 'Intro\n<chart-data>{"type":"column","title":"Flows","data":[["A",1],["B",2]]}</chart-data>',
  });
  assert.match(html, /class="bp-chart"/);
  assert.doesNotMatch(html, /gstatic\.com\/charts|google\.visualization|<chart-data/);
});

// ── Rules engine: hardening must not destroy or fabricate charts ──
import { hardenJson, injectVisuals } from '../scripts/lib/rules-engine.js';

test('hardenJson keeps apostrophes and assigns a stable per-vertical id', () => {
  const out = hardenJson(`<chart-data>{"type":"column","title":"India's CPI","data":[["Q1",5.1],["Q2",4.8]]}</chart-data>`, 'macro');
  assert.match(out, /"title":"India's CPI"/);
  assert.match(out, /"id":"chart_macro_0"/);
  assert.deepEqual(auditCharts(out).failures, []);
});

test('hardenJson wraps bare rows so the engine still detects the header row', () => {
  const out = hardenJson('<chart-data>[["Sector","Flow"],["IT",-1850],["Energy",960]]</chart-data>', 'fx');
  const { text, restore } = extractChartBlocks(out);
  const html = restore(text);
  assert.match(html, /IT/);
  assert.doesNotMatch(html, />Sector</, 'header row must not render as a category');
});

test('hardenJson leaves unparseable charts as written instead of fabricating an "Error" chart', () => {
  const broken = '<chart-data>{"type":"column", data: oops}</chart-data>';
  const out = hardenJson(broken, 'macro');
  assert.doesNotMatch(out, /"Error"|"Failure"/);
  assert.equal(auditCharts(out).failures.length, 1);
});

test('injectVisuals strips legacy Google Charts mount points instead of adding them', () => {
  const content = '<div class="card terminal-chart" id="chart_macro"></div>\n<chart-data>{"id":"chart_macro_0","type":"column","data":[["A",1],["B",2]]}</chart-data>';
  const out = injectVisuals(content, 'Macro', 'macro');
  assert.doesNotMatch(out, /terminal-chart/);
  assert.match(out, /<chart-data>/);
});

// ── Drafter and manager audit must ask for engine charts, not mermaid ──
import { getDrafterPrompt, getManagerAuditPrompt } from '../scripts/lib/prompts.js';

test('drafter prompt asks for <chart-data> charts with the spec, never mermaid', () => {
  const prompt = getDrafterPrompt('weekly', 'brief', 'Macro');
  assert.doesNotMatch(prompt, /```mermaid|Mermaid/, 'only lowercase prohibitions ("never use mermaid") may remain');
  assert.ok(prompt.includes(CHART_PROMPT_SPEC));
});

test('manager audit checks for engine charts instead of failing manuscripts without mermaid', () => {
  const prompt = getManagerAuditPrompt('manuscript', 'Macro');
  assert.doesNotMatch(prompt, /MERMAID CHART/i);
  assert.match(prompt, /<chart-data>/);
});

test('sanitizer keeps content between 1,000 and 2,000 characters intact (was truncated at 1,000)', () => {
  const content = `Intro ${'word '.repeat(250)}\n<chart-data>{"type":"column","title":"T","data":[["A",1],["B",2]]}</chart-data>\nEnd marker`;
  assert.ok(content.length > 1000 && content.length < 2000);
  const out = sanitizeJSON(content);
  assert.match(out, /<chart-data>/);
  assert.match(out, /End marker$/);
});
