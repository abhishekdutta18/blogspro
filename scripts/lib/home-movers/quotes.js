/**
 * Day changes for index members, from two kinds of source:
 *   - Yahoo's chart endpoint, one request per stock (Indian and Japanese stocks), a few at a time. The
 *     first HTTP 429 stops every further request in the run, so a rate limit never turns into a ban that
 *     would also break the homepage market figures (same endpoint).
 *   - Nasdaq's public API: the stock screener (every US listing in one call) and the Nasdaq-100 list.
 * Every function returns rows shaped { symbol, name?, price, changePct } and skips unusable ones.
 */
import { parseChart } from '../market-edition/market-data.js';

const CHART_URL = 'https://query2.finance.yahoo.com/v8/finance/chart/';
const NASDAQ = Object.freeze({
  screener: 'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&download=true',
  nasdaq100: 'https://api.nasdaq.com/api/quote/list-type/nasdaq100',
});
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 15_000;
export const YAHOO_CONCURRENCY = 3;

/** "$1,234.50" / "+1.60%" / "-0.919%" -> number, else null. */
export function parseNumber(text) {
  const n = Number(String(text ?? '').replace(/[$,%+\s]/g, ''));
  return text !== '' && text != null && Number.isFinite(n) ? n : null;
}

/** US tickers are written BRK.B, BRK/B or BRK-B depending on the source; compare them as BRK-B. */
export const normalizeTicker = (symbol) => String(symbol).toUpperCase().replace(/[./]/g, '-');

/**
 * Yahoo quotes for `symbols`, at most `concurrency` in flight. Returns { quotes: Map(symbol -> { price,
 * changePct }), rateLimited } — after a 429 the remaining symbols are not requested.
 */
export async function yahooChanges(symbols, { fetchImpl = fetch, concurrency = YAHOO_CONCURRENCY } = {}) {
  const quotes = new Map();
  let rateLimited = false;
  let next = 0;
  const worker = async () => {
    while (next < symbols.length && !rateLimited) {
      const symbol = symbols[next];
      next += 1;
      try {
        const res = await fetchImpl(`${CHART_URL}${encodeURIComponent(symbol)}?interval=1d&range=1d`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.status === 429) {
          rateLimited = true;
          break;
        }
        if (!res.ok) continue;
        const quote = parseChart(await res.json());
        if (quote && Number.isFinite(quote.changePct)) quotes.set(symbol, { price: quote.price, changePct: quote.changePct });
      } catch {
        // One stock failing (timeout, bad body) only leaves that stock out.
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (rateLimited) console.warn(`⚠️ [Movers] Yahoo rate limit hit after ${quotes.size}/${symbols.length} quotes; stopping this run`);
  return { quotes, rateLimited };
}

async function nasdaqJson(url, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 2),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Every US listing's price and day change: Map(normalized ticker -> { name, price, changePct }). */
export async function nasdaqScreener(fetchImpl = fetch) {
  const rows = (await nasdaqJson(NASDAQ.screener, fetchImpl))?.data?.rows ?? [];
  return new Map(rows
    .map((r) => [normalizeTicker(r.symbol), { name: r.name, price: parseNumber(r.lastsale), changePct: parseNumber(r.pctchange) }])
    .filter(([, q]) => q.price !== null && q.changePct !== null));
}

/**
 * Nasdaq-100 membership: [{ symbol, name }]. Only the list is used: its prices can come from a different
 * session than the screener's, so both US indices are priced from the screener to agree with each other.
 */
export async function nasdaq100(fetchImpl = fetch) {
  const rows = (await nasdaqJson(NASDAQ.nasdaq100, fetchImpl))?.data?.data?.rows ?? [];
  return rows.filter((r) => r.symbol).map((r) => ({ symbol: r.symbol, name: r.companyName.replace(/ (Common|Class [A-C]|Ordinary|American Depositary).*$/, '') }));
}
