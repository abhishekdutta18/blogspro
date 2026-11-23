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
    id: 'sectors',
    title: 'NSE sectors',
    instruments: [
      { symbol: '^CNXFIN', name: 'Financials' },
      { symbol: '^CNXPSUBANK', name: 'PSU Bank' },
      { symbol: '^CNXAUTO', name: 'Auto' },
      { symbol: '^CNXPHARMA', name: 'Pharma' },
      { symbol: '^CNXFMCG', name: 'FMCG' },
      { symbol: '^CNXMETAL', name: 'Metal' },
      { symbol: '^CNXENERGY', name: 'Energy' },
      { symbol: '^CNXREALTY', name: 'Realty' },
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

/** A positive finite number, else null (Yahoo reports an unknown day high/low as 0). */
const positiveOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Quote fields from one chart response, or null when it has no usable price.
 * With range=1d, chartPreviousClose is the previous session's close, so the change is the day's move.
 * Day high, low and open are null when Yahoo does not report them.
 */
export function parseChart(json) {
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
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
    exchangeTz: typeof meta.exchangeTimezoneName === 'string' ? meta.exchangeTimezoneName : 'UTC',
    dayHigh: positiveOrNull(meta.regularMarketDayHigh),
    dayLow: positiveOrNull(meta.regularMarketDayLow),
    open: positiveOrNull(result?.indicators?.quote?.[0]?.open?.[0]),
  };
}

const DAILY = 'interval=1d&range=1d';
export const INTRADAY = 'interval=5m&range=1d'; // same quote fields as DAILY, plus today's 5-minute bars

// `points` are the response's bars ([{ t, close }]): one for DAILY, the session so far for INTRADAY.
async function fetchQuote(instrument, fetchImpl, query = DAILY) {
  const url = `${CHART_URL}${encodeURIComponent(instrument.symbol)}?${query}`;
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const quote = parseChart(json);
    if (!quote) throw new Error('no price in response');
    return { ...instrument, ...quote, points: parseHistory(json), ok: true };
  } catch (error) {
    console.warn(`⚠️ [Edition] Quote unavailable for ${instrument.symbol}: ${error.message}`);
    return { ...instrument, ok: false };
  }
}

/** Quotes for any instrument list ([{ symbol, ... }]), in order; failed ones carry ok:false. */
export function fetchQuotes(instruments, { fetchImpl = fetch, query = DAILY } = {}) {
  return Promise.all(instruments.map((i) => fetchQuote(i, fetchImpl, query)));
}

// One-month daily closes drawn as line charts (one chart each: different scales never share an axis).
export const HISTORY_INSTRUMENTS = Object.freeze([
  { symbol: '^NSEI', name: 'Nifty 50' },
  { symbol: '^GSPC', name: 'S&P 500' },
]);

/** Daily closes from a chart response as [{ t (ms), close }], skipping null bars. */
export function parseHistory(json) {
  const result = json?.chart?.result?.[0];
  const stamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  return stamps
    .map((t, i) => ({ t: t * 1000, close: Number(closes[i]) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.close) && p.close > 0);
}

/** One-month history per HISTORY_INSTRUMENTS entry; a failed fetch yields an empty series. */
export async function fetchHistories({ fetchImpl = fetch } = {}) {
  return Promise.all(HISTORY_INSTRUMENTS.map(async (instrument) => {
    const url = `${CHART_URL}${encodeURIComponent(instrument.symbol)}?interval=1d&range=1mo`;
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { ...instrument, points: parseHistory(await res.json()) };
    } catch (error) {
      console.warn(`⚠️ [Edition] History unavailable for ${instrument.symbol}: ${error.message}`);
      return { ...instrument, points: [] };
    }
  }));
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

const LAST_TRADE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
});

/** "Fri 20 Nov, 03:05 IST" for a quote time, or '' when unknown. */
export function formatLastTrade(ms) {
  return Number.isFinite(ms) ? `${LAST_TRADE.format(new Date(ms)).replace(/,? at /, ', ')} IST` : '';
}

// A quote older than this is treated as a closed session rather than live trading.
const LIVE_WINDOW_MS = 90 * 60 * 1000;

/** Day of a timestamp in the exchange's own timezone ("Fri 20 Nov"), falling back to UTC for unknown zones. */
function sessionDay(ms, timeZone) {
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  try {
    return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone }).format(new Date(ms)).replace(',', '');
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(new Date(ms)).replace(',', '');
  }
}

/** "live" while a quote is fresh, otherwise "closed, Fri 20 Nov session" in the exchange's local day. */
export function marketStatus(quote, now = Date.now()) {
  if (!Number.isFinite(quote.asOf)) return 'status unknown';
  return now - quote.asOf <= LIVE_WINDOW_MS ? 'live' : `closed, ${sessionDay(quote.asOf, quote.exchangeTz)} session`;
}

/** Latest quote time in a group (ms), or null. */
export function latestQuoteTime(group) {
  const times = group.quotes.filter((q) => q.ok && Number.isFinite(q.asOf)).map((q) => q.asOf);
  return times.length ? Math.max(...times) : null;
}

/** Plain-text table of the snapshot for the writer prompt, with each market's live/closed status. */
export function snapshotToText(groups, now = Date.now()) {
  return groups
    .map((group) => {
      const lines = group.quotes.map((q) => {
        if (!q.ok) return `- ${q.name}: unavailable`;
        const move = q.changePct === null ? 'change n/a' : `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}% vs previous close`;
        return `- ${q.name}: ${q.price.toFixed(2)} ${q.currency} (${move}; ${marketStatus(q, now)})`;
      });
      return `${group.title}:\n${lines.join('\n')}`;
    })
    .join('\n\n');
}
