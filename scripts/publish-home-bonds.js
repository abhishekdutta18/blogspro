/**
 * Publishes the Indian government bond yield curve from CCIL to data/bonds.json
 * (https://blogspro.in/data/bonds.json):
 *   { generatedAt, sources: { tenorwise, zcyc },
 *     tenors:  { asOn, gsec: [{ bucket, years, security, yield }], sgs: [...] } | null,
 *     zcyc:    { latest: { date, params, curve: [[years, yield]] }, previous: {...} | null } | null,
 *     history: [{ date, params, y10 }] }   (oldest first, at most HISTORY_DAYS entries)
 * CCIL only shows the latest two curve fits without a sign-in, so `history` is built up here, one fitted
 * curve per business day, and feeds the 10-year yield forecast once it is long enough.
 * Usage: node scripts/publish-home-bonds.js [--out <path>]   (default: data/bonds.json under the cwd)
 * Each part keeps its last good copy when CCIL fails. Exits 1 when neither page could be read.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CCIL_SOURCES, parseTenorwise, parseZcyc, nssYield, zcycCurve } from './lib/home-bonds/ccil.js';
import { readJsonFile, writeJsonAtomically } from './lib/json-file.js';
import { outPath } from './publish-home-markets.js';

const REQUEST_TIMEOUT_MS = 30_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; BlogsProBonds/1.0; +https://blogspro.in/)';
export const HISTORY_DAYS = 400;
const BENCHMARK_YEARS = 10;

async function fetchPage(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function attempt(name, task) {
  try {
    const result = await task();
    if (!result) throw new Error('no data on the page');
    return result;
  } catch (error) {
    console.warn(`⚠️ [Bonds] ${name} unavailable: ${error.message}`);
    return null;
  }
}

const fit = (row) => (row ? { date: row.date, params: row.params, curve: zcycCurve(row.params) } : null);
const round4 = (n) => Math.round(n * 10_000) / 10_000;

/** Previous history plus the newly seen fits, one per date (newest copy wins), oldest first, capped. */
export function mergeHistory(previous = [], fits = []) {
  const byDate = new Map(previous.map((h) => [h.date, h]));
  fits.forEach((f) => byDate.set(f.date, { date: f.date, params: f.params, y10: round4(nssYield(f.params, BENCHMARK_YEARS)) }));
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-HISTORY_DAYS);
}

/** Fetches both CCIL pages, merges with the previous file and writes it. Returns { written, fresh, out }. */
export async function publishHomeBonds({ out, fetchImpl = fetch, now = Date.now() }) {
  const previous = readJsonFile(out);
  const [tenors, fits] = await Promise.all([
    attempt('CCIL tenorwise yields', async () => parseTenorwise(await fetchPage(CCIL_SOURCES.tenorwise, fetchImpl))),
    attempt('CCIL ZCYC parameters', async () => {
      const rows = parseZcyc(await fetchPage(CCIL_SOURCES.zcyc, fetchImpl));
      return rows.length ? rows : null;
    }),
  ]);
  const fresh = [tenors && 'tenors', fits && 'zcyc'].filter(Boolean);
  if (fresh.length === 0) return { written: false, fresh, out };
  writeJsonAtomically(out, {
    generatedAt: now,
    sources: CCIL_SOURCES,
    tenors: tenors ?? previous?.tenors ?? null,
    zcyc: fits ? { latest: fit(fits[0]), previous: fit(fits[1]) } : previous?.zcyc ?? null,
    history: mergeHistory(previous?.history, fits ?? []),
  });
  return { written: true, fresh, out };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await publishHomeBonds({ out: outPath(process.argv, 'data/bonds.json') });
  if (!result.written) {
    console.error(`❌ [Bonds] CCIL did not answer; ${result.out} left as it was.`);
    process.exit(1);
  }
  console.log(`✅ [Bonds] refreshed ${result.fresh.join(' + ')} -> ${result.out}`);
}
