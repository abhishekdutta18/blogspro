/**
 * MoSPI history tests: month keys and ordering, quarter dating, WPI year-on-year from index values,
 * pagination, and a failing series being left out instead of failing the rest.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchMacroHistory, toPoints, quarterEnd, pastMonths } from '../scripts/lib/home-policy/mospi-history.js';

const NOW = Date.UTC(2026, 10, 23, 9); // 23 Nov 2026

test('toPoints sorts oldest first, drops gaps and duplicates, keeps the newest 36', () => {
  assert.deepEqual(toPoints([['2026-02', 2], ['2026-01', 1], ['2026-02', 9], ['2026-03', null], [null, 4]]), [['2026-01', 1], ['2026-02', 2]]);
  const many = Array.from({ length: 50 }, (_, i) => [`20${String(20 + Math.floor(i / 12))}-${String((i % 12) + 1).padStart(2, '0')}`, i]);
  const kept = toPoints(many);
  assert.equal(kept.length, 36);
  assert.deepEqual(kept.at(-1), many.at(-1));
});

test('quarterEnd dates Indian financial-year quarters by their last month', () => {
  assert.deepEqual([quarterEnd('2026-27', 'Q1'), quarterEnd('2025-26', 'Q3'), quarterEnd('2025-26', 'Q4'), quarterEnd('x', 'Q1')], ['2026-06', '2025-12', '2026-03', null]);
});

test('pastMonths lists the months before the current IST month, oldest first', () => {
  assert.deepEqual(pastMonths(NOW, 3), [{ year: 2026, month: 8 }, { year: 2026, month: 9 }, { year: 2026, month: 10 }]);
});

/** Fake MoSPI: routes by API path; CPI is split over two pages to exercise pagination. */
function fakeMospi({ failIip = false } = {}) {
  const calls = [];
  const cpiRows = Array.from({ length: 10 }, (_, i) => ({ year: '2026', month: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October'][i], division: 'CPI (General)', group: null, sector: 'Combined', inflation: String(5 + i / 10) }));
  const filler = Array.from({ length: 95 }, () => ({ division: 'Other', sector: 'Combined' }));
  const get = async (path) => {
    calls.push(path);
    if (path.startsWith('/api/cpi/')) return path.includes('page=1') ? [...cpiRows.slice(0, 5), ...filler] : cpiRows.slice(5);
    if (path.startsWith('/api/wpi/')) {
      const year = Number(/[?&]year=(\d+)/.exec(path)[1]);
      return [{ major_group: 'Wholesale Price Index', group: null, index_value: String(year === 2026 ? 110 : 100) }];
    }
    if (path.startsWith('/api/iip/')) {
      if (failIip) throw new Error('HTTP 500');
      return [{ type: 'General', category: 'General', year: '2026', month: 'August', growth_rate: '7.8' }, { type: 'General', category: 'General', year: '2026', month: 'September', growth_rate: '6.7' }];
    }
    if (path.startsWith('/api/plfs/')) return [{ AgeGroup: '15 years and above', gender: 'person', sector: 'rural + urban', year: '2026', month: 'October', value: '4.9' }];
    if (path.startsWith('/api/nas/')) return [{ year: '2026-27', quarter: 'Q1', constant_price: '7.8' }, { year: '2025-26', quarter: 'Q4', constant_price: '8.6' }];
    return [];
  };
  return { get, calls };
}

test('fetchMacroHistory assembles every series, following pages', async () => {
  const { get, calls } = fakeMospi();
  const history = await fetchMacroHistory(get, NOW);
  const byKey = Object.fromEntries(history.map((s) => [s.key, s]));
  assert.deepEqual(Object.keys(byKey).sort(), ['cpi', 'gdp', 'iip', 'wpi'], 'one-point series (unemployment) are left out');
  assert.equal(byKey.cpi.points.length, 10, 'both CPI pages were read');
  assert.ok(calls.some((c) => c.startsWith('/api/cpi/') && c.includes('page=2')));
  assert.deepEqual(byKey.wpi.points.at(-1), ['2026-10', 10], 'WPI inflation is the index over a year earlier');
  assert.deepEqual(byKey.gdp.points, [['2026-03', 8.6], ['2026-06', 7.8]]);
  assert.equal(byKey.gdp.frequency, 'quarterly');
});

test('a failing series is skipped and the others still load', async () => {
  const { get } = fakeMospi({ failIip: true });
  const keys = (await fetchMacroHistory(get, NOW)).map((s) => s.key);
  assert.ok(!keys.includes('iip') && keys.includes('cpi'));
});
