/**
 * Homepage market figures: the instruments the homepage strip and Markets table show, fetched from the same
 * Yahoo chart endpoint the editions use and formatted for display, so the browser only swaps text in.
 * Output (written to /data/markets.json by scripts/publish-home-markets.js):
 *   { generatedAt, fresh, items: [{ symbol, price, change, isPositive, range, open, asOf, live,
 *                                   last, prevClose, fmt, points: [[unixSeconds, value], ...] }] }
 * `points` are today's 5-minute closes (at most 120) for the homepage charts; `fmt` tells the browser how
 * to format chart values in the same style as `price`.
 * `symbol` is the homepage's own label (e.g. 'NSE:NIFTY'). A quote that fails keeps its previous row, with
 * its own older `asOf`, so one bad fetch never blanks a figure or passes old data off as new.
 */
import { marketStatus } from './market-data.js';

// The India 10-year G-Sec is left out on purpose: there is no reliable free quote for it.
export const HOME_INSTRUMENTS = Object.freeze([
  { symbol: 'NSE:NIFTY', yahoo: '^NSEI', style: 'inr' },
  { symbol: 'BSE:SENSEX', yahoo: '^BSESN', style: 'inr' },
  { symbol: 'NSE:BANKNIFTY', yahoo: '^NSEBANK', style: 'inr' },
  { symbol: 'SPX', yahoo: '^GSPC', style: 'num' },
  { symbol: 'IXIC', yahoo: '^IXIC', style: 'num' },
  { symbol: 'NI225', yahoo: '^N225', style: 'num' },
  { symbol: 'USDINR', yahoo: 'USDINR=X', style: 'fx2' },
  { symbol: 'EURINR', yahoo: 'EURINR=X', style: 'fx2' },
  { symbol: 'GBPINR', yahoo: 'GBPINR=X', style: 'fx2' },
  { symbol: 'EURUSD', yahoo: 'EURUSD=X', style: 'fx4' },
  { symbol: 'DXY', yahoo: 'DX-Y.NYB', style: 'num' },
  { symbol: 'GOLD', yahoo: 'GC=F', style: 'usd' },
  { symbol: 'USOIL', yahoo: 'CL=F', style: 'usd' },
  { symbol: 'COPPER', yahoo: 'HG=F', style: 'usd' },
  { symbol: 'US10Y', yahoo: '^TNX', style: 'yield' },
  { symbol: 'BTCUSDT', yahoo: 'BTC-USD', style: 'usd0' },
  { symbol: 'ETHUSDT', yahoo: 'ETH-USD', style: 'usd' },
]);

const numberFormat = (locale, digits) => new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const FORMATS = Object.freeze({
  inr: numberFormat('en-IN', 2),
  num: numberFormat('en-US', 2),
  fx2: numberFormat('en-US', 2),
  fx4: numberFormat('en-US', 4),
  usd: numberFormat('en-US', 2),
  usd0: numberFormat('en-US', 0),
  yield: numberFormat('en-US', 2),
});

const BASIS_POINTS_PER_PERCENT = 100;

function formatValue(style, value) {
  if (!Number.isFinite(value)) return null;
  const text = FORMATS[style].format(value);
  if (style === 'usd' || style === 'usd0') return `$${text}`;
  return style === 'yield' ? `${text}%` : text;
}

const signed = (n, text) => `${n >= 0 ? '+' : '-'}${text}`;

// Yields move in basis points; everything else in percent of the previous close.
function formatChange(style, quote) {
  if (style === 'yield') {
    if (!Number.isFinite(quote.change)) return '—';
    const bp = Math.round(quote.change * BASIS_POINTS_PER_PERCENT);
    return signed(bp, `${Math.abs(bp)} bp`);
  }
  if (!Number.isFinite(quote.changePct)) return '—';
  return signed(quote.changePct, `${Math.abs(quote.changePct).toFixed(2)}%`);
}

// How the browser formats chart axis and tooltip values for each style (it has no Intl presets of its own).
const CHART_FORMATS = Object.freeze({
  inr: { locale: 'en-IN', digits: 2, prefix: '', suffix: '' },
  num: { locale: 'en-US', digits: 2, prefix: '', suffix: '' },
  fx2: { locale: 'en-US', digits: 2, prefix: '', suffix: '' },
  fx4: { locale: 'en-US', digits: 4, prefix: '', suffix: '' },
  usd: { locale: 'en-US', digits: 2, prefix: '$', suffix: '' },
  usd0: { locale: 'en-US', digits: 0, prefix: '$', suffix: '' },
  yield: { locale: 'en-US', digits: 2, prefix: '', suffix: '%' },
});
const MAX_POINTS = 120;
const SIGNIFICANT_DIGITS = 6;

const round = (value) => Number(value.toPrecision(SIGNIFICANT_DIGITS));

/** Chart points as [unix seconds, value], thinned evenly to MAX_POINTS while always keeping the latest. */
export function chartPoints(points = []) {
  const valid = points.filter((p) => Number.isFinite(p?.t) && Number.isFinite(p?.close));
  const step = Math.ceil(valid.length / MAX_POINTS);
  const kept = valid.filter((_, i) => (valid.length - 1 - i) % step === 0);
  return kept.map((p) => [Math.floor(p.t / 1000), round(p.close)]);
}

/** One display row for a fetched quote, with the numbers and points its chart needs. */
export function formatHomeItem(instrument, quote, now = Date.now()) {
  const { style } = instrument;
  const hasRange = Number.isFinite(quote.dayLow) && Number.isFinite(quote.dayHigh);
  return {
    symbol: instrument.symbol,
    price: formatValue(style, quote.price),
    change: formatChange(style, quote),
    isPositive: !(Number(quote.change) < 0),
    range: hasRange ? `${formatValue(style, quote.dayLow)} – ${formatValue(style, quote.dayHigh)}` : null,
    open: formatValue(style, quote.open),
    asOf: Number.isFinite(quote.asOf) ? quote.asOf : null,
    live: marketStatus(quote, now) === 'live',
    last: quote.price,
    prevClose: Number.isFinite(quote.prevClose) ? quote.prevClose : null,
    fmt: CHART_FORMATS[style],
    points: chartPoints(quote.points),
  };
}

/**
 * The file contents for this run: a fresh row per successful quote, else the previous file's row (re-judged
 * for liveness against `now`). `fresh` counts rows fetched this run; zero means nothing new was learned.
 */
export function buildHomeMarkets(instruments, quotes, { previous = null, now = Date.now() } = {}) {
  const previousItems = Array.isArray(previous?.items) ? previous.items : [];
  const kept = new Map(previousItems.map((item) => [item.symbol, item]));
  const rows = instruments.map((instrument, index) => {
    const quote = quotes[index];
    if (quote?.ok) return { item: formatHomeItem(instrument, quote, now), fresh: true };
    const old = kept.get(instrument.symbol);
    if (!old) return null;
    return { item: { ...old, live: marketStatus({ asOf: old.asOf }, now) === 'live' }, fresh: false };
  }).filter(Boolean);
  return {
    generatedAt: now,
    fresh: rows.filter((r) => r.fresh).length,
    items: rows.map((r) => r.item),
  };
}
