/**
 * Publishes the homepage Policy section's data to data/policy.json, served as https://blogspro.in/data/policy.json:
 *   { generatedAt,
 *     rbi:      { fetchedAt, source, rates: [{ key, label, value }], usdInr, releases: [{ title, href, time }] },
 *     calendar: { fetchedAt, source, events: [{ title, country, time, forecast, previous }] } }
 * Usage: node scripts/publish-home-policy.js [--out <path>]   (default: data/policy.json under the cwd)
 * Each section keeps its own fetchedAt and its last good copy when its source fails, so a Forex Factory
 * rate limit never blanks the calendar or makes old data look new. Exits 1 when no source answered.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRbiRates, parseRbiReleases } from './lib/home-policy/rbi.js';
import { parseCalendar } from './lib/home-policy/calendar.js';
import { readJsonFile, writeJsonAtomically } from './lib/json-file.js';
import { outPath } from './publish-home-markets.js';

export const SOURCES = Object.freeze({
  rbiHome: 'https://www.rbi.org.in/',
  rbiPress: 'https://rbi.org.in/pressreleases_rss.xml',
  calendar: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
});
const REQUEST_TIMEOUT_MS = 20_000;
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
    attempt('RBI rates', async () => {
      const parsed = parseRbiRates(await fetchText(SOURCES.rbiHome, fetchImpl));
      if (!parsed) throw new Error('no policy rates found on the page');
      return parsed;
    }),
    attempt('RBI press releases', async () => parseRbiReleases(await fetchText(SOURCES.rbiPress, fetchImpl))),
  ]);
  if (!home) return null;
  return { fetchedAt: now, source: SOURCES.rbiHome, ...home, releases: releases ?? previous?.releases ?? [] };
}

function fetchCalendar(fetchImpl, now) {
  return attempt('Forex Factory calendar', async () => {
    const json = JSON.parse(await fetchText(SOURCES.calendar, fetchImpl)); // a 429 page is HTML and throws here
    if (!Array.isArray(json)) throw new Error('unexpected calendar format');
    return { fetchedAt: now, source: 'https://www.forexfactory.com/calendar', events: parseCalendar(json) };
  });
}

/** Fetches every source, merges with the previous file and writes it. Returns { written, fresh: [names], out }. */
export async function publishHomePolicy({ out, fetchImpl = fetch, now = Date.now() }) {
  const previous = readJsonFile(out);
  const [rbi, calendar] = await Promise.all([fetchRbi(fetchImpl, previous?.rbi, now), fetchCalendar(fetchImpl, now)]);
  const fresh = [rbi && 'rbi', calendar && 'calendar'].filter(Boolean);
  if (fresh.length === 0) return { written: false, fresh, out };
  writeJsonAtomically(out, {
    generatedAt: now,
    rbi: rbi ?? previous?.rbi ?? null,
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
