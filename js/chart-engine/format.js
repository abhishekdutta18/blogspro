// format.js — Escaping and number formatting shared by all renderers. Pure.

const HTML_ESCAPES = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' });
const PREFIX_UNITS = new Set(['₹', '$', '€', '£']);
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

/**
 * Attach a unit: currency symbols prefix ("₹1.2K"), currency+scale splits around the number
 * ("$B" -> "$89B", "₹Cr" -> "₹12Cr"), "%" suffixes tight, anything else suffixes with a space.
 */
export function formatValue(n, unit = '') {
  const body = compactNumber(n);
  if (!unit) return body;
  const symbol = [...PREFIX_UNITS].find(s => unit.startsWith(s));
  if (symbol) {
    const scale = unit.slice(symbol.length);
    return n < 0 ? `-${symbol}${body.slice(1)}${scale}` : `${symbol}${body}${scale}`;
  }
  return unit === '%' ? `${body}%` : `${body} ${unit}`;
}
