/**
 * Government bond yields for the editions, as one market group (`kind: 'yield'`): yields in percent and changes
 * in basis points, never a percent change of a yield.
 *   - US Treasuries: Yahoo's Cboe yield indices (13-week bill, 5Y, 10Y, 30Y), on the Cboe trading calendar.
 *   - India G-Secs: the CCIL curve that publish-home-bonds.js already writes to data/bonds.json — read from
 *     disk (the editions run in the same web root), else from the public copy. The 91-day T-bill comes from
 *     CCIL's tenor table; 2Y-30Y are zero-coupon yields of the latest NSS fit, compared with the previous fit.
 * `notes` carry the spreads and the benchmark bond. A missing or week-old CCIL curve drops the India rows and
 * says so; it is never shown as current.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { nssYield } from '../home-bonds/ccil.js';
import { dayLabel } from './exchange-calendar.js';
import { fetchQuotes } from './market-data.js';

export const BOND_GROUP_ID = 'bonds';
const DEFAULT_BONDS_URL = 'https://blogspro.in/data/bonds.json';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_CURVE_AGE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const US_TREASURIES = Object.freeze([
  { symbol: '^IRX', name: 'US 13-week T-bill', exchange: 'CBOE_RATES' },
  { symbol: '^FVX', name: 'US 5Y', exchange: 'CBOE_RATES' },
  { symbol: '^TNX', name: 'US 10Y', exchange: 'CBOE_RATES' },
  { symbol: '^TYX', name: 'US 30Y', exchange: 'CBOE_RATES' },
]);
const INDIA_CURVE_TENORS = Object.freeze([2, 5, 10, 30]);

const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;
const toBp = (delta) => round(delta * 100, 1);

/** The CCIL bonds.json: BONDS_JSON_FILE or <cwd>/data/bonds.json, else BONDS_JSON_URL; null when neither loads. */
export async function loadIndiaBonds({ env = process.env, readFile = (f) => fs.readFile(f, 'utf8'), fetchImpl = fetch } = {}) {
  const file = env.BONDS_JSON_FILE || path.join(process.cwd(), 'data', 'bonds.json');
  try {
    return JSON.parse(await readFile(file));
  } catch (error) {
    console.warn(`⚠️ [Edition] ${file} unreadable (${error.code || error.message}); trying the public copy`);
  }
  const url = env.BONDS_JSON_URL || DEFAULT_BONDS_URL;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    console.warn(`⚠️ [Edition] Indian bond yields unavailable from ${url}: ${error.message}`);
    return null;
  }
}

const validParams = (p) => p && ['b0', 'b1', 'b2', 'b3', 't1', 't2'].every((k) => Number.isFinite(p[k]));
const validDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** India rows from bonds.json, or [] when the curve is missing, malformed or older than a week. */
export function indiaBondRows(bonds, now = Date.now()) {
  const latest = bonds?.zcyc?.latest;
  if (!validDate(latest?.date) || !validParams(latest.params)) return [];
  if (now - Date.parse(`${latest.date}T12:00:00Z`) > MAX_CURVE_AGE_DAYS * DAY_MS) return [];
  const previous = validParams(bonds.zcyc.previous?.params) ? bonds.zcyc.previous.params : null;
  const status = `CCIL curve of ${dayLabel(latest.date)}`;
  const row = (symbol, name, value, changeBp, basis) => ({
    symbol, name, ok: true, kind: 'yield', price: round(value, 4), changeBp, changeBasis: basis, status,
  });
  const bill = bonds.tenors?.gsec?.find((t) => t.bucket === '91D' && Number.isFinite(t.yield));
  const curve = INDIA_CURVE_TENORS.map((years) => {
    const now10 = nssYield(latest.params, years);
    return row(`IN${years}Y`, `India ${years}Y`, now10, previous ? toBp(now10 - nssYield(previous, years)) : null, 'vs previous CCIL fit');
  });
  return [...(bill ? [row('IN91D', 'India 91-day T-bill', bill.yield, null, '')] : []), ...curve];
}

const signedBp = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))} bp`;

function bondNotes(quotes, bonds) {
  const y = (symbol) => quotes.find((q) => q.symbol === symbol && q.ok)?.price;
  const notes = [];
  if (Number.isFinite(y('IN10Y')) && Number.isFinite(y('^TNX'))) notes.push(`India 10Y minus US 10Y: ${signedBp((y('IN10Y') - y('^TNX')) * 100)}`);
  if (Number.isFinite(y('IN10Y')) && Number.isFinite(y('IN2Y'))) notes.push(`India 2s10s slope: ${signedBp((y('IN10Y') - y('IN2Y')) * 100)}`);
  if (Number.isFinite(y('^TNX')) && Number.isFinite(y('^IRX'))) notes.push(`US 3-month to 10Y slope: ${signedBp((y('^TNX') - y('^IRX')) * 100)}`);
  const benchmark = bonds?.tenors?.gsec?.find((t) => t.bucket === '9Y-10Y' && Number.isFinite(t.yield));
  if (benchmark && validDate(bonds.tenors.asOn) && quotes.some((q) => q.symbol === 'IN10Y')) {
    notes.push(`India 10Y benchmark: ${benchmark.security} at ${benchmark.yield}% (CCIL, ${dayLabel(bonds.tenors.asOn).slice(4)})`);
  }
  if (!quotes.some((q) => q.symbol.startsWith('IN'))) notes.push('Indian G-Sec yields unavailable (CCIL curve not loaded).');
  return notes;
}

/** The bond group for the edition: US rows (with `period`'s Yahoo range), then India rows, plus notes. */
export async function fetchBondMarket({ fetchImpl = fetch, env = process.env, now = Date.now(), readFile, query } = {}) {
  const [us, bonds] = await Promise.all([
    fetchQuotes(US_TREASURIES, { fetchImpl, ...(query ? { query } : {}) }),
    loadIndiaBonds({ env, fetchImpl, ...(readFile ? { readFile } : {}) }),
  ]);
  const usRows = us.map((q) => (q.ok ? { ...q, kind: 'yield', changeBp: q.change === null ? null : toBp(q.change) } : { ...q, kind: 'yield' }));
  const quotes = [...usRows, ...indiaBondRows(bonds, now)];
  return { id: BOND_GROUP_ID, title: 'Government bond yields', kind: 'yield', quotes, notes: bondNotes(quotes, bonds) };
}
