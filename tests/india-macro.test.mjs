/**
 * Indian macro indicators from MoSPI's official API (api.mospi.gov.in): CPI headline and food inflation,
 * WPI inflation (computed year on year from the index), IIP growth, real GDP growth and the unemployment
 * rate. MoSPI does not say which period is latest, so monthly series step back from last month until data
 * appears. Also covers G-Sec yields and T-bill cut-offs read from the RBI homepage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchIndiaMacro, monthCandidates, financialYear } from '../scripts/lib/home-policy/mospi.js';
import { parseRbiMarkets } from '../scripts/lib/home-policy/rbi.js';

const NOW = Date.UTC(2026, 10, 23, 8, 0); // 23 Nov 2026

const ROWS = {
  'cpi 2026-10': [
    { year: '2026', month: 'October', sector: 'Combined', division: 'CPI (General)', group: null, inflation: '6.09' },
    { year: '2026', month: 'October', sector: 'Combined', division: 'Food and beverages', group: null, inflation: '8.51' },
    { year: '2026', month: 'October', sector: 'Combined', division: 'Food and beverages', group: 'Food', inflation: '9.90' },
  ],
  'wpi 2026-10': [{ year: 2026, month: 'October', major_group: 'Wholesale Price Index', group: null, index_value: '113.3' }, { major_group: 'Primary Articles', group: 'Food Articles', index_value: '126.9' }],
  'wpi 2025-10': [{ year: 2025, month: 'October', major_group: 'Wholesale Price Index', group: null, index_value: '100.9' }],
  'iip 2026-9': [{ year: 2026, month: 'September', type: 'Sectoral', category: 'Mining', growth_rate: '2.1' }, { year: 2026, month: 'September', type: 'General', category: 'General', growth_rate: '6.7' }],
  'plfs 2026-10': [
    { month: 'October', AgeGroup: '15 years and above', gender: 'male', sector: 'rural + urban', value: '4.9' },
    { month: 'October', AgeGroup: '15 years and above', gender: 'person', sector: 'rural + urban', value: '5.2' },
  ],
  nas: [
    { year: '2025-26', quarter: 'Q4', constant_price: '7.4' },
    { year: '2026-27', quarter: 'Q1', constant_price: '7.8' },
    { year: '2025-26', quarter: 'Q3', constant_price: '6.2' },
  ],
};

/** Stub for MoSPI GETs: picks rows by dataset and year/month in the path; anything unknown has no data. */
function stubGet(rows = ROWS, calls = []) {
  return async (path) => {
    calls.push(path);
    const p = new URLSearchParams(path.split('?')[1]);
    if (path.startsWith('/api/nas/')) return rows.nas ?? [];
    const dataset = path.match(/^\/api\/(\w+)\//)[1];
    return rows[`${dataset} ${p.get('year')}-${p.get('month_code')}`] ?? [];
  };
}

test('monthCandidates starts at last month in IST and steps back across the year boundary', () => {
  assert.deepEqual(monthCandidates(Date.UTC(2026, 0, 10), 3), [{ year: 2025, month: 12 }, { year: 2025, month: 11 }, { year: 2025, month: 10 }]);
  assert.deepEqual(monthCandidates(Date.UTC(2026, 1, 28, 20, 0), 1), [{ year: 2026, month: 2 }], '01:30 IST on 1 Mar is already March');
});

test('financialYear runs April to March', () => {
  assert.equal(financialYear(Date.UTC(2026, 10, 23)), '2026-27');
  assert.equal(financialYear(Date.UTC(2026, 2, 31)), '2025-26');
});

test('fetchIndiaMacro returns each headline indicator for its latest period', async () => {
  const { indicators, failed } = await fetchIndiaMacro(stubGet(), NOW);
  const byKey = Object.fromEntries(indicators.map((i) => [i.key, [i.value, i.period]]));
  assert.deepEqual(byKey, {
    cpi: [6.09, 'Oct 2026'],
    cpiFood: [8.51, 'Oct 2026'],
    wpi: [12.29, 'Oct 2026'],
    iip: [6.7, 'Sep 2026'],
    gdp: [7.8, 'Q1 2026-27'],
    unemployment: [5.2, 'Oct 2026'],
  });
  assert.deepEqual(failed, []);
  assert.ok(indicators.every((i) => i.label && i.unit === '%'));
});

test('a series with no recent data is reported as failed, not guessed', async () => {
  const { indicators, failed } = await fetchIndiaMacro(stubGet({ ...ROWS, 'iip 2026-9': [], 'wpi 2025-10': [] }), NOW);
  assert.deepEqual(failed.sort(), ['iip', 'wpi']);
  assert.ok(!indicators.some((i) => i.key === 'iip' || i.key === 'wpi'));
});

test('a MoSPI error on one series does not stop the others', async () => {
  const get = async (path) => {
    if (path.startsWith('/api/plfs/')) throw new Error('HTTP 503');
    return stubGet()(path);
  };
  const { indicators, failed } = await fetchIndiaMacro(get, NOW);
  assert.deepEqual(failed, ['unemployment']);
  assert.equal(indicators.length, 5);
});

test('monthly series look back at most four months', async () => {
  const calls = [];
  await fetchIndiaMacro(stubGet({}, calls), NOW);
  const cpiCalls = calls.filter((c) => c.startsWith('/api/cpi/'));
  assert.equal(cpiCalls.length, 4);
  assert.match(cpiCalls[0], /year=2026&month_code=10&/);
});

test('parseRbiMarkets reads G-Sec yields, T-bill cut-offs and their date from the RBI homepage', () => {
  const html = `<p>Money Market Operations as on November 22, 2026</p><div>Government Securities Market <span>6.20% GS 2029</span> : <span>6.9010%#</span>
    6.94% GS 2036 : 7.2629%# 7.63% GS 2056 : 7.7409%# 91 day T-bills : 5.8602%* 182 day T-bills : 6.5300%*
    364 day T-bills : 6.6300%* * cut-off at the last auction # as on November 19, 2026</div>`;
  const markets = parseRbiMarkets(html);
  assert.deepEqual(markets.gsecs, [
    { label: '6.20% GS 2029', maturity: 2029, value: 6.901 },
    { label: '6.94% GS 2036', maturity: 2036, value: 7.2629 },
    { label: '7.63% GS 2056', maturity: 2056, value: 7.7409 },
  ]);
  assert.deepEqual(markets.tbills, [{ label: '91-day T-bill', value: 5.8602 }, { label: '182-day T-bill', value: 6.53 }, { label: '364-day T-bill', value: 6.63 }]);
  assert.equal(markets.asOn, Date.UTC(2026, 10, 19));
  assert.equal(parseRbiMarkets('<p>nothing</p>'), null);
});
