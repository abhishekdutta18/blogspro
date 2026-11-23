/**
 * Writes standalone SVG charts to data/charts/ (https://blogspro.in/data/charts/<name>.svg) from the
 * homepage data files, plus data/charts/index.json listing them:
 *   yield-curve.svg           CCIL zero-coupon curve today vs the previous day, with benchmark G-Sec yields
 *   macro-<key>.svg           each MoSPI macro series with its TimesFM forecast and 80% band
 *   forecast-<symbol>.svg     each instrument's recent closes with its 5-session TimesFM forecast
 * Usage: node scripts/publish-home-charts.js [--out <dir>]  (reads bonds.json, policy.json, forecasts.json
 * from the directory above <dir>). A chart whose data is missing is skipped. Exits 1 when none was written.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chartSvg, THEME } from './lib/home-charts/svg.js';
import { readJsonFile, writeJsonAtomically } from './lib/json-file.js';
import { outPath } from './publish-home-markets.js';

const SHOWN_SESSIONS = 60;
const YIELD_TICKS = [1, 5, 10, 15, 20, 30, 40];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FORECAST_NOTE = 'Forecast: Google TimesFM via BigQuery AI.FORECAST, 80% interval. Model output, not advice.';

const pct = (v) => `${v.toFixed(2)}%`;
const monthLabel = (key) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;
const slug = (id) => id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Every `every`-th index (always including the last) as an axis tick. */
function indexTicks(labels, every) {
  const last = labels.length - 1;
  // Every `every`-th label plus the last, dropping one that would crowd the last label.
  return labels.map((label, x) => ({ x, label })).filter((t, i) => i === last || (i % every === 0 && last - i >= every / 2));
}

export function yieldCurveChart(bonds) {
  const latest = bonds?.zcyc?.latest;
  if (!latest?.curve?.length) return null;
  const previous = bonds.zcyc.previous;
  const benchmarks = (bonds.tenors?.gsec ?? []).filter((t) => Number.isFinite(t.years) && Number.isFinite(t.yield));
  return chartSvg({
    title: 'India government bond yield curve',
    subtitle: `CCIL zero-coupon (NSS) curve, ${latest.date}${previous ? ` vs ${previous.date}` : ''}`,
    note: 'Source: Clearing Corporation of India (CCIL) ZCYC parameters and tenor-wise indicative yields.',
    xTicks: YIELD_TICKS.map((x) => ({ x, label: `${x}y` })),
    yFormat: pct,
    series: [
      ...(previous?.curve?.length ? [{ name: previous.date, color: THEME.compare, points: previous.curve, width: 1.5, endDot: false }] : []),
      { name: latest.date, color: THEME.accent, points: latest.curve },
      ...(benchmarks.length ? [{ name: `Benchmark G-Secs${bonds.tenors.asOn ? ` (${bonds.tenors.asOn})` : ''}`, color: THEME.ink, dotsOnly: true, points: benchmarks.map((t) => [t.years, t.yield]) }] : []),
    ],
  });
}

/** History, forecast and band for a series laid out on one index axis. */
function forecastLayout(history, forecast) {
  const last = history.length - 1;
  const ahead = forecast.map((f, i) => [last + 1 + i, f.value]);
  return {
    actual: history.map(([, v], i) => [i, v]),
    projected: [[last, history[last][1]], ...ahead],
    band: [[last, history[last][1], history[last][1]], ...forecast.map((f, i) => [last + 1 + i, f.lower, f.upper])],
  };
}

/** A macro series (policy.json history) with its forecast when one exists. */
export function macroChart(series, forecast = []) {
  const history = series.points ?? [];
  if (history.length === 0) return null;
  const labels = [...history.map(([k]) => k), ...forecast.map((f) => f.period)].map(monthLabel);
  const { actual, projected, band } = forecastLayout(history, forecast);
  const cadence = series.frequency === 'quarterly' ? 'Quarterly' : 'Monthly';
  return chartSvg({
    title: series.label,
    subtitle: forecast.length ? `${cadence}, %, with a ${forecast.length}-period forecast` : `${cadence}, %`,
    note: forecast.length ? FORECAST_NOTE : 'Source: MoSPI (Ministry of Statistics and Programme Implementation).',
    xTicks: indexTicks(labels, Math.max(1, Math.ceil(labels.length / 8))),
    yFormat: (v) => `${v.toFixed(1)}%`,
    series: forecast.length
      ? [{ name: 'Actual (MoSPI)', color: THEME.accent, points: actual }, { name: 'TimesFM forecast', color: THEME.accent, dashed: true, points: projected }]
      : [{ color: THEME.accent, points: actual }],
    bands: forecast.length ? [{ color: THEME.accent, points: band }] : [],
  });
}

export function dailyForecastChart(series) {
  const history = (series.history ?? []).slice(-SHOWN_SESSIONS);
  if (history.length === 0 || !series.forecast?.length) return null;
  const labels = [...history.map(([d]) => d.slice(5)), ...series.forecast.map((f) => `+${f.step}`)];
  const { actual, projected, band } = forecastLayout(history, series.forecast);
  const digits = Math.abs(history.at(-1)[1]) < 10 ? 3 : Math.abs(history.at(-1)[1]) < 1000 ? 2 : 0;
  return chartSvg({
    title: `${series.id}: next ${series.forecast.length} sessions`,
    subtitle: `Last ${history.length} daily closes to ${history.at(-1)[0]}, then the forecast`,
    note: FORECAST_NOTE,
    xTicks: indexTicks(labels, 10),
    yFormat: (v) => v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }),
    series: [{ name: 'Daily close', color: THEME.accent, points: actual }, { name: 'TimesFM forecast', color: THEME.accent, dashed: true, points: projected }],
    bands: [{ color: THEME.accent, points: band }],
  });
}

function writeTextAtomically(file, text) {
  const temp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, text);
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

/** Every chart that has data, as [{ file, title, svg }]. */
export function buildCharts({ bonds, policy, forecasts }) {
  const charts = [];
  const add = (file, title, build) => {
    try {
      const svg = build();
      if (svg) charts.push({ file, title, svg });
    } catch (error) {
      console.warn(`⚠️ [Charts] ${file} skipped: ${error.message}`);
    }
  };
  add('yield-curve.svg', 'India government bond yield curve', () => yieldCurveChart(bonds));
  const macroForecasts = new Map((forecasts?.macro?.series ?? []).map((s) => [s.key, s.forecast]));
  (policy?.macro?.history ?? []).forEach((s) => add(`macro-${slug(s.key)}.svg`, s.label, () => macroChart(s, macroForecasts.get(s.key))));
  (forecasts?.daily?.series ?? []).forEach((s) => add(`forecast-${slug(s.id)}.svg`, `${s.id} forecast`, () => dailyForecastChart(s)));
  return charts;
}

export function publishHomeCharts({ out, now = Date.now() }) {
  const dataDir = path.dirname(out);
  const read = (name) => readJsonFile(path.join(dataDir, name));
  const charts = buildCharts({ bonds: read('bonds.json'), policy: read('policy.json'), forecasts: read('forecasts.json') });
  if (charts.length === 0) return { written: 0, out };
  fs.mkdirSync(out, { recursive: true });
  charts.forEach((c) => writeTextAtomically(path.join(out, c.file), c.svg));
  writeJsonAtomically(path.join(out, 'index.json'), { generatedAt: now, charts: charts.map(({ file, title }) => ({ file, title })) });
  return { written: charts.length, out };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = publishHomeCharts({ out: outPath(process.argv, 'data/charts') });
  if (result.written === 0) {
    console.error(`❌ [Charts] no chart had data; ${result.out} left as it was.`);
    process.exit(1);
  }
  console.log(`✅ [Charts] ${result.written} SVG charts -> ${result.out}`);
}
