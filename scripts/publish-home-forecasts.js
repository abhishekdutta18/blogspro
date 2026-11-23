/**
 * Publishes TimesFM forecasts (BigQuery AI.FORECAST) to data/forecasts.json
 * (https://blogspro.in/data/forecasts.json):
 *   { generatedAt, model, confidence,
 *     daily: { horizon, series: [{ id, history: [['YYYY-MM-DD', close]], forecast: [{ step, value, lower, upper }] }] },
 *     macro: { horizon, series: [{ key, label, frequency, history: [['YYYY-MM', value]],
 *                                  forecast: [{ period: 'YYYY-MM', value, lower, upper }] }] } }
 * Daily series are the homepage instruments' last year of closes (Yahoo) plus the CCIL 10-year zero rate
 * ('IN10Y', from data/bonds.json once it has enough days); forecasts are the next trading sessions.
 * Macro series come from data/policy.json (MoSPI history); forecasts are the next periods.
 * The lower/upper bounds are TimesFM's 80% prediction interval. Model output, not advice.
 * Usage: node scripts/publish-home-forecasts.js [--out <path>]  (reads data/bonds.json and data/policy.json
 * next to the output). Runs once a day. A failed query keeps the previous section. Exits 1 when nothing
 * was forecast.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleAuth } from 'google-auth-library';
import { parseHistory } from './lib/market-edition/market-data.js';
import { HOME_INSTRUMENTS } from './lib/market-edition/home-markets.js';
import { buildForecastRequest, parseForecastResponse, runQuery, sessionPoints, monthStart, addMonths, MODEL, CONFIDENCE } from './lib/home-forecasts/timesfm.js';
import { readJsonFile, writeJsonAtomically } from './lib/json-file.js';
import { outPath } from './publish-home-markets.js';

export const DAILY_HORIZON = 5;
export const MACRO_HORIZON = 3;
export const MIN_DAILY_POINTS = 30;
export const MIN_MACRO_POINTS = 6;
const SHOWN_SESSIONS = 120; // history kept in the file for the chart (about six months)
const CHART_URL = 'https://query2.finance.yahoo.com/v8/finance/chart/';
const REQUEST_TIMEOUT_MS = 15_000;
const YAHOO_CONCURRENCY = 3;
const MONTHS_PER_STEP = Object.freeze({ monthly: 1, quarterly: 3 });

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** One year of daily closes per homepage instrument: [{ id, closes: [{ t, close }] }], failures skipped. */
async function fetchDailyCloses(fetchImpl) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < HOME_INSTRUMENTS.length) {
      const instrument = HOME_INSTRUMENTS[next];
      next += 1;
      try {
        const res = await fetchImpl(`${CHART_URL}${encodeURIComponent(instrument.yahoo)}?interval=1d&range=1y`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.status === 429) break; // leave the rest for tomorrow rather than push a rate limit
        if (res.ok) results.push({ id: instrument.symbol, closes: parseHistory(await res.json()) });
      } catch (error) {
        console.warn(`⚠️ [Forecasts] ${instrument.symbol} history unavailable: ${error.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: YAHOO_CONCURRENCY }, worker));
  return results;
}

/** Daily series ready to forecast: [{ id, dates, values }] with at least MIN_DAILY_POINTS sessions. */
export function dailyInputs(closesById, bondHistory = []) {
  const series = closesById.map(({ id, closes }) => ({ id, dates: closes.map((c) => isoDay(c.t)), values: closes.map((c) => c.close) }));
  const gsec = bondHistory.filter((h) => Number.isFinite(h.y10));
  series.push({ id: 'IN10Y', dates: gsec.map((h) => h.date), values: gsec.map((h) => h.y10) });
  return series.filter((s) => s.values.length >= MIN_DAILY_POINTS);
}

/** The newest run of points spaced exactly `step` months apart (TimesFM needs regular spacing). */
export function regularTail(points, step) {
  let start = points.length - 1;
  while (start > 0 && addMonths(points[start - 1][0], step) === points[start][0]) start -= 1;
  return points.slice(start);
}

/** Macro series ready to forecast, from policy.json's macro.history. */
export function macroInputs(history = []) {
  return history
    .filter((s) => MONTHS_PER_STEP[s.frequency])
    .map((s) => ({ ...s, points: regularTail(s.points, MONTHS_PER_STEP[s.frequency]) }))
    .filter((s) => s.points.length >= MIN_MACRO_POINTS);
}

async function forecastDaily(fetchImpl, bonds, query, now) {
  const inputs = dailyInputs(await fetchDailyCloses(fetchImpl), bonds?.history);
  if (inputs.length === 0) return null;
  const request = buildForecastRequest(inputs.map((s) => ({ id: s.id, points: sessionPoints(s.values, now) })), { horizon: DAILY_HORIZON });
  const forecasts = parseForecastResponse(await query(request));
  const series = inputs.filter((s) => forecasts.has(s.id)).map((s) => ({
    id: s.id,
    history: s.dates.map((d, i) => [d, s.values[i]]).slice(-SHOWN_SESSIONS),
    forecast: forecasts.get(s.id),
  }));
  return series.length ? { horizon: DAILY_HORIZON, series } : null;
}

async function forecastMacro(policy, query) {
  const inputs = macroInputs(policy?.macro?.history);
  if (inputs.length === 0) return null;
  const request = buildForecastRequest(inputs.map((s) => ({ id: s.key, points: s.points.map(([k, v]) => [monthStart(k), v]) })), { horizon: MACRO_HORIZON });
  const forecasts = parseForecastResponse(await query(request));
  const series = inputs.filter((s) => forecasts.has(s.key)).map((s) => ({
    key: s.key,
    label: s.label,
    frequency: s.frequency,
    history: s.points,
    forecast: forecasts.get(s.key).map(({ step, ...f }) => ({ period: addMonths(s.points.at(-1)[0], step * MONTHS_PER_STEP[s.frequency]), ...f })),
  }));
  return series.length ? { horizon: MACRO_HORIZON, series } : null;
}

/** A BigQuery runner using the service account in GOOGLE_APPLICATION_CREDENTIALS. */
async function bigQueryRunner() {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/bigquery'] });
  const [client, project] = await Promise.all([auth.getClient(), auth.getProjectId()]);
  return (body) => runQuery(body, { client, project });
}

async function attempt(name, task) {
  try {
    return await task();
  } catch (error) {
    console.warn(`⚠️ [Forecasts] ${name} failed: ${error.message}`);
    return null;
  }
}

/** Forecasts both sections and writes the file; a failed section keeps its previous copy. */
export async function publishHomeForecasts({ out, fetchImpl = fetch, query, now = Date.now() }) {
  const dir = path.dirname(out);
  const previous = readJsonFile(out);
  const run = query ?? (await attempt('BigQuery sign-in', bigQueryRunner));
  if (!run) return { written: false, fresh: [], out };
  const [daily, macro] = await Promise.all([
    attempt('daily forecast', () => forecastDaily(fetchImpl, readJsonFile(path.join(dir, 'bonds.json')), run, now)),
    attempt('macro forecast', () => forecastMacro(readJsonFile(path.join(dir, 'policy.json')), run)),
  ]);
  const fresh = [daily && 'daily', macro && 'macro'].filter(Boolean);
  if (fresh.length === 0) return { written: false, fresh, out };
  writeJsonAtomically(out, {
    generatedAt: now,
    model: `${MODEL} (Google, via BigQuery AI.FORECAST)`,
    confidence: CONFIDENCE,
    daily: daily ?? previous?.daily ?? null,
    macro: macro ?? previous?.macro ?? null,
  });
  return { written: true, fresh, out };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await publishHomeForecasts({ out: outPath(process.argv, 'data/forecasts.json') });
  if (!result.written) {
    console.error(`❌ [Forecasts] nothing forecast; ${result.out} left as it was.`);
    process.exit(1);
  }
  console.log(`✅ [Forecasts] ${result.fresh.join(' + ')} -> ${result.out}`);
}
