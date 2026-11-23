/**
 * Headline Indian macro indicators from MoSPI's official API (https://api.mospi.gov.in, no key needed):
 *   CPI inflation (headline, food), WPI inflation, IIP growth, real GDP growth, unemployment rate.
 * MoSPI does not say which period is latest, so monthly series step back from last month (IST) until a
 * period has data. Rows are picked by their field values, never by position, and a series with no data
 * in the window is reported as failed rather than filled in.
 * Forex reserves and trade are not here: MoSPI's copies of those RBI series stop in mid-2025.
 */

const MONTHS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
const LOOKBACK_MONTHS = 4; // releases lag 2-6 weeks; four months covers a late or skipped release
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const FY_START_MONTH = 4; // Indian financial years run April-March
const PAGE = 'Format=JSON&limit=100'; // MoSPI caps pages at 100 rows

/** Calendar month and year in IST for an epoch-ms time. */
function istMonth(now) {
  const d = new Date(now + IST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** The `count` months before the current IST month, newest first: [{ year, month (1-12) }]. */
export function monthCandidates(now, count = LOOKBACK_MONTHS) {
  const { year, month } = istMonth(now);
  return Array.from({ length: count }, (_, i) => {
    const index = year * 12 + (month - 1) - (i + 1);
    return { year: Math.floor(index / 12), month: (index % 12) + 1 };
  });
}

/** "2026-27" for a time in the April 2026 - March 2027 financial year (IST). */
export function financialYear(now) {
  const { year, month } = istMonth(now);
  const start = month >= FY_START_MONTH ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

const periodLabel = ({ year, month }) => `${MONTHS[month - 1]} ${year}`;
const percent = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) < 100 ? n : null;
};
const indicator = (key, label, value, period) => (value === null ? null : { key, label, value, unit: '%', period });

/** First candidate month for which `read(month)` returns a non-empty result. */
async function latestMonth(read, months) {
  for (const month of months) {
    const found = await read(month);
    if (found?.length) return found;
  }
  return [];
}

const SERIES = Object.freeze([
  {
    keys: ['cpi', 'cpiFood'],
    read: (get, m) => get(`/api/cpi/getCPIData?base_year=2024&series=Current&year=${m.year}&month_code=${m.month}&state_code=1&sector_code=3&division_code=0,1&${PAGE}`)
      .then((rows) => {
        const division = (name) => rows.find((r) => r.division === name && r.group == null && r.sector === 'Combined');
        return [
          indicator('cpi', 'CPI inflation', percent(division('CPI (General)')?.inflation), periodLabel(m)),
          indicator('cpiFood', 'Food inflation (CPI)', percent(division('Food and beverages')?.inflation), periodLabel(m)),
        ].filter(Boolean);
      }),
  },
  {
    keys: ['wpi'],
    read: async (get, m) => {
      const overall = async (year) => {
        const rows = await get(`/api/wpi/getWpiRecords?base_year=2022-23&year=${year}&month_code=${m.month}&Format=JSON&limit=10`);
        const value = Number(rows.find((r) => r.major_group === 'Wholesale Price Index' && r.group == null)?.index_value);
        return value > 0 ? value : null;
      };
      const now = await overall(m.year);
      const yearAgo = now && (await overall(m.year - 1));
      if (!now || !yearAgo) return [];
      return [indicator('wpi', 'WPI inflation', Math.round((now / yearAgo - 1) * 10000) / 100, periodLabel(m))];
    },
  },
  {
    keys: ['iip'],
    read: (get, m) => get(`/api/iip/getIipData?base_year=2022-23&frequency=Monthly&year=${m.year}&month_code=${m.month}&Format=JSON&limit=10`)
      .then((rows) => {
        const general = rows.find((r) => r.type === 'General' && r.category === 'General');
        return [indicator('iip', 'Industrial output growth (IIP)', percent(general?.growth_rate), periodLabel(m))].filter(Boolean);
      }),
  },
  {
    keys: ['unemployment'],
    read: (get, m) => get(`/api/plfs/getData?indicator_code=3&frequency_code=3&year=${m.year}&month_code=${m.month}&${PAGE}`)
      .then((rows) => {
        const all = rows.find((r) => r.AgeGroup === '15 years and above' && r.gender === 'person' && r.sector === 'rural + urban');
        return [indicator('unemployment', 'Unemployment rate (15+)', percent(all?.value), periodLabel(m))].filter(Boolean);
      }),
  },
]);

// Quarterly real GDP growth: the newest quarter across this and last financial year.
async function readGdp(get, now) {
  const thisYear = financialYear(now);
  const lastYear = financialYear(now - 365 * 24 * 60 * 60 * 1000);
  const rows = await get(`/api/nas/getNASData?base_year=2022-23&series=Current&frequency_code=Quarterly&indicator_code=22&year=${thisYear},${lastYear}&Format=JSON&limit=20`);
  const newest = rows
    .filter((r) => /^\d{4}-\d{2}$/.test(r.year) && /^Q[1-4]$/.test(r.quarter) && percent(r.constant_price) !== null)
    .sort((a, b) => `${b.year}${b.quarter}`.localeCompare(`${a.year}${a.quarter}`))[0];
  return newest ? [indicator('gdp', 'Real GDP growth', percent(newest.constant_price), `${newest.quarter} ${newest.year}`)] : [];
}

/**
 * All headline indicators: { indicators: [{ key, label, value, unit, period }], failed: [keys] }.
 * `get(path)` returns the response's data array (empty when MoSPI has no data) and throws on errors.
 */
export async function fetchIndiaMacro(get, now = Date.now()) {
  const months = monthCandidates(now);
  const tasks = [
    ...SERIES.map((series) => ({ keys: series.keys, run: () => latestMonth((m) => series.read(get, m), months) })),
    { keys: ['gdp'], run: () => readGdp(get, now) },
  ];
  const results = await Promise.all(tasks.map(async (task) => {
    try {
      return { keys: task.keys, found: await task.run() };
    } catch (error) {
      console.warn(`⚠️ [Macro] ${task.keys.join('/')} unavailable: ${error.message}`);
      return { keys: task.keys, found: [] };
    }
  }));
  const indicators = results.flatMap((r) => r.found);
  const failed = results.flatMap((r) => r.keys).filter((key) => !indicators.some((i) => i.key === key));
  return { indicators, failed };
}
