// time.js — Calendar math for date categories: strict ISO parsing, short labels, and tick
// placement on round calendar units (days, months, years). UTC throughout, so output never
// depends on the build machine's timezone. Pure.

const DAY = 86_400_000;
const MONTHS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
const ISO_DATE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;
const MAX_TICK_ITERATIONS = 500; // hard cap: tick generation can never loop unbounded

/** Candidate steps, finest first; the first one producing few enough ticks wins. */
const STEPS = Object.freeze([
  ['day', 1], ['day', 2], ['day', 7], ['day', 14],
  ['month', 1], ['month', 2], ['month', 3], ['month', 6],
  ['year', 1], ['year', 2], ['year', 5], ['year', 10], ['year', 25], ['year', 50], ['year', 100],
]);

/**
 * Parse "YYYY-MM-DD" or "YYYY-MM" (first of the month) to a UTC timestamp; anything else -> null.
 * Rejects impossible dates ("2025-02-30") instead of letting Date roll them over.
 * @param {unknown} value
 * @returns {number|null}
 */
export function parseIsoDate(value) {
  const m = ISO_DATE.exec(String(value ?? '').trim());
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), m[3] === undefined ? 1 : Number(m[3])];
  if (month < 1 || month > 12 || day < 1) return null;
  const t = Date.UTC(year, month - 1, day);
  return new Date(t).getUTCDate() === day ? t : null;
}

/** "12 Nov" — the short label for a single day. */
export function dayLabel(t) {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function label(t, unit) {
  const d = new Date(t);
  if (unit === 'day') return dayLabel(t);
  if (unit === 'month') return `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
  return String(d.getUTCFullYear());
}

/** First tick at or after t0, aligned to the step (Jan-aligned months, round years). */
function firstTick(t0, unit, n) {
  const d = new Date(t0);
  if (unit === 'day') return Math.ceil(t0 / DAY) * DAY;
  if (unit === 'month') {
    const month = d.getUTCMonth() + (d.getUTCDate() > 1 || t0 % DAY !== 0 ? 1 : 0);
    const aligned = Math.ceil(month / n) * n;
    return Date.UTC(d.getUTCFullYear(), aligned, 1);
  }
  const year = d.getUTCFullYear() + (t0 > Date.UTC(d.getUTCFullYear(), 0, 1) ? 1 : 0);
  return Date.UTC(Math.ceil(year / n) * n, 0, 1);
}

function advance(t, unit, n) {
  if (unit === 'day') return t + n * DAY;
  const d = new Date(t);
  return unit === 'month' ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1) : Date.UTC(d.getUTCFullYear() + n, 0, 1);
}

function ticksFor(t0, t1, unit, n, limit) {
  const out = [];
  for (let t = firstTick(t0, unit, n), i = 0; t <= t1 && i < MAX_TICK_ITERATIONS; t = advance(t, unit, n), i += 1) {
    out.push(t);
    if (out.length > limit) break; // already too many for this step; caller moves on
  }
  return out;
}

/**
 * Calendar ticks between t0 and t1 using the finest unit that yields at most `maxTicks`.
 * @param {number} t0
 * @param {number} t1
 * @param {number} maxTicks
 * @returns {{ t: number, label: string }[]}
 */
export function timeTicks(t0, t1, maxTicks) {
  const limit = Math.max(1, Math.floor(maxTicks));
  if (t1 <= t0) return [{ t: t0, label: dayLabel(t0) }];
  for (const [unit, n] of STEPS) {
    const ticks = ticksFor(t0, t1, unit, n, limit);
    if (ticks.length >= 1 && ticks.length <= limit) return ticks.map(t => ({ t, label: label(t, unit) }));
  }
  return [{ t: t0, label: label(t0, 'year') }];
}
