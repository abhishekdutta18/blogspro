// Tests for js/dashboard-charts.js — the live-dashboard host helper around mountChart.
// Run: node --test tests/dashboard-charts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountDashboardChart } from '../js/dashboard-charts.js';

/** Minimal stand-in for a host element: innerHTML + querySelector for the mounted figure. */
function fakeHost(id = 'host') {
  const figure = { style: {} };
  return {
    id,
    innerHTML: '',
    figure,
    querySelector(selector) {
      return selector === 'figure.bp-chart' && this.innerHTML.includes('<figure') ? figure : null;
    },
  };
}

test('renders a Google arrayToDataTable payload into the host and strips figure chrome', () => {
  const el = fakeHost('forexSurpriseChart');
  const ok = mountDashboardChart(el, { type: 'bar', data: [['Event', 'Surprise'], ['CPI', 0.4], ['NFP', 1.2]] });
  assert.equal(ok, true);
  assert.match(el.innerHTML, /<figure class="bp-chart"/);
  assert.match(el.innerHTML, /<svg /);
  assert.equal(el.figure.style.margin, '0px auto');
  assert.equal(el.figure.style.padding, '0px');
  assert.equal(el.figure.style.background, 'transparent');
  assert.equal(el.figure.style.maxWidth, '640px');
});

test('honours a per-host maxWidth (gauges sit smaller than cartesian charts)', () => {
  const el = fakeHost();
  mountDashboardChart(el, { type: 'gauge', data: [['Label', 'Value'], ['Risk', 62]], redFrom: 75, redTo: 100 }, { maxWidth: '360px' });
  assert.equal(el.figure.style.maxWidth, '360px');
});

test('shows an empty-state message instead of a blank box when the engine rejects the data', () => {
  const el = fakeHost();
  const ok = mountDashboardChart(el, { type: 'pie', data: [['Country', 'Events'], ['USD', 2], ['EUR', 2], ['GBP', 2]] });
  assert.equal(ok, false);
  assert.doesNotMatch(el.innerHTML, /<figure/);
  assert.match(el.innerHTML, /class="bp-chart-empty"/);
  assert.match(el.innerHTML, /Not enough variation to chart/);
});

test('escapes a caller-supplied empty-state message', () => {
  const el = fakeHost();
  mountDashboardChart(el, { type: 'bar', data: [] }, { empty: '<img src=x onerror=alert(1)>' });
  assert.doesNotMatch(el.innerHTML, /<img/);
  assert.match(el.innerHTML, /&lt;img/);
});

test('re-mounting replaces the previous chart instead of appending (no DOM growth across sync loops)', () => {
  const el = fakeHost('mainCurve');
  const payload = { type: 'line', data: { labels: [0, 1, 2], datasets: [{ label: 'Verified', data: [1, 2, 3] }] } };
  mountDashboardChart(el, payload);
  const first = el.innerHTML;
  mountDashboardChart(el, payload);
  assert.equal(el.innerHTML, first);
  assert.equal(el.innerHTML.match(/<figure/g).length, 1);
});
