/**
 * Tests for the homepage chart maths (frontend/src/lib/marketChart.js): scales, the value domain that
 * always includes the previous close, path data, round-number and IST-hour ticks, nearest-point lookup
 * for the crosshair, and value/change text in each instrument's style.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleLinear, valueDomain, linePath, areaPath, valueTicks, timeTicks, nearestIndex,
  formatChartValue, formatIstTime, changeFromClose, direction,
} from '../frontend/src/lib/marketChart.js';

// 09:15 IST on 23 Nov 2026 is 03:45 UTC.
const OPEN = Date.UTC(2026, 10, 23, 3, 45) / 1000;

test('scaleLinear maps a domain onto a range, and a flat domain onto its middle', () => {
  const y = scaleLinear([100, 200], [200, 0]);
  assert.deepEqual([y(100), y(150), y(200)], [200, 100, 0]);
  assert.equal(scaleLinear([5, 5], [0, 10])(5), 5);
});

test('valueDomain pads the data and always includes the previous close', () => {
  const [min, max] = valueDomain([[1, 101], [2, 103]], 95);
  assert.ok(min < 95 && max > 103);
  const [flatMin, flatMax] = valueDomain([[1, 50]]);
  assert.ok(flatMin < 50 && flatMax > 50, 'a single value still gets a visible span');
  assert.equal(valueDomain([], null), null);
});

test('linePath and areaPath give compact path data closed to the baseline', () => {
  const pts = [[0, 0], [10, 5]];
  const x = (t) => t * 2;
  const y = (v) => 10 - v;
  assert.equal(linePath(pts, x, y), 'M0 10L20 5');
  assert.equal(areaPath(pts, x, y, 10), 'M0 10L20 5L20 10L0 10Z');
  assert.equal(areaPath([], x, y, 10), '');
});

test('valueTicks are round numbers inside the domain', () => {
  assert.deepEqual(valueTicks(25_480, 25_830, 4), [25_500, 25_600, 25_700, 25_800]);
  assert.deepEqual(valueTicks(1.0852, 1.0911, 3), [1.086, 1.088, 1.09]);
  assert.deepEqual(valueTicks(7, 7), [7]);
});

test('timeTicks land on whole IST hours and stay within the limit', () => {
  const close = OPEN + 6.25 * 3600; // 15:30 IST
  const ticks = timeTicks(OPEN, close, 5);
  assert.deepEqual(ticks.map(formatIstTime), ['10:00', '12:00', '14:00']);
  const day = timeTicks(OPEN, OPEN + 24 * 3600, 5);
  assert.ok(day.length <= 5 && day.length > 1);
  assert.deepEqual(timeTicks(OPEN, OPEN), []);
});

test('nearestIndex finds the closest point in time', () => {
  const pts = [[0, 1], [300, 2], [600, 3]];
  assert.deepEqual([nearestIndex(pts, -50), nearestIndex(pts, 140), nearestIndex(pts, 160), nearestIndex(pts, 9999)], [0, 0, 1, 2]);
  assert.equal(nearestIndex([], 5), -1);
});

test('formatChartValue uses the instrument style from the file', () => {
  assert.equal(formatChartValue(183410.2, { locale: 'en-IN', digits: 2, prefix: '', suffix: '' }), '1,83,410.20');
  assert.equal(formatChartValue(65220.4, { locale: 'en-US', digits: 0, prefix: '$', suffix: '' }), '$65,220');
  assert.equal(formatChartValue(4.912, { locale: 'en-US', digits: 2, prefix: '', suffix: '%' }), '4.91%');
  assert.equal(formatChartValue(1.5, null), '1.50', 'missing style falls back to two decimals');
});

test('changeFromClose matches the table: percent, or basis points for yields', () => {
  assert.equal(changeFromClose(25_634.9, 25_800, { suffix: '' }), '-0.64%');
  assert.equal(changeFromClose(101, 100, null), '+1.00%');
  assert.equal(changeFromClose(99.9999, 100, null), '+0.00%', 'no "-0.00%"');
  assert.equal(changeFromClose(4.912, 5.052, { suffix: '%' }), '-14 bp');
  assert.equal(changeFromClose(10, null, null), null);
});

test('direction compares the last price with the previous close', () => {
  assert.deepEqual([direction(2, 1), direction(1, 2), direction(1, 1), direction(1, null)], ['up', 'down', 'flat', 'flat']);
});
