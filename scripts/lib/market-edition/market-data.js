/**
 * Market data for the editions — last price and day change per instrument from Yahoo Finance's chart API.
 * These numbers are rendered straight into the page; the writer model sees them as data and is told not
 * to invent others. An instrument that fails to load is reported as unavailable, never guessed.
 */

const CHART_URL = 'https://query2.finance.yahoo.com/v8/finance/chart/';
const REQUEST_TIMEOUT_MS = 8000;

export const INSTRUMENT_GROUPS = Object.freeze([
  {
    id: 'india',
    title: 'India',
    instruments: [
      { symbol: '^NSEI', name: 'Nifty 50' },
      { symbol: '^BSESN', name: 'Sensex' },
      { symbol: '^NSEBANK', name: 'Nifty Bank' },
      { symbol: '^CNXIT', name: 'Nifty IT' },
      { symbol: '^INDIAVIX', name: 'India VIX' },
    ],
  },
  {
    id: 'global',
    title: 'Global equities',
    instruments: [
      { symbol: '^GSPC', name: 'S&P 500' },
      { symbol: '^IXIC', name: 'Nasdaq' },
      { symbol: '^DJI', name: 'Dow Jones' },
      { symbol: '^FTSE', name: 'FTSE 100' },
      { symbol: '^N225', name: 'Nikkei 225' },
      { symbol: '^HSI', name: 'Hang Seng' },
    ],
  },
  {
    id: 'macro',
    title: 'Currencies, rates and commodities',
    instruments: [
      { symbol: 'USDINR=X', name: 'USD/INR' },
      { symbol: '^TNX', name: 'US 10Y yield' },
      { symbol: 'BZ=F', name: 'Brent crude' },
      { symbol: 'GC=F', name: 'Gold' },
      { symbol: 'BTC-USD', name: 'Bitcoin' },
    ],
  },
]);

/**
 * Quote fields from one chart response, or null when it has no usable price.
 * With range=1d, chartPreviousClose is the previous session's close, so the change is the day's move.
 */
export function parseChart(json) {
  const meta = json?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  const prevClose = Number(meta?.chartPreviousClose);
  if (!Number.isFinite(price) || price <= 0) return null;
  const hasPrev = Number.isFinite(prevClose) && prevClose > 0;
  const change = hasPrev ? price - prevClose : null;
  return {
    price,
    prevClose: hasPrev ? prevClose : null,
    change,
    changePct: hasPrev ? (change / prevClose) * 100 : null,
    currency: typeof meta.currency === 'string' ? meta.currency : '',
    asOf: Number.isFinite(meta.regularMarketTime) ? meta.regularMarketTime * 1000 : null,
  };
}

async function fetchQuote(instrument, fetchImpl) {
  const url = `${CHART_URL}${encodeURIComponent(instrument.symbol)}?interval=1d&range=1d`;
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const quote = parseChart(await res.json());
    if (!quote) throw new Error('no price in response');
    return { ...instrument, ...quote, ok: true };
  } catch (error) {
    console.warn(`⚠️ [Edition] Quote unavailable for ${instrument.symbol}: ${error.message}`);
    return { ...instrument, ok: false };
  }
}

/** Every group with its quotes, fetched in parallel. Failed instruments carry ok:false. */
export async function fetchMarketSnapshot({ fetchImpl = fetch } = {}) {
  return Promise.all(
    INSTRUMENT_GROUPS.map(async (group) => ({
      id: group.id,
      title: group.title,
      quotes: await Promise.all(group.instruments.map((i) => fetchQuote(i, fetchImpl))),
    })),
  );
}

/** Plain-text table of the snapshot for the writer prompt. */
export function snapshotToText(groups) {
  return groups
    .map((group) => {
      const lines = group.quotes.map((q) => {
        if (!q.ok) return `- ${q.name}: unavailable`;
        const move = q.changePct === null ? 'change n/a' : `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}% on the day`;
        return `- ${q.name}: ${q.price.toFixed(2)} ${q.currency} (${move})`;
      });
      return `${group.title}:\n${lines.join('\n')}`;
    })
    .join('\n\n');
}
