/**
 * Index membership for the homepage "top movers": which stocks make up each index, as
 * [{ symbol (Yahoo or US ticker), name }]. Sources are public lists that change a few times a year:
 *   Nifty 50, Nifty Bank  -> NSE's own constituent CSVs (niftyindices.com)
 *   Sensex                -> Wikipedia "List of BSE SENSEX companies" (BSE blocks automated requests)
 *   S&P 500               -> the maintained datasets/s-and-p-500-companies CSV
 *   Nikkei 225            -> Wikipedia "Nikkei 225" components (Nikkei's site blocks automated requests)
 * The Nasdaq-100 needs no list: Nasdaq's API returns its members with prices.
 * A parsed list shorter than its index's minimum is treated as a broken page, never as a smaller index.
 */

export const LIST_SOURCES = Object.freeze({
  nifty50: 'https://niftyindices.com/IndexConstituent/ind_nifty50list.csv',
  niftyBank: 'https://niftyindices.com/IndexConstituent/ind_niftybanklist.csv',
  sensex: 'https://en.wikipedia.org/w/api.php?action=parse&page=List_of_BSE_SENSEX_companies&prop=wikitext&format=json&formatversion=2',
  sp500: 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv',
  nikkei225: 'https://en.wikipedia.org/w/api.php?action=parse&page=Nikkei_225&prop=wikitext&format=json&formatversion=2',
});

// Fewer members than this means the page changed shape (Nikkei's Wikipedia list misses one code).
export const MIN_MEMBERS = Object.freeze({ nifty50: 45, niftyBank: 10, sensex: 28, sp500: 480, nikkei225: 200 });

/** Splits one CSV line, honouring double-quoted fields with commas. */
export function csvFields(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else field += ch;
  }
  fields.push(field);
  return fields.map((f) => f.trim());
}

/** CSV text -> rows keyed by header. */
function csvRows(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const keys = csvFields(header);
  return lines.filter(Boolean).map((line) => Object.fromEntries(csvFields(line).map((v, i) => [keys[i], v])));
}

const SYMBOL = /^[A-Z0-9&.-]{1,20}$/;
const unique = (members) => [...new Map(members.map((m) => [m.symbol, m])).values()];

/** NSE constituent CSV (Company Name, Industry, Symbol, ...) -> Yahoo NSE tickers ("RELIANCE.NS"). */
export function parseNseCsv(text) {
  return unique(csvRows(text)
    .filter((r) => SYMBOL.test(r.Symbol ?? '') && r['Company Name'])
    .map((r) => ({ symbol: `${r.Symbol}.NS`, name: r['Company Name'] })));
}

/** S&P 500 CSV (Symbol, Security, ...) -> US tickers ("BRK.B"). */
export function parseSp500Csv(text) {
  return unique(csvRows(text)
    .filter((r) => SYMBOL.test(r.Symbol ?? '') && r.Security)
    .map((r) => ({ symbol: r.Symbol, name: r.Security })));
}

// [[Target|Label]] or [[Target]] -> the text a reader sees.
const linkText = (s) => s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '').trim();

/**
 * Wikipedia wikitext of the Sensex list: each row is "![[Company]]" followed by "|SYMBOL.BO". Prices come
 * from NSE (same companies, tighter Yahoo coverage), so ".BO" becomes ".NS".
 */
export function parseSensexWikitext(wikitext) {
  const current = wikitext.slice(Math.max(0, wikitext.indexOf('id="constituents"')));
  const rows = [...current.matchAll(/^!\s*(.+)\n\|\s*([A-Z0-9&-]+)\.BO\s*$/gm)];
  return unique(rows.map(([, company, symbol]) => ({ symbol: `${symbol}.NS`, name: linkText(company) })));
}

/** Wikipedia wikitext of the Nikkei 225 page: bullets like "*[[Toyota|Toyota Motor]] Corp. ({{tyo2|7203}})". */
export function parseNikkeiWikitext(wikitext) {
  const components = wikitext.slice(Math.max(0, wikitext.indexOf('==Components==')));
  const rows = [...components.matchAll(/^\*(.+?)\(\{\{(?:tyo2|TYO)\|(\d{4}[A-Z]?)\}\}\)/gim)];
  return unique(rows.map(([, name, code]) => ({ symbol: `${code}.T`, name: linkText(name).replace(/\s+/g, ' ') })));
}

const PARSERS = Object.freeze({
  nifty50: (text) => parseNseCsv(text),
  niftyBank: (text) => parseNseCsv(text),
  sensex: (text) => parseSensexWikitext(JSON.parse(text).parse.wikitext),
  sp500: (text) => parseSp500Csv(text),
  nikkei225: (text) => parseNikkeiWikitext(JSON.parse(text).parse.wikitext),
});

export const LIST_REFRESH_MS = 7 * 24 * 60 * 60 * 1000; // memberships change a few times a year
// Wikipedia asks bots to identify themselves; niftyindices.com stalls on anything but a browser.
const BOT_UA = 'BlogsProMovers/1.0 (https://blogspro.in/; newsletter@mail.blogspro.in)';
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const userAgent = (url) => (url.includes('niftyindices.com') ? BROWSER_UA : BOT_UA);
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Every list, from `cache` ({ [id]: { fetchedAt, members } }) when younger than a week, otherwise
 * refetched; a failed or too-short refetch keeps the cached copy. Returns the new cache.
 */
export async function loadConstituents(cache = {}, { fetchImpl = fetch, now = Date.now() } = {}) {
  const entries = await Promise.all(Object.keys(PARSERS).map(async (id) => {
    const cached = cache[id];
    if (cached?.members?.length && now - cached.fetchedAt < LIST_REFRESH_MS) return [id, cached];
    try {
      const res = await fetchImpl(LIST_SOURCES[id], { headers: { 'User-Agent': userAgent(LIST_SOURCES[id]) }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const members = PARSERS[id](await res.text());
      if (members.length < MIN_MEMBERS[id]) throw new Error(`only ${members.length} members parsed`);
      return [id, { fetchedAt: now, members }];
    } catch (error) {
      console.warn(`⚠️ [Movers] ${id} list unavailable, keeping the cached one: ${error.message}`);
      return [id, cached ?? null];
    }
  }));
  return Object.fromEntries(entries.filter(([, value]) => value));
}
