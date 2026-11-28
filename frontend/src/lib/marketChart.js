/**
 * Geometry and text for the homepage market charts (the sparklines in the Markets table and the larger
 * chart above it). Points are [unixSeconds, value] pairs as published in /data/markets.json. Nothing here
 * touches the DOM (lib/marketChartView.js draws), so the maths is unit-tested directly in
 * tests/market-chart.test.mjs.
 */

const IST_OFFSET_S = 19_800; // UTC+5:30, so time ticks land on whole IST hours
const HOUR_S = 3600;
const TIME_STEPS_S = [1, 2, 3, 4, 6, 12].map((hours) => hours * HOUR_S);
const DOMAIN_PAD = 0.06; // share of the value span left empty above and below the line
const BASIS_POINTS_PER_PERCENT = 100;

const IST_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
const numberFormats = new Map();

const tenth = (n) => Math.round(n * 10) / 10;

/** Maps [d0, d1] onto [r0, r1]; a zero-width domain maps everything to the middle of the range. */
export function scaleLinear([d0, d1], [r0, r1]) {
  const span = d1 - d0;
  return (value) => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0));
}

/**
 * [min, max] covering every point and the previous close, padded, or null with no data. The previous close
 * is included so its reference line is always on the chart, even after a gap.
 */
export function valueDomain(points, prevClose = null) {
  const values = points.map((p) => p[1]);
  if (Number.isFinite(prevClose)) values.push(prevClose);
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * DOMAIN_PAD || Math.abs(max) * 0.001 || 1;
  return [min - pad, max + pad];
}

/** SVG path data for a line through the points ("M x y L x y …"), rounded to 0.1px. */
export function linePath(points, x, y) {
  return points.map(([t, v], i) => `${i === 0 ? 'M' : 'L'}${tenth(x(t))} ${tenth(y(v))}`).join('');
}

/** The same line closed down to `baseY`, for the faint area under it. */
export function areaPath(points, x, y, baseY) {
  if (points.length === 0) return '';
  const first = tenth(x(points[0][0]));
  const last = tenth(x(points.at(-1)[0]));
  return `${linePath(points, x, y)}L${last} ${tenth(baseY)}L${first} ${tenth(baseY)}Z`;
}

/** Round-number ticks (steps of 1, 2 or 5 × 10^n) between min and max, about `count` of them. */
export function valueTicks(min, max, count = 4) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/** Times (unix seconds) on whole IST hours from t0 to t1, spaced so there are at most `maxTicks`. */
export function timeTicks(t0, t1, maxTicks = 5) {
  if (!(t1 > t0)) return [];
  const step = TIME_STEPS_S.find((s) => (t1 - t0) / s <= maxTicks) ?? TIME_STEPS_S.at(-1);
  const ticks = [];
  for (let t = Math.ceil((t0 + IST_OFFSET_S) / step) * step - IST_OFFSET_S; t <= t1; t += step) ticks.push(t);
  return ticks;
}

/** Index of the point nearest in time to `t` (points sorted by time), or -1 with no points. */
export function nearestIndex(points, t) {
  if (points.length === 0) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] < t) lo = mid;
    else hi = mid;
  }
  return Math.abs(points[hi][0] - t) < Math.abs(points[lo][0] - t) ? hi : lo;
}

/** A value in its instrument's style ("25,634.90", "$3,883.90", "4.91%"), as `fmt` from the file says. */
export function formatChartValue(value, fmt) {
  const { locale = 'en-US', digits = 2, prefix = '', suffix = '' } = fmt ?? {};
  const key = `${locale}|${digits}`;
  if (!numberFormats.has(key)) {
    numberFormats.set(key, new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  }
  return `${prefix}${numberFormats.get(key).format(value)}${suffix}`;
}

/** "13:05" in IST for a unix time in seconds. */
export const formatIstTime = (t) => IST_TIME.format(new Date(t * 1000));

/**
 * Move from the previous close: "+0.42%", or basis points for values quoted in percent (yields),
 * matching the table's Change column. Null without a previous close.
 */
export function changeFromClose(value, prevClose, fmt) {
  if (!Number.isFinite(prevClose) || prevClose === 0 || !Number.isFinite(value)) return null;
  if (fmt?.suffix === '%') {
    const bp = Math.round((value - prevClose) * BASIS_POINTS_PER_PERCENT);
    return `${bp < 0 ? '-' : '+'}${Math.abs(bp)} bp`;
  }
  const pct = ((value - prevClose) / prevClose) * 100;
  const text = Math.abs(pct).toFixed(2);
  return `${pct < 0 && text !== '0.00' ? '-' : '+'}${text}%`;
}

/** 'up', 'down' or 'flat': the day's direction, which picks the line colour (the change text says it too). */
export function direction(last, prevClose) {
  if (!Number.isFinite(last) || !Number.isFinite(prevClose)) return 'flat';
  if (last > prevClose) return 'up';
  return last < prevClose ? 'down' : 'flat';
}
