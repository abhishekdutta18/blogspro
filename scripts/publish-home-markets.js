/**
 * Publishes the homepage market figures to data/markets.json (no AI; one quote request per instrument).
 * Usage: node scripts/publish-home-markets.js [--out <path>]   (default: data/markets.json under the cwd)
 * Runs on a timer on the AI VPS, which then copies the file to the web server.
 * The write is atomic (temp file + rename), so the web server never serves half a file, and a fetch where
 * every quote failed leaves the previous file untouched. Exits 1 when nothing could be published.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchQuotes } from './lib/market-edition/market-data.js';
import { HOME_INSTRUMENTS, buildHomeMarkets } from './lib/market-edition/home-markets.js';

function readPrevious(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null; // first run, or a damaged file: start from nothing
  }
}

function writeAtomically(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, text);
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

/** Fetches, merges with the previous file and writes it. Returns { written, fresh, total, out }. */
export async function publishHomeMarkets({ out, fetchImpl = fetch, now = Date.now() }) {
  const yahooInstruments = HOME_INSTRUMENTS.map((i) => ({ symbol: i.yahoo, name: i.symbol }));
  const quotes = await fetchQuotes(yahooInstruments, { fetchImpl });
  const data = buildHomeMarkets(HOME_INSTRUMENTS, quotes, { previous: readPrevious(out), now });
  if (data.fresh === 0) return { written: false, fresh: 0, total: data.items.length, out };
  writeAtomically(out, JSON.stringify(data));
  return { written: true, fresh: data.fresh, total: data.items.length, out };
}

function outPath(argv) {
  const at = argv.indexOf('--out');
  return path.resolve(process.cwd(), at > -1 && argv[at + 1] ? argv[at + 1] : 'data/markets.json');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await publishHomeMarkets({ out: outPath(process.argv) });
  if (!result.written) {
    console.error(`❌ [Markets] No quotes fetched; ${result.out} left as it was.`);
    process.exit(1);
  }
  console.log(`✅ [Markets] ${result.fresh}/${HOME_INSTRUMENTS.length} fresh quotes, ${result.total} rows -> ${result.out}`);
}
