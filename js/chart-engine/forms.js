// forms.js — Normalization for the chart forms that need more than a table: waterfall running
// totals, candlestick price validation, and date categories for a true time axis. Pure.
import { ChartSpecError, clip } from './payload.js';
import { parseIsoDate } from './time.js';

const CANDLE_FIELDS = Object.freeze(['Open', 'High', 'Low', 'Close']);

/**
 * Waterfall: rows named in `totals` show the running level (a value there resets it, e.g. an
 * opening balance); every other row is a change. Returns resolved values + total flags.
 * @param {{ categories: string[], series: { values: (number|null)[] }[] }} table
 * @param {unknown} rawTotals
 */
export function resolveWaterfall(table, rawTotals) {
  const names = new Set((Array.isArray(rawTotals) ? rawTotals : []).slice(0, table.categories.length).map(t => clip(t)));
  const totals = table.categories.map(c => names.has(c));
  const deltas = table.series[0]?.values ?? [];
  const { values } = deltas.reduce((acc, v, i) => {
    if (totals[i]) {
      const level = v ?? acc.level;
      return { level, values: [...acc.values, level] };
    }
    const change = v ?? 0;
    return { level: acc.level + change, values: [...acc.values, change] };
  }, { level: 0, values: [] });
  return { totals, values };
}

/**
 * Start and end level of each waterfall step (totals run from zero).
 * @param {{ totals: readonly boolean[], series: readonly { values: readonly (number|null)[] }[] }} spec
 * @returns {{ start: number, end: number }[]}
 */
export function waterfallLevels(spec) {
  return spec.series[0].values.reduce((acc, v, i) => {
    const prev = acc.at(-1)?.end ?? 0;
    const step = spec.totals[i] ? { start: 0, end: v ?? prev } : { start: prev, end: prev + (v ?? 0) };
    return [...acc, step];
  }, []);
}

/**
 * Candlestick rows must be [label, open, high, low, close] with high/low enclosing open/close.
 * A violation is a model error, so the chart is rejected with a reason the correction loop can use.
 * @returns {{ name: string, values: (number|null)[], dashed: boolean }[]} the four price series, renamed
 */
export function validateCandles(table) {
  if (table.series.length !== 4) throw new ChartSpecError('candlestick needs exactly 4 value columns: open, high, low, close');
  const [open, high, low, close] = table.series.map(s => s.values);
  table.categories.forEach((c, i) => {
    const row = [open[i], high[i], low[i], close[i]];
    if (row.some(v => v === null)) throw new ChartSpecError(`candlestick row "${c}" has a missing price`);
    if (high[i] < Math.max(open[i], close[i])) throw new ChartSpecError(`candlestick row "${c}": high is below open/close`);
    if (low[i] > Math.min(open[i], close[i])) throw new ChartSpecError(`candlestick row "${c}": low is above open/close`);
  });
  return table.series.map((s, i) => ({ ...s, name: CANDLE_FIELDS[i] }));
}

/** Timestamps for the categories when every one is an ISO date, else null. */
export function readTimes(categories) {
  if (categories.length === 0) return null;
  const times = categories.map(parseIsoDate);
  return times.every(t => t !== null) ? times : null;
}

/**
 * Reorder a table's rows into time order (models often list newest first).
 * @returns {{ table: object, times: number[] }}
 */
export function sortByTime(table, times) {
  const order = times.map((t, i) => i).sort((a, b) => times[a] - times[b]);
  const pick = list => order.map(i => list[i]);
  return {
    times: pick(times),
    table: {
      ...table,
      categories: pick(table.categories),
      series: table.series.map(s => ({ ...s, values: pick(s.values) })),
      cells: table.cells.map(col => pick(col)),
    },
  };
}
