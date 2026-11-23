/**
 * Publishes every Indian macro and policy figure the homepage shows to data/policy.json, served as
 * https://blogspro.in/data/policy.json (one call for all of it):
 *   { generatedAt,
 *     rbi:      { fetchedAt, source, rates: [{ key, label, value }], usdInr,
 *                 markets: { gsecs: [{ label, maturity, value }], tbills: [{ label, value }], asOn } | null,
 *                 releases: [{ title, href, time }] },
 *     macro:    { fetchedAt, source, indicators: [{ key, label, value, unit, period }],
 *                 history: [{ key, label, unit, frequency, points: [['YYYY-MM', value]] }] },
 *     calendar: { fetchedAt, source, events: [{ title, country, time, forecast, previous }] } }
 * Usage: node scripts/publish-home-policy.js [--out <path>]   (default: data/policy.json under the cwd)
 * Each section keeps its last good copy when its source fails, so a Forex Factory rate limit never blanks
 * the calendar. MoSPI figures change monthly, so they are re-fetched at most every six hours.
 * Exits 1 when no source answered.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRbiMarkets, parseRbiRates, parseRbiReleases } from './lib/home-policy/rbi.js';
import { parseCalendar } from './lib/home-policy/calendar.js';
import { fetchIndiaMacro } from './lib/home-policy/mospi.js';
import { fetchMacroHistory } from './lib/home-policy/mospi-history.js';
import { readJsonFile, writeJsonAtomically } from './lib/json-file.js';
import { outPath } from './publish-home-markets.js';

export const SOURCES = Object.freeze({
  rbiHome: 'https://www.rbi.org.in/',
  rbiPress: 'https://rbi.org.in/pressreleases_rss.xml',
  calendar: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  mospi: 'https://api.mospi.gov.in',
});
export const MACRO_REFRESH_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; BlogsProPolicy/1.0; +https://blogspro.in/)';

async function fetchText(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Runs `task`, logging and returning null on failure, so one source never stops the others. */
async function attempt(name, task) {
  try {
    return await task();
  } catch (error) {
    console.warn(`⚠️ [Policy] ${name} unavailable: ${error.message}`);
    return null;
  }
}

async function fetchRbi(fetchImpl, previous, now) {
  const [home, releases] = await Promise.all([
    attempt('RBI homepage', async () => {
      const html = await fetchText(SOURCES.rbiHome, fetchImpl);
      const rates = parseRbiRates(html);
      if (!rates) throw new Error('no policy rates found on the page');
      return { ...rates, markets: parseRbiMarkets(html) };
    }),
    attempt('RBI press releases', async () => parseRbiReleases(await fetchText(SOURCES.rbiPress, fetchImpl))),
  ]);
  if (!home) return null;
  return {
    fetchedAt: now,
    source: SOURCES.rbiHome,
    ...home,
    markets: home.markets ?? previous?.markets ?? null,
    releases: releases ?? previous?.releases ?? [],
  };
}

function fetchCalendar(fetchImpl, now) {
  return attempt('Forex Factory calendar', async () => {
    const json = JSON.parse(await fetchText(SOURCES.calendar, fetchImpl)); // a 429 page is HTML and throws here
    if (!Array.isArray(json)) throw new Error('unexpected calendar format');
    return { fetchedAt: now, source: 'https://www.forexfactory.com/calendar', events: parseCalendar(json) };
  });
}

const MOSPI_ATTEMPTS = 3;
const MOSPI_RETRY_MS = 1500;

/** MoSPI GET returning the data rows; "No Data Found" is an empty list, anything else unexpected throws. */
function mospiGet(fetchImpl, { retryMs = MOSPI_RETRY_MS } = {}) {
  return async (apiPath) => {
    let lastError;
    for (let attempt = 1; attempt <= MOSPI_ATTEMPTS; attempt += 1) {
      try {
        const json = JSON.parse(await fetchText(`${SOURCES.mospi}${apiPath}`, fetchImpl));
        if (Array.isArray(json?.data)) return json.data;
        throw new Error(json?.error || json?.message || json?.msg || 'unexpected MoSPI response');
      } catch (error) {
        lastError = error;
        // MoSPI drops connections now and then (its own client retries too); a 4xx or bad body will not improve.
        const isTransient = error.name === 'TypeError' || error.name === 'TimeoutError' || /^HTTP 5\d\d$/.test(error.message);
        if (!isTransient) break;
        if (attempt < MOSPI_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, retryMs * attempt));
      }
    }
    throw lastError;
  };
}

// Fresh entries first, then previous entries whose key did not come back this time.
const mergeByKey = (fresh, previous = []) => [...fresh, ...previous.filter((p) => !fresh.some((f) => f.key === p.key))];

/**
 * Fresh MoSPI indicators and their history merged over the previous ones (a failed series keeps its last
 * copy), or null when nothing came back.
 */
async function fetchMacro(fetchImpl, previous, now) {
  // A copy written before history was published has no history field at all; it is due straight away.
  // (Every newer copy has the field, even when empty, so a MoSPI outage still waits the six hours.)
  const isRecent = previous?.fetchedAt && now - previous.fetchedAt < MACRO_REFRESH_MS;
  if (isRecent && Array.isArray(previous.history)) return null;
  const get = mospiGet(fetchImpl);
  const [{ indicators }, history] = await Promise.all([fetchIndiaMacro(get, now), fetchMacroHistory(get, now)]);
  if (indicators.length === 0 && history.length === 0) return null;
  return {
    fetchedAt: now,
    source: 'https://esankhyiki.mospi.gov.in/',
    indicators: mergeByKey(indicators, previous?.indicators),
    history: mergeByKey(history, previous?.history),
  };
}

/** Fetches every source, merges with the previous file and writes it. Returns { written, fresh: [names], out }. */
export async function publishHomePolicy({ out, fetchImpl = fetch, now = Date.now() }) {
  const previous = readJsonFile(out);
  const [rbi, macro, calendar] = await Promise.all([
    fetchRbi(fetchImpl, previous?.rbi, now),
    attempt('MoSPI indicators', () => fetchMacro(fetchImpl, previous?.macro, now)),
    fetchCalendar(fetchImpl, now),
  ]);
  const fresh = [rbi && 'rbi', macro && 'macro', calendar && 'calendar'].filter(Boolean);
  if (fresh.length === 0) return { written: false, fresh, out };
  writeJsonAtomically(out, {
    generatedAt: now,
    rbi: rbi ?? previous?.rbi ?? null,
    macro: macro ?? previous?.macro ?? null,
    calendar: calendar ?? previous?.calendar ?? null,
  });
  return { written: true, fresh, out };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await publishHomePolicy({ out: outPath(process.argv, 'data/policy.json') });
  if (!result.written) {
    console.error(`❌ [Policy] No source answered; ${result.out} left as it was.`);
    process.exit(1);
  }
  console.log(`✅ [Policy] refreshed ${result.fresh.join(' + ')} -> ${result.out}`);
}
