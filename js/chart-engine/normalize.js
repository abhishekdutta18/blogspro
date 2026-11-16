// normalize.js — Builds one frozen ChartSpec from any payload, translating the option
// vocabularies of Google Charts (isStacked, pieHole, curveType, viewWindow, red/yellowFrom,
// series.lineDashStyle), Chart.js (scales.*.stacked, cutout, tension, borderDash, plugins.legend)
// and the admin chart-builder (name/subtitle/source, stats, table). Pure; never evals.

/**
 * @typedef {'bar'|'line'|'pie'|'gauge'|'stats'|'table'} ChartType
 * @typedef {{ readonly name: string, readonly values: readonly (number|null)[], readonly dashed: boolean }} Series
 * @typedef {'good'|'warning'|'critical'|'normal'} Level
 * @typedef {{ readonly label: string, readonly value: number, readonly min: number, readonly max: number,
 *   readonly bands: readonly { from: number, to: number, level: Level }[], readonly level: Level }} Gauge
 * @typedef {{ kind: 'line', value: number, label: string } | { kind: 'band', from: number, to: number, label: string }} Reference
 * @typedef {Readonly<{
 *   type: ChartType, orientation: 'horizontal'|'vertical', stacked: boolean, area: boolean,
 *   curve: 'linear'|'smooth', sparkline: boolean, hole: number, legend: boolean,
 *   annotate: 'all'|'last'|null, yMin: number|null, yMax: number|null, theme: 'dark'|'light'|null,
 *   id: string, name: string, title: string, subtitle: string, source: string, unit: string,
 *   xLabel: string, yLabel: string, categories: readonly string[], series: readonly Series[],
 *   cells: readonly (readonly string[])[], gauges: readonly Gauge[], references: readonly Reference[]
 * }>} ChartSpec
 */
import { ChartSpecError, LIMITS, parsePayload, toNumber, clip, lookup } from './payload.js';
import { extractTable } from './shapes.js';

export { ChartSpecError, parsePayload, toNumber, LIMITS } from './payload.js';

const TYPE_TABLE = Object.freeze({
  bar: { type: 'bar', orientation: 'horizontal' }, barchart: { type: 'bar', orientation: 'horizontal' },
  hbar: { type: 'bar', orientation: 'horizontal' }, horizontalbar: { type: 'bar', orientation: 'horizontal' },
  column: { type: 'bar', orientation: 'vertical' }, columns: { type: 'bar', orientation: 'vertical' },
  columnchart: { type: 'bar', orientation: 'vertical' }, vbar: { type: 'bar', orientation: 'vertical' },
  histogram: { type: 'bar', orientation: 'vertical' },
  line: { type: 'line' }, linechart: { type: 'line' }, trend: { type: 'line' }, timeseries: { type: 'line' },
  area: { type: 'line', area: true }, areachart: { type: 'line', area: true },
  sparkline: { type: 'line', sparkline: true },
  pie: { type: 'pie' }, piechart: { type: 'pie' }, donut: { type: 'pie' }, doughnut: { type: 'pie' },
  gauge: { type: 'gauge' }, meter: { type: 'gauge' },
  stats: { type: 'stats' }, stat: { type: 'stats' }, kpi: { type: 'stats' },
  table: { type: 'table' }, comparison: { type: 'table' },
});
const DEFAULT_HOLE = 0.62;
const LEVEL_PRIORITY = Object.freeze(['critical', 'warning', 'good']);

/** Read the first defined value among option paths. */
const pick = (...values) => values.find(v => v !== undefined && v !== null);

function readFlags(base, kind) {
  const o = base.options ?? {};
  const scales = o.scales ?? {};
  const datasets = Array.isArray(base.data?.datasets) ? base.data.datasets : Array.isArray(base.datasets) ? base.datasets : [];
  const indexAxis = pick(base.indexAxis, o.indexAxis);
  const orientation = pick(base.orientation, indexAxis === 'y' ? 'horizontal' : indexAxis === 'x' ? 'vertical' : undefined, kind.orientation);
  const tension = pick(base.tension, o.elements?.line?.tension, ...datasets.map(d => d?.tension));
  const legendOff = base.legend === false || pick(base.legend?.position, o.legend?.position) === 'none' || o.plugins?.legend?.display === false;
  return {
    orientation: orientation === 'vertical' ? 'vertical' : 'horizontal',
    stacked: Boolean(pick(base.stacked, base.isStacked, o.isStacked, scales.x?.stacked, scales.y?.stacked, false)),
    area: Boolean(kind.area || base.area === true || datasets.some(d => d?.fill === true)),
    curve: base.curve === 'smooth' || pick(base.curveType, o.curveType) === 'function' || Number(tension) > 0 ? 'smooth' : 'linear',
    sparkline: Boolean(kind.sparkline || base.sparkline === true),
    legend: !legendOff,
    yMin: toNumber(pick(base.yMin, scales.y?.min, base.vAxis?.viewWindow?.min, o.vAxis?.viewWindow?.min)),
    yMax: toNumber(pick(base.yMax, scales.y?.max, base.vAxis?.viewWindow?.max, o.vAxis?.viewWindow?.max)),
  };
}

/** Donut hole ratio 0–0.9 from hole / Google pieHole / Chart.js cutout ("70%" or 0.7). */
function readHole(base) {
  const raw = pick(base.hole, base.pieHole, base.options?.pieHole, base.cutout, base.options?.cutout);
  if (raw === undefined) return DEFAULT_HOLE;
  const n = toNumber(raw);
  if (n === null) return DEFAULT_HOLE;
  const ratio = typeof raw === 'string' && raw.includes('%') ? n / 100 : n > 1 ? n / 100 : n;
  return Math.min(0.9, Math.max(0, ratio));
}

/** Gauge bands from Google red/yellow/greenFrom|To (top level or options) or explicit bands[]. */
function readBands(base) {
  if (Array.isArray(base.bands)) {
    return base.bands.slice(0, 6)
      .map(b => ({ from: toNumber(b?.from), to: toNumber(b?.to), level: LEVEL_PRIORITY.includes(b?.level) ? b.level : 'warning' }))
      .filter(b => b.from !== null && b.to !== null);
  }
  const o = { ...(base.options ?? {}), ...base };
  return [['red', 'critical'], ['yellow', 'warning'], ['green', 'good']]
    .map(([color, level]) => ({ from: toNumber(o[`${color}From`]), to: toNumber(o[`${color}To`]), level }))
    .filter(b => b.from !== null && b.to !== null);
}

function levelFor(value, bands) {
  const hit = LEVEL_PRIORITY.find(level => bands.some(b => b.level === level && value >= b.from && value <= b.to));
  return hit ?? 'normal';
}

function buildGauges(base, table) {
  const min = toNumber(pick(base.min, base.options?.min)) ?? 0;
  const max = toNumber(pick(base.max, base.options?.max)) ?? 100;
  if (!(max > min)) throw new ChartSpecError('gauge max must exceed min');
  const bands = readBands(base);
  const entries = table
    ? table.categories.map((label, i) => [label, table.series[0]?.values[i] ?? null])
    : [[clip(base.label ?? base.title ?? 'Value'), toNumber(base.value)]];
  const gauges = entries.filter(([, v]) => v !== null).slice(0, LIMITS.MAX_GAUGES)
    .map(([label, v]) => {
      const value = Math.min(max, Math.max(min, v));
      return { label, value, min, max, bands, level: levelFor(value, bands) };
    });
  if (gauges.length === 0) throw new ChartSpecError('gauge has no numeric value');
  return gauges;
}

/** Comparisons (bars, pies) with all-zero or uniform values are LLM placeholders; flat trend lines are legitimate. */
function assertNotPlaceholder(type, series) {
  if ((type !== 'bar' && type !== 'pie') || series.length !== 1) return;
  const values = series[0].values.filter(v => v !== null);
  if (values.length > 0 && values.every(v => v === 0)) throw new ChartSpecError('placeholder data (all zero)');
  if (values.length > 2 && new Set(values).size === 1) throw new ChartSpecError('placeholder data (all values identical)');
}

/** Keep the first MAX_PIE_SLICES slices, sum the rest into "Other". */
function foldPie(table) {
  const values = table.series[0].values.map(v => v ?? 0);
  const keep = LIMITS.MAX_PIE_SLICES;
  if (values.length <= keep) return { ...table, series: [{ ...table.series[0], values }] };
  const other = values.slice(keep).reduce((a, b) => a + b, 0);
  return {
    ...table,
    categories: [...table.categories.slice(0, keep), 'Other'],
    series: [{ ...table.series[0], values: [...values.slice(0, keep), other] }],
  };
}

function resolvePlotted(kind, table) {
  if (kind.type === 'stats' || kind.type === 'table') {
    if (!table.cells.some(col => col.some(Boolean))) throw new ChartSpecError('no cell values');
    return { type: kind.type, table };
  }
  if (!table.series.some(s => s.values.some(v => v !== null))) throw new ChartSpecError('no finite values to plot');
  const pieable = table.series[0].values.every(v => v === null || v >= 0) && table.series[0].values.some(v => v > 0);
  const type = kind.type === 'pie' && !pieable ? 'bar' : kind.type;
  assertNotPlaceholder(type, table.series);
  return { type, table: type === 'pie' ? foldPie(table) : table };
}

const MAX_REFERENCE_INPUT = 50; // bound the work done on untrusted arrays before filtering
const REFERENCE_LABEL_CHARS = 40;

/** One `{value, label}` line or `{from, to, label}` band; anything else is dropped. */
function toReference(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const label = clip(raw.label ?? '', REFERENCE_LABEL_CHARS);
  const value = toNumber(raw.value);
  if (value !== null) return { kind: 'line', value, label };
  const from = toNumber(raw.from);
  const to = toNumber(raw.to);
  if (from === null || to === null) return null;
  return { kind: 'band', from: Math.min(from, to), to: Math.max(from, to), label };
}

/** Reference lines (repo rate, targets) and bands (RBI tolerance band) — cartesian charts only. */
function readReferences(base, type) {
  if ((type !== 'bar' && type !== 'line') || !Array.isArray(base.references)) return [];
  return base.references.slice(0, MAX_REFERENCE_INPUT).map(toReference).filter(Boolean).slice(0, LIMITS.MAX_REFERENCES);
}

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

/**
 * Normalize any supported payload (raw string or parsed value) into a ChartSpec.
 * @param {unknown} input
 * @returns {ChartSpec}
 * @throws {ChartSpecError}
 */
export function normalizeChart(input) {
  if (input && typeof input === 'object' && Object.isFrozen(input) && 'categories' in input) return input; // already a spec
  const parsed = typeof input === 'string' ? parsePayload(input) : input;
  const base = Array.isArray(parsed) ? { data: parsed } : parsed;
  if (!base || typeof base !== 'object') throw new ChartSpecError('payload must be an object or array');

  const kind = lookup(TYPE_TABLE, base.type) ?? { type: 'bar', orientation: 'horizontal' };
  const hasTable = Array.isArray(base.data) || Array.isArray(base.labels) || Array.isArray(base.data?.labels);
  const gauges = kind.type === 'gauge' ? buildGauges(base, hasTable ? extractTable(base) : null) : [];
  const plotted = kind.type === 'gauge'
    ? { type: 'gauge', table: { categories: [], series: [], cells: [], annotate: null } }
    : resolvePlotted(kind, extractTable(base));
  const annotate = ['all', 'last'].includes(base.annotate) ? base.annotate : base.annotate === 'none' ? null : plotted.table.annotate;
  const theme = base.theme === 'light' || base.theme === 'dark' ? base.theme : null;

  return deepFreeze({
    type: plotted.type,
    ...readFlags(base, kind),
    hole: readHole(base),
    annotate,
    theme,
    id: clip(base.id ?? '', 64).replace(/[^A-Za-z0-9_-]/g, ''),
    name: clip(base.name ?? ''),
    title: clip(base.title ?? ''),
    subtitle: clip(base.subtitle ?? '', 200),
    source: clip(base.source ?? '', 200),
    unit: clip(base.unit ?? '', 8),
    xLabel: clip(base.xLabel ?? base.hAxis?.title ?? ''),
    yLabel: clip(base.yLabel ?? base.vAxis?.title ?? ''),
    categories: plotted.table.categories.map(c => c),
    series: plotted.table.series.map(s => ({ name: s.name, values: [...s.values], dashed: Boolean(s.dashed) })),
    cells: plotted.table.cells.map(col => [...col]),
    gauges,
    references: readReferences(base, plotted.type),
  });
}
