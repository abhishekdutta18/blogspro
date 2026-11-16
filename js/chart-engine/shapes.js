// shapes.js — Readers for every data shape the legacy chart systems emit:
//   • Google DataTable rows  [['Label','A',{role:'annotation'}],['x',1,'1.0']]   (pipeline, dashboard)
//   • bare rows              [['x',1],['y',2]]                                   (LLM shorthand)
//   • admin datasets         { labels, datasets:[{ name, values }] }             (chart-builder.js)
//   • Chart.js config        { data:{ labels, datasets:[{ label, data, borderDash }] } }
//   • object maps            { data:{ "Base": 40, "Bull": 30 } } or { data:{ A:{x:1,y:2}, B:{x:3,y:4} } }
// Each returns { categories, series:[{ name, values, dashed }], cells, annotate }.
import { ChartSpecError, LIMITS, toNumber, clip } from './payload.js';

const MISSING_TOKEN = /^(?:n\/?a|na|null|nil|none|-|–|—|\.\.\.)?$/i;

const isYear = v => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{4}$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1800 && n <= 2200;
};

/** Raw display text for stats/table cells (values may be "$340B", "Fast", …). */
const cellText = v => (v === null || v === undefined ? '' : clip(typeof v === 'object' ? JSON.stringify(v) : v));

/**
 * Header row if: any cell is a Google column descriptor, any cell is non-numeric text that is not a
 * missing-value token (review M1: "n/a" is data), or every cell is a year while the body holds real values.
 */
function hasHeaderRow(rows) {
  const [first, ...rest] = rows;
  const cells = first.slice(1);
  if (cells.some(c => c !== null && typeof c === 'object')) return true;
  if (cells.some(c => typeof c === 'string' && toNumber(c) === null && !MISSING_TOKEN.test(c.trim()))) return true;
  return cells.length > 0 && cells.every(isYear) &&
    rest.some(r => r.slice(1).some(c => toNumber(c) !== null && !isYear(c)));
}

/** Column descriptors after the label column: { index, name, role }. */
function readColumns(header, width, fallbackName) {
  return Array.from({ length: width }, (_, i) => {
    const cell = header?.[i + 1];
    const descriptor = cell !== null && typeof cell === 'object' ? cell : { label: cell };
    const name = descriptor.label ?? descriptor.id ?? (width === 1 ? fallbackName : `Series ${i + 1}`);
    return { index: i + 1, name: clip(name), role: descriptor.role ? String(descriptor.role) : null };
  });
}

/** Google series options ({ 1: { lineDashStyle:[4,4] } }) keyed by data-column position. */
function seriesOption(base, position) {
  const opts = base.series?.[position] ?? base.options?.series?.[position];
  return opts && typeof opts === 'object' ? opts : {};
}

/** Google DataTable / bare rows. */
export function fromRows(rows, base, maxSeries = LIMITS.MAX_SERIES) {
  const valid = rows.filter(r => Array.isArray(r) && r.length >= 2);
  if (valid.length === 0) throw new ChartSpecError('data has no [label, value] rows');
  const forceHeader = base.header === true ? true : base.header === false ? false : null;
  const withHeader = forceHeader ?? hasHeaderRow(valid);
  const body = (withHeader ? valid.slice(1) : valid).slice(0, LIMITS.MAX_CATEGORIES);
  const width = Math.max(...valid.map(r => r.length)) - 1;
  const columns = readColumns(withHeader ? valid[0] : null, width, base.yLabel || base.title || 'Value');
  const dataColumns = columns.filter(c => c.role === null || c.role === 'data').slice(0, maxSeries);
  return {
    categories: body.map(r => clip(r[0])),
    series: dataColumns.map((c, position) => ({
      name: c.name,
      values: body.map(r => toNumber(r[c.index])),
      dashed: isDashed(seriesOption(base, position)),
    })),
    cells: dataColumns.map(c => body.map(r => cellText(r[c.index]))),
    annotate: columns.some(c => c.role === 'annotation') ? 'all' : null,
  };
}

/** Admin chart-builder datasets and Chart.js datasets. */
export function fromDatasets({ labels, datasets }, maxSeries = LIMITS.MAX_SERIES) {
  if (!Array.isArray(datasets) || datasets.length === 0) throw new ChartSpecError('datasets must be a non-empty array');
  const categories = labels.slice(0, LIMITS.MAX_CATEGORIES).map(label => clip(label)); // not .map(clip): index would become `max`
  const picked = datasets.slice(0, maxSeries).map(ds => (ds && typeof ds === 'object' ? ds : {}));
  const raw = picked.map(ds => (Array.isArray(ds.values) ? ds.values : Array.isArray(ds.data) ? ds.data : []));
  return {
    categories,
    series: picked.map((ds, i) => ({
      name: clip(ds.label ?? ds.name ?? `Series ${i + 1}`),
      values: categories.map((_, j) => toNumber(raw[i][j])),
      dashed: isDashed(ds),
    })),
    cells: raw.map(values => categories.map((_, j) => cellText(values[j]))),
    annotate: null,
  };
}

/** Dashed line flag across vocabularies: ours, Google lineDashStyle, Chart.js borderDash, forecast. */
function isDashed(opts) {
  return opts.dashed === true || opts.forecast === true ||
    (Array.isArray(opts.lineDashStyle) && opts.lineDashStyle.length > 0) ||
    (Array.isArray(opts.borderDash) && opts.borderDash.length > 0);
}

const isMap = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Bounded own entries of an untrusted object. */
const mapEntries = obj => Object.keys(obj).slice(0, LIMITS.MAX_MAP_KEYS).map(k => [k, obj[k]]);

/**
 * Object maps, the shape models reach for when naming values: `{ name: number }` is one series;
 * `{ seriesName: { category: number } }` is one series per outer key, and every inner map must
 * have the same keys. Anything mixed is rejected rather than guessed.
 */
export function fromMap(map, base, maxSeries = LIMITS.MAX_SERIES) {
  const entries = mapEntries(map);
  if (entries.length === 0) throw new ChartSpecError('data map is empty');
  if (entries.every(([, v]) => !isMap(v))) {
    const rows = entries.slice(0, LIMITS.MAX_CATEGORIES);
    return {
      categories: rows.map(([k]) => clip(k)),
      series: [{ name: clip(base.yLabel || base.title || 'Value'), values: rows.map(([, v]) => toNumber(v)), dashed: false }],
      cells: [rows.map(([, v]) => cellText(v))],
      annotate: null,
    };
  }
  if (!entries.every(([, v]) => isMap(v))) throw new ChartSpecError('data map mixes single values and nested maps');
  const keys = mapEntries(entries[0][1]).map(([k]) => k).slice(0, LIMITS.MAX_CATEGORIES);
  const sameKeys = entries.every(([, v]) => { const own = Object.keys(v); return own.length === keys.length && keys.every(k => Object.hasOwn(v, k)); });
  if (!sameKeys) throw new ChartSpecError('nested data maps must all have the same keys');
  const picked = entries.slice(0, maxSeries);
  return {
    categories: keys.map(k => clip(k)),
    series: picked.map(([name, v]) => ({ name: clip(name), values: keys.map(k => toNumber(v[k])), dashed: false })),
    cells: picked.map(([, v]) => keys.map(k => cellText(v[k]))),
    annotate: null,
  };
}

/** A payload that is itself a map of numeric maps, with no `type`, `data` or other chart keys. */
const isBareSeriesMap = base => !('type' in base) && Object.keys(base).length > 0 && Object.values(base).every(isMap);

/**
 * Pick the right reader for a payload object.
 * @param {Record<string, any>} base
 * @param {number} [maxSeries] value columns kept (heatmap columns are not colored series, so may exceed the palette)
 */
export function extractTable(base, maxSeries = LIMITS.MAX_SERIES) {
  if (Array.isArray(base.data)) return fromRows(base.data, base, maxSeries);
  if (base.data && typeof base.data === 'object' && Array.isArray(base.data.labels)) return fromDatasets(base.data, maxSeries);
  if (Array.isArray(base.labels)) return fromDatasets(base, maxSeries);
  if (isMap(base.data)) return fromMap(base.data, base, maxSeries);
  if (isBareSeriesMap(base)) return fromMap(base, {}, maxSeries);
  throw new ChartSpecError('no chartable data (expected `data` rows, `labels` + `datasets`, or Chart.js `data`)');
}
