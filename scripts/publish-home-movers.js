/**
 * Publishes the best and worst performers of each homepage index today to data/movers.json
 * (https://blogspro.in/data/movers.json):
 *   { generatedAt, indices: [{ id, name, note, currency, fetchedAt, count, advancers, decliners,
 *                              gainers: [{ symbol, name, price, changePct }], losers: [...] }] }
 * Usage: node scripts/publish-home-movers.js [--out <path>] [--state <constituents cache path>]
 * Each market is refreshed only while it trades (plus a catch-up when its copy is older than a day), so the
 * per-stock Yahoo requests stay few. An index whose prices cover too few members keeps its last copy.
 * Exits 1 when no index could be built.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConstituents } from './lib/home-movers/constituents.js';
import { yahooChanges, nasdaqScreener, nasdaq100, normalizeTicker } from './lib/home-movers/quotes.js';
import { readJsonFile, writeJsonAtomically } from './lib/json-file.js';
import { outPath } from './publish-home-markets.js';

export const TOP = 5;
const MIN_COVERAGE = 0.8; // share of members that must have a price for the ranking to stand
const STALE_MS = 20 * 60 * 60 * 1000;
const NASDAQ_100_MIN = 95; // members; a shorter list means the API changed

// Trading windows in UTC minutes after midnight, weekdays only, with a margin for the closing prints.
const MARKET_HOURS = Object.freeze({
  IN: [3 * 60 + 30, 10 * 60 + 30], // 09:00-16:00 IST
  JP: [0, 7 * 60], // 09:00-16:00 JST
  US: [13 * 60 + 15, 21 * 60 + 30], // covers 09:30-16:00 New York in both DST seasons
});

export const INDICES = Object.freeze([
  { id: 'nifty50', name: 'Nifty 50', market: 'IN', currency: 'INR' },
  { id: 'sensex', name: 'Sensex', market: 'IN', currency: 'INR', note: 'NSE prices of the Sensex members' },
  { id: 'niftyBank', name: 'Nifty Bank', market: 'IN', currency: 'INR' },
  { id: 'sp500', name: 'S&P 500', market: 'US', currency: 'USD' },
  { id: 'nasdaq100', name: 'Nasdaq-100', market: 'US', currency: 'USD', note: 'Nasdaq-100 members; the Composite has about 3,300 stocks' },
  { id: 'nikkei225', name: 'Nikkei 225', market: 'JP', currency: 'JPY' },
]);

/** True while `market` trades (UTC weekday inside its window). */
export function isTrading(market, now) {
  const d = new Date(now);
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  const [open, close] = MARKET_HOURS[market];
  return minutes >= open && minutes <= close;
}

const round2 = (n) => Math.round(n * 100) / 100;
const displaySymbol = (symbol) => symbol.replace(/\.(NS|BO|T)$/, '');

/** Top and bottom `top` by day change plus breadth, from rows { symbol, name, price, changePct }. */
export function rankMovers(rows, top = TOP) {
  const sorted = [...rows].sort((a, b) => b.changePct - a.changePct);
  const shape = (r) => ({ symbol: displaySymbol(r.symbol), name: r.name, price: r.price, changePct: round2(r.changePct) });
  return {
    count: rows.length,
    advancers: rows.filter((r) => r.changePct > 0).length,
    decliners: rows.filter((r) => r.changePct < 0).length,
    gainers: sorted.slice(0, top).filter((r) => r.changePct > 0).map(shape),
    losers: sorted.slice(-top).reverse().filter((r) => r.changePct < 0).map(shape),
  };
}

/** Rows for an index's members from a quote lookup, or null when too few members have a price. */
export function membersWithQuotes(members, lookup) {
  const rows = members.map((m) => {
    const q = lookup(m.symbol);
    return q ? { symbol: m.symbol, name: m.name ?? q.name, price: q.price, changePct: q.changePct } : null;
  }).filter(Boolean);
  return rows.length >= Math.ceil(members.length * MIN_COVERAGE) ? rows : null;
}

async function marketRows(market, lists, fetchImpl) {
  if (market === 'US') {
    const [screener, ndx] = await Promise.all([nasdaqScreener(fetchImpl), nasdaq100(fetchImpl)]);
    const price = (s) => screener.get(normalizeTicker(s));
    return {
      sp500: lists.sp500 ? membersWithQuotes(lists.sp500.members, price) : null,
      nasdaq100: ndx.length >= NASDAQ_100_MIN ? membersWithQuotes(ndx, price) : null,
    };
  }
  const ids = INDICES.filter((i) => i.market === market && lists[i.id]).map((i) => i.id);
  const symbols = [...new Set(ids.flatMap((id) => lists[id].members.map((m) => m.symbol)))];
  const { quotes } = await yahooChanges(symbols, { fetchImpl });
  return Object.fromEntries(ids.map((id) => [id, membersWithQuotes(lists[id].members, (s) => quotes.get(s))]));
}

/** Refreshes the markets that are due, merges with the previous file and writes it. */
export async function publishHomeMovers({ out, state, fetchImpl = fetch, now = Date.now() }) {
  const previous = readJsonFile(out);
  const kept = new Map((previous?.indices ?? []).map((i) => [i.id, i]));
  const lists = await loadConstituents(readJsonFile(state) ?? {}, { fetchImpl, now });
  if (state) writeJsonAtomically(state, lists);

  const due = [...new Set(INDICES.map((i) => i.market))].filter((market) => isTrading(market, now)
    || INDICES.some((i) => i.market === market && !(now - (kept.get(i.id)?.fetchedAt ?? 0) < STALE_MS)));
  const rowsByIndex = {};
  for (const market of due) {
    try {
      Object.assign(rowsByIndex, await marketRows(market, lists, fetchImpl));
    } catch (error) {
      console.warn(`⚠️ [Movers] ${market} prices unavailable: ${error.message}`);
    }
  }

  const fresh = [];
  const indices = INDICES.map(({ market, ...meta }) => {
    const rows = rowsByIndex[meta.id];
    if (!rows) return kept.get(meta.id) ?? null;
    fresh.push(meta.id);
    return { ...meta, fetchedAt: now, ...rankMovers(rows) };
  }).filter(Boolean);
  if (fresh.length === 0) return { written: false, fresh, due, out };
  writeJsonAtomically(out, { generatedAt: now, indices });
  return { written: true, fresh, due, out };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const at = process.argv.indexOf('--state');
  const state = at > -1 && process.argv[at + 1] ? path.resolve(process.argv[at + 1]) : null;
  const result = await publishHomeMovers({ out: outPath(process.argv, 'data/movers.json'), state });
  if (!result.written) {
    // Nothing due (all markets closed and fresh) is normal; only a run that tried and failed is an error.
    const idle = result.due.length === 0;
    console[idle ? 'log' : 'error'](`${idle ? 'ℹ️' : '❌'} [Movers] nothing refreshed${idle ? ' (no market due)' : ''}; ${result.out} left as it was.`);
    process.exit(idle ? 0 : 1);
  }
  console.log(`✅ [Movers] refreshed ${result.fresh.join(', ')} (markets due: ${result.due.join(', ')}) -> ${result.out}`);
}
