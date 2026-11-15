// shapes.js — Readers for every data shape the legacy chart systems emit:
//   • Google DataTable rows  [['Label','A',{role:'annotation'}],['x',1,'1.0']]   (pipeline, dashboard)
//   • bare rows              [['x',1],['y',2]]                                   (LLM shorthand)
//   • admin datasets         { labels, datasets:[{ name, values }] }             (chart-builder.js)
//   • Chart.js config        { data:{ labels, datasets:[{ label, data, borderDash }] } }
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
export function fromRows(rows, base) {
  const valid = rows.filter(r => Array.isArray(r) && r.length >= 2);
  if (valid.length === 0) throw new ChartSpecError('data has no [label, value] rows');
  const forceHeader = base.header === true ? true : base.header === false ? false : null;
  const withHeader = forceHeader ?? hasHeaderRow(valid);
  const body = (withHeader ? valid.slice(1) : valid).slice(0, LIMITS.MAX_CATEGORIES);
  const width = Math.max(...valid.map(r => r.length)) - 1;
  const columns = readColumns(withHeader ? valid[0] : null, width, base.yLabel || base.title || 'Value');
  const dataColumns = columns.filter(c => c.role === null || c.role === 'data').slice(0, LIMITS.MAX_SERIES);
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
export function fromDatasets({ labels, datasets }) {
  if (!Array.isArray(datasets) || datasets.length === 0) throw new ChartSpecError('datasets must be a non-empty array');
  const categories = labels.slice(0, LIMITS.MAX_CATEGORIES).map(label => clip(label)); // not .map(clip): index would become `max`
  const picked = datasets.slice(0, LIMITS.MAX_SERIES).map(ds => (ds && typeof ds === 'object' ? ds : {}));
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

/**
 * Pick the right reader for a payload object.
 * @param {Record<string, any>} base
 */
export function extractTable(base) {
  if (Array.isArray(base.data)) return fromRows(base.data, base);
  if (base.data && typeof base.data === 'object' && Array.isArray(base.data.labels)) return fromDatasets(base.data);
  if (Array.isArray(base.labels)) return fromDatasets(base);
  throw new ChartSpecError('no chartable data (expected `data` rows, `labels` + `datasets`, or Chart.js `data`)');
}
