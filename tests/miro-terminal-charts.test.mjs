// Tests for scripts/lib/miro-terminal-charts.js — server-side charts for the MiroSync swarm terminal.
// Run: node --test tests/miro-terminal-charts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTerminalCharts } from '../scripts/lib/miro-terminal-charts.js';

const job = {
  trace: [
    { stepId: 'swarm_ingest', duration: 420 },
    { stepId: 'swarm_debate', duration: 1310 },
    { stepId: 'swarm_noduration' },
    { stepId: 'swarm_audit', duration: 610 },
  ],
  disagreementHeatmap: [{ p1: 'Macro', p2: 'Quant', variance: 0.42 }, { p1: 'Macro', p2: 'Risk', variance: 0.17 }],
  consensusTimeline: [{ step: 1, alignment: 0.4 }, { step: 2, alignment: 0.62 }, { step: 3, alignment: 0.81 }],
  swarmSentiment: 64,
  ghostProjection: { telemetry: { swarmSentiment: 38 } },
};

test('renders all four panels for a complete job', () => {
  const charts = renderTerminalCharts(job);
  assert.match(charts.latency, /data-chart-type="line"/);
  assert.match(charts.heatmap, /<table class="bp-table"/);
  assert.match(charts.timeline, /data-chart-type="line"/);
  assert.match(charts.oasis, /data-chart-type="gauge"/);
});

test('latency keeps only trace steps with a duration, labelled by the last stepId segment', () => {
  const { latency } = renderTerminalCharts(job);
  assert.match(latency, />debate</);
  assert.doesNotMatch(latency, /noduration/);
});

test('oasis draws Ghost and Live gauges, defaulting missing sentiment to 0 as before', () => {
  const { oasis } = renderTerminalCharts(job);
  assert.match(oasis, /Ghost/);
  assert.match(oasis, /Live/);
  assert.match(renderTerminalCharts({}).oasis, /data-chart-type="gauge"/);
});

test('sections without data are null so the client keeps the previous panel', () => {
  const charts = renderTerminalCharts({ trace: [{ stepId: 'a_b' }] });
  assert.equal(charts.latency, null);
  assert.equal(charts.heatmap, null);
  assert.equal(charts.timeline, null);
});

test('escapes telemetry strings (pushed by workers, not trusted)', () => {
  const { heatmap } = renderTerminalCharts({ disagreementHeatmap: [{ p1: '<img src=x onerror=alert(1)>', p2: 'Q', variance: 1 }] });
  assert.doesNotMatch(heatmap, /<img/);
  assert.match(heatmap, /&lt;img/);
});

test('data the engine rejects becomes an empty-state message, never a thrown error', () => {
  const { timeline } = renderTerminalCharts({ consensusTimeline: [{ step: 1, alignment: 'n/a' }] });
  assert.match(timeline, /class="bp-chart-empty"/);
});

test('heatmap is one row per persona pair (record list, not a 6-series comparison grid)', () => {
  const pairs = Array.from({ length: 10 }, (_, i) => ({ p1: `P${i}`, p2: `Q${i}`, variance: i / 10 }));
  const { heatmap } = renderTerminalCharts({ disagreementHeatmap: pairs });
  assert.equal(heatmap.match(/<tr>/g).length, 1 + 10); // header + every pair, none dropped
  assert.match(heatmap, /<th[^>]*>P_Alpha<\/th><th[^>]*>P_Beta<\/th><th[^>]*>Delta<\/th>/);
  assert.match(heatmap, /<td[^>]*>P9<\/td><td[^>]*>Q9<\/td><td[^>]*>0.9<\/td>/);
});
