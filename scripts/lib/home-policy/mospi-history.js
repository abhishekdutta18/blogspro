/**
 * History of the headline Indian macro indicators from MoSPI, for the homepage charts and forecasts:
 *   [{ key, label, unit: '%', frequency: 'monthly' | 'quarterly', points: [['YYYY-MM', value], ...] }]
 * Points are oldest first, at most HISTORY_POINTS each; a quarter is dated by its last month (Q1 2026-27
 * -> '2026-06'). Same sources and row selection as mospi.js. A series that fails is left out (the caller
 * keeps its previous copy). CPI on the 2024 base only reports inflation from January 2026.
 */

const FULL_MONTHS = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
const ALL_MONTHS = '1,2,3,4,5,6,7,8,9,10,11,12';
const PAGE_SIZE = 100; // MoSPI's maximum
const MAX_PAGES = 12;
const HISTORY_POINTS = 36;
const WPI_MONTHS = HISTORY_POINTS + 12; // a year more than shown, for year-on-year inflation
const WPI_CONCURRENCY = 4;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const FY_QUARTER_END_MONTH = Object.freeze({ Q1: 6, Q2: 9, Q3: 12, Q4: 3 });

const pad = (n) => String(n).padStart(2, '0');
const monthKey = (year, month) => `${year}-${pad(month)}`;
const monthNumber = (name) => FULL_MONTHS.indexOf(name) + 1;
const percent = (value) => {
  const n = Number(value);
  return value !== null && value !== '' && Number.isFinite(n) && Math.abs(n) < 100 ? n : null;
};
const round2 = (n) => Math.round(n * 100) / 100;

function istYearMonth(now) {
  const d = new Date(now + IST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** Every row of a MoSPI query, following its 100-row pages. */
async function getAll(get, apiPath) {
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const batch = await get(`${apiPath}&Format=JSON&limit=${PAGE_SIZE}&page=${page}`);
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

/** [['YYYY-MM', value]] oldest first, one per month (first seen wins), newest HISTORY_POINTS kept. */
export function toPoints(entries) {
  const byKey = new Map();
  entries.filter(([key, value]) => key && value !== null).forEach(([key, value]) => { if (!byKey.has(key)) byKey.set(key, value); });
  return [...byKey.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-HISTORY_POINTS);
}

const series = (key, label, frequency, points) => ({ key, label, unit: '%', frequency, points });
const yearsBack = (now, count) => {
  const { year } = istYearMonth(now);
  return Array.from({ length: count }, (_, i) => year - count + 1 + i).join(',');
};

async function cpiHistory(get, now) {
  const rows = await getAll(get, `/api/cpi/getCPIData?base_year=2024&series=Current&year=${yearsBack(now, 3)}&month_code=${ALL_MONTHS}&state_code=1&sector_code=3&division_code=0,1`);
  const pick = (division) => toPoints(rows
    .filter((r) => r.division === division && r.group == null && r.sector === 'Combined')
    .map((r) => [monthNumber(r.month) ? monthKey(Number(r.year), monthNumber(r.month)) : null, percent(r.inflation)]));
  return [
    series('cpi', 'CPI inflation', 'monthly', pick('CPI (General)')),
    series('cpiFood', 'Food inflation (CPI)', 'monthly', pick('Food and beverages')),
  ];
}

/** The `count` calendar months before the current IST month, oldest first: [{ year, month }]. */
export function pastMonths(now, count) {
  const { year, month } = istYearMonth(now);
  return Array.from({ length: count }, (_, i) => {
    const index = year * 12 + (month - 1) - (count - i);
    return { year: Math.floor(index / 12), month: (index % 12) + 1 };
  });
}

async function mapLimited(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// WPI publishes only the index; inflation is this month's index over the same month a year earlier.
async function wpiHistory(get, now) {
  const months = pastMonths(now, WPI_MONTHS);
  const indexValues = await mapLimited(months, WPI_CONCURRENCY, async (m) => {
    const rows = await get(`/api/wpi/getWpiRecords?base_year=2022-23&year=${m.year}&month_code=${m.month}&Format=JSON&limit=10`);
    const value = Number(rows.find((r) => r.major_group === 'Wholesale Price Index' && r.group == null)?.index_value);
    return [monthKey(m.year, m.month), value > 0 ? value : null];
  });
  const byMonth = new Map(indexValues);
  const points = months.map((m) => {
    const current = byMonth.get(monthKey(m.year, m.month));
    const yearAgo = byMonth.get(monthKey(m.year - 1, m.month));
    return [monthKey(m.year, m.month), current && yearAgo ? round2((current / yearAgo - 1) * 100) : null];
  });
  return [series('wpi', 'WPI inflation', 'monthly', toPoints(points))];
}

async function iipHistory(get, now) {
  const rows = await getAll(get, `/api/iip/getIipData?base_year=2022-23&frequency=Monthly&year=${yearsBack(now, 4)}&month_code=${ALL_MONTHS}`);
  const points = rows
    .filter((r) => r.type === 'General' && r.category === 'General')
    .map((r) => [monthNumber(r.month) ? monthKey(Number(r.year), monthNumber(r.month)) : null, percent(r.growth_rate)]);
  return [series('iip', 'Industrial output growth (IIP)', 'monthly', toPoints(points))];
}

async function unemploymentHistory(get, now) {
  const rows = await getAll(get, `/api/plfs/getData?indicator_code=3&frequency_code=3&year=${yearsBack(now, 3)}&month_code=${ALL_MONTHS}`);
  const points = rows
    .filter((r) => r.AgeGroup === '15 years and above' && r.gender === 'person' && r.sector === 'rural + urban')
    .map((r) => [monthNumber(r.month) ? monthKey(Number(r.year), monthNumber(r.month)) : null, percent(r.value)]);
  return [series('unemployment', 'Unemployment rate (15+)', 'monthly', toPoints(points))];
}

/** 'YYYY-MM' of the last month of an Indian financial-year quarter: ('2026-27', 'Q1') -> '2026-06'. */
export function quarterEnd(fy, quarter) {
  const start = Number(/^(\d{4})-\d{2}$/.exec(fy)?.[1]);
  const month = FY_QUARTER_END_MONTH[quarter];
  if (!start || !month) return null;
  return monthKey(quarter === 'Q4' ? start + 1 : start, month);
}

async function gdpHistory(get, now) {
  const { year, month } = istYearMonth(now);
  const fyStart = month >= 4 ? year : year - 1;
  const years = Array.from({ length: 4 }, (_, i) => `${fyStart - i}-${pad((fyStart - i + 1) % 100)}`).join(',');
  const rows = await get(`/api/nas/getNASData?base_year=2022-23&series=Current&frequency_code=Quarterly&indicator_code=22&year=${years}&Format=JSON&limit=40`);
  const points = rows.map((r) => [quarterEnd(r.year, r.quarter), percent(r.constant_price)]);
  return [series('gdp', 'Real GDP growth', 'quarterly', toPoints(points))];
}

/** Every history series that loaded with at least two points; failures are logged and skipped. */
export async function fetchMacroHistory(get, now = Date.now()) {
  const tasks = [cpiHistory, wpiHistory, iipHistory, unemploymentHistory, gdpHistory];
  const results = await Promise.all(tasks.map(async (task) => {
    try {
      return await task(get, now);
    } catch (error) {
      console.warn(`⚠️ [Macro history] ${task.name} unavailable: ${error.message}`);
      return [];
    }
  }));
  return results.flat().filter((s) => s.points.length >= 2);
}
