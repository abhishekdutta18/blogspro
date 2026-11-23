/**
 * SVG chart tests: tick maths, escaping of every text that reaches the SVG, legends only for two or more
 * series, macro charts with and without a forecast, and the publisher's file set.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chartSvg, escapeXml, niceTicks } from '../scripts/lib/home-charts/svg.js';
import { buildCharts, publishHomeCharts } from '../scripts/publish-home-charts.js';

const curve = [[0.25, 5.6], [1, 6.1], [10, 7.26], [40, 7.98]];
const bonds = { tenors: { asOn: '2026-11-20', gsec: [{ years: 10, yield: 7.21 }] }, zcyc: { latest: { date: '2026-11-20', curve }, previous: { date: '2026-11-19', curve: curve.map(([m, y]) => [m, y + 0.05]) } } };
const months = Array.from({ length: 8 }, (_, i) => [`2026-0${i + 1}`, 5 + i / 10]);
const policy = { macro: { history: [{ key: 'cpi', label: 'CPI <b>inflation</b>', frequency: 'monthly', points: months }, { key: 'gdp', label: 'GDP growth', frequency: 'quarterly', points: [['2026-03', 7.4], ['2026-06', 7.8]] }] } };
const forecasts = {
  macro: { series: [{ key: 'cpi', forecast: [{ period: '2026-09', value: 5.9, lower: 5, upper: 6.5 }] }] },
  daily: { series: [{ id: 'NSE:NIFTY', history: [['2026-11-20', 25000], ['2026-11-23', 25371]], forecast: [{ step: 1, value: 25500, lower: 25100, upper: 25900 }] }] },
};

test('niceTicks and escapeXml', () => {
  assert.deepEqual(niceTicks(5.6, 8.1), [6, 6.5, 7, 7.5, 8]);
  assert.equal(escapeXml(`<script>"x"&'y'</script>`), '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;');
});

test('chartSvg escapes text, adds a legend only for several series, and refuses empty data', () => {
  const one = chartSvg({ title: 'A & B', series: [{ name: '<i>x</i>', color: '#000', points: [[0, 1], [1, 2]] }] });
  assert.ok(one.includes('<title>A &amp; B</title>') && !one.includes('<i>x</i>'));
  assert.ok(!one.includes('&lt;i&gt;x'), 'a single series has no legend');
  const two = chartSvg({ title: 't', series: [{ name: 'one', color: '#000', points: [[0, 1]] }, { name: 'two', color: '#111', points: [[1, 2]] }] });
  assert.ok(two.includes('>one</text>') && two.includes('>two</text>'));
  assert.throws(() => chartSvg({ title: 'empty', series: [{ color: '#000', points: [] }] }), /no data/);
});

test('buildCharts makes the yield curve, macro charts with or without a forecast, and daily forecasts', () => {
  const charts = buildCharts({ bonds, policy, forecasts });
  assert.deepEqual(charts.map((c) => c.file), ['yield-curve.svg', 'macro-cpi.svg', 'macro-gdp.svg', 'forecast-nse-nifty.svg']);
  const [yieldCurve, cpi, gdp] = charts.map((c) => c.svg);
  assert.ok(yieldCurve.includes('2026-11-20 vs 2026-11-19') && yieldCurve.includes('Benchmark G-Secs'));
  assert.ok(cpi.includes('CPI &lt;b&gt;inflation&lt;/b&gt;') && cpi.includes('stroke-dasharray') && cpi.includes('not advice'));
  assert.ok(!gdp.includes('stroke-dasharray') && gdp.includes('Source: MoSPI'), 'no forecast, no dashed line or band');
  assert.deepEqual(buildCharts({}), []);
});

test('publishHomeCharts writes the SVGs and an index next to the data files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'home-charts-'));
  fs.writeFileSync(path.join(dir, 'bonds.json'), JSON.stringify(bonds));
  const result = publishHomeCharts({ out: path.join(dir, 'charts'), now: 1 });
  assert.equal(result.written, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'charts', 'index.json'), 'utf8')), { generatedAt: 1, charts: [{ file: 'yield-curve.svg', title: 'India government bond yield curve' }] });
  assert.ok(fs.readFileSync(path.join(dir, 'charts', 'yield-curve.svg'), 'utf8').startsWith('<?xml'));
  fs.rmSync(dir, { recursive: true, force: true });
});
