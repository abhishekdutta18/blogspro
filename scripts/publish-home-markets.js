/**
 * Publishes the homepage market figures to data/markets.json (no AI; one quote request per instrument).
 * Usage: node scripts/publish-home-markets.js [--out <path>]   (default: data/markets.json under the cwd)
 * Runs on a timer on the AI VPS, which then copies the file to the web server.
 * The write is atomic, so the web server never serves half a file, and a fetch where every quote failed
 * leaves the previous file untouched. Exits 1 when nothing could be published.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchQuotes, INTRADAY } from './lib/market-edition/market-data.js';
import { HOME_INSTRUMENTS, buildHomeMarkets } from './lib/market-edition/home-markets.js';
import { readJsonFile, writeJsonAtomically } from './lib/json-file.js';

/** Fetches, merges with the previous file and writes it. Returns { written, fresh, total, out }. */
export async function publishHomeMarkets({ out, fetchImpl = fetch, now = Date.now() }) {
  const yahooInstruments = HOME_INSTRUMENTS.map((i) => ({ symbol: i.yahoo, name: i.symbol }));
  const quotes = await fetchQuotes(yahooInstruments, { fetchImpl, query: INTRADAY });
  const data = buildHomeMarkets(HOME_INSTRUMENTS, quotes, { previous: readJsonFile(out), now });
  if (data.fresh === 0) return { written: false, fresh: 0, total: data.items.length, out };
  writeJsonAtomically(out, data);
  return { written: true, fresh: data.fresh, total: data.items.length, out };
}

/** The --out argument resolved against the cwd, or `fallback`. */
export function outPath(argv, fallback) {
  const at = argv.indexOf('--out');
  return path.resolve(process.cwd(), at > -1 && argv[at + 1] ? argv[at + 1] : fallback);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await publishHomeMarkets({ out: outPath(process.argv, 'data/markets.json') });
  if (!result.written) {
    console.error(`❌ [Markets] No quotes fetched; ${result.out} left as it was.`);
    process.exit(1);
  }
  console.log(`✅ [Markets] ${result.fresh}/${HOME_INSTRUMENTS.length} fresh quotes, ${result.total} rows -> ${result.out}`);
}
