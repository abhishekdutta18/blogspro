// format.js — Escaping and number formatting shared by all renderers. Pure.

const HTML_ESCAPES = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' });
const PREFIX_UNITS = Object.freeze(['₹', '$', '€', '£']);
// Indian scale words: lakh = 1e5, crore = 1e7, lakh crore = 1e12 (how RBI/Budget figures are quoted).
const RUPEE_STEPS = Object.freeze([
  [1e12, 'L Cr'],
  [1e7, 'Cr'],
  [1e5, 'L'],
]);
const GROUPERS = Object.freeze({
  '₹': new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }), // 1,23,456
  default: new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }), // 123,456
});
const COMPACT_STEPS = Object.freeze([
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
]);

/** Escape a value for safe interpolation into HTML/SVG text or attributes. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

/** Round to at most `digits` decimals and drop trailing zeros ("1.50" -> "1.5"). */
function trimNumber(n, digits = 2) {
  return String(Number(n.toFixed(digits)));
}

/** 1500 -> "1.5K", 2300000 -> "2.3M". Values below 1000 keep up to 2 decimals. */
export function compactNumber(n) {
  if (!Number.isFinite(n)) return '–';
  const abs = Math.abs(n);
  const step = COMPACT_STEPS.find(([size]) => abs >= size);
  return step ? `${trimNumber(n / step[0], 1)}${step[1]}` : trimNumber(n);
}

/** Digit grouping in the convention of the currency (Indian lakh grouping for ₹). */
function groupDigits(abs, symbol) {
  return (GROUPERS[symbol] ?? GROUPERS.default).format(abs);
}

/** 250000 -> "2.5L", 12500000 -> "1.25Cr", 2.5e12 -> "2.5L Cr"; below a lakh, grouped. */
function rupeeCompact(abs) {
  const step = RUPEE_STEPS.find(([size]) => abs >= size);
  return step ? `${trimNumber(abs / step[0], 2)}${step[1]}` : groupDigits(abs, '₹');
}

/** Magnitude text for a currency amount: a unit that already names its scale is never re-scaled. */
function currencyMagnitude(abs, symbol, scale) {
  if (scale) return groupDigits(abs, symbol); // "₹Cr" 4210 -> "4,210", never "4.2K"
  return symbol === '₹' ? rupeeCompact(abs) : compactNumber(abs);
}

/**
 * Attach a unit. Currency symbols prefix ("$1.5K", "₹2.5L"); currency + scale splits around a
 * grouped number ("$B" -> "$1,250B", "₹Cr" -> "₹1,23,456Cr"); "%" suffixes tight; anything
 * else suffixes with a space ("25 bps").
 * @param {number} n
 * @param {string} [unit]
 * @returns {string}
 */
export function formatValue(n, unit = '') {
  if (!Number.isFinite(n)) return '–';
  const symbol = PREFIX_UNITS.find(s => unit.startsWith(s));
  if (symbol) {
    const scale = unit.slice(symbol.length);
    return `${n < 0 ? '-' : ''}${symbol}${currencyMagnitude(Math.abs(n), symbol, scale)}${scale}`;
  }
  const body = compactNumber(n);
  if (!unit) return body;
  return unit === '%' ? `${body}%` : `${body} ${unit}`;
}

/**
 * Like formatValue, but never compacts ("25,650", "₹1,23,456"): for prices and for axis ticks
 * whose compact labels would collide ("25.6K" twice).
 * @param {number} n
 * @param {string} [unit]
 * @returns {string}
 */
export function formatFull(n, unit = '') {
  if (!Number.isFinite(n)) return '–';
  const symbol = PREFIX_UNITS.find(s => unit.startsWith(s));
  const sign = n < 0 ? '-' : '';
  if (symbol) return `${sign}${symbol}${groupDigits(Math.abs(n), symbol)}${unit.slice(symbol.length)}`;
  const body = `${sign}${groupDigits(Math.abs(n), 'default')}`;
  if (!unit) return body;
  return unit === '%' ? `${body}%` : `${body} ${unit}`;
}

/**
 * Labels for a set of axis ticks: compact unless two would read the same (or `exact`, for
 * prices), then full.
 * @param {number[]} ticks
 * @param {string} [unit]
 * @param {boolean} [exact]
 * @returns {string[]}
 */
export function tickLabels(ticks, unit = '', exact = false) {
  if (exact) return ticks.map(t => formatFull(t, unit));
  const compact = ticks.map(t => formatValue(t, unit));
  return new Set(compact).size === compact.length ? compact : ticks.map(t => formatFull(t, unit));
}
