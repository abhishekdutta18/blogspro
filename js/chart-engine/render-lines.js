// render-lines.js — Line, area, smooth (monotone cubic), dashed forecast series, point
// annotations and sparklines. Gaps (null) break the line instead of bridging it.
import { escapeHtml, formatValue } from './format.js';
import { buildFrame, renderAxes } from './frame.js';
import { renderReferenceBands, renderReferenceLines } from './render-references.js';
import { WIDE, r1, tip, text, truncate, legendRow, avoidCollisions } from './svg.js';

const MARKER_LIMIT = 24; // above this many points, markers become noise
const AREA_OPACITY = 0.12;
const DASH = '6 4';
const DIRECT_LABEL_CHARS = Object.freeze({ wide: 11, narrow: 9 });

/** Split a series into contiguous runs of [x, y] points (null values end a run). */
function segments(values, frame) {
  return values.reduce((runs, v, i) => {
    if (v === null) return runs.at(-1)?.length === 0 ? runs : [...runs, []];
    const point = [frame.center(i), frame.value(v)];
    return [...runs.slice(0, -1), [...(runs.at(-1) ?? []), point]];
  }, [[]]).filter(run => run.length > 0);
}

/**
 * Fritsch–Carlson monotone cubic tangents: smooth like Chart.js `tension`, but never
 * overshoots the data (a smoothed curve must not invent a peak that did not happen).
 */
function monotoneTangents(pts) {
  const n = pts.length;
  const slopes = pts.slice(0, -1).map(([x, y], i) => (pts[i + 1][1] - y) / (pts[i + 1][0] - x));
  const t = pts.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === n - 1) return slopes[n - 2];
    return slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  });
  return slopes.reduce((tan, m, i) => {
    if (m === 0) return tan.map((v, j) => (j === i || j === i + 1 ? 0 : v));
    const a = tan[i] / m;
    const b = tan[i + 1] / m;
    const s = a * a + b * b;
    if (s <= 9) return tan;
    const tau = 3 / Math.sqrt(s);
    return tan.map((v, j) => (j === i ? tau * a * m : j === i + 1 ? tau * b * m : v));
  }, t);
}

function runPath(pts, curve) {
  const start = `M${r1(pts[0][0])},${r1(pts[0][1])}`;
  if (curve !== 'smooth' || pts.length < 3) return start + pts.slice(1).map(([x, y]) => `L${r1(x)},${r1(y)}`).join('');
  const tan = monotoneTangents(pts);
  return start + pts.slice(1).map(([x, y], k) => {
    const [x0, y0] = pts[k];
    const dx = (x - x0) / 3;
    return `C${r1(x0 + dx)},${r1(y0 + tan[k] * dx)} ${r1(x - dx)},${r1(y - tan[k + 1] * dx)} ${r1(x)},${r1(y)}`;
  }).join('');
}

function renderSeries(spec, frame, theme, s, si) {
  const color = theme.series[si];
  const runs = segments(s.values, frame);
  const d = runs.map(run => runPath(run, spec.curve)).join('');
  const area = spec.area
    ? runs.map(run => `<path class="bp-area" d="${runPath(run, spec.curve)}L${r1(run.at(-1)[0])},${r1(frame.baseline)}L${r1(run[0][0])},${r1(frame.baseline)}Z" fill="${color}" fill-opacity="${AREA_OPACITY}" stroke="none"/>`).join('')
    : '';
  const dash = s.dashed ? ` stroke-dasharray="${DASH}"` : '';
  const line = `<path class="bp-line" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${dash} d="${d}"/>`;
  const showMarkers = !spec.sparkline && spec.categories.length <= MARKER_LIMIT;
  const last = s.values.findLastIndex(v => v !== null);
  const points = s.values.map((v, i) => {
    if (v === null) return '';
    const [cx, cy] = [r1(frame.center(i)), r1(frame.value(v))];
    const marker = showMarkers ? `<circle cx="${cx}" cy="${cy}" r="4" fill="${color}" stroke="${theme.surface}" stroke-width="2"/>` : '';
    const label = spec.annotate === 'all' || (spec.annotate === 'last' && i === last)
      ? text(cx, cy - 9, formatValue(v, spec.unit), { anchor: 'middle', size: 9, fill: theme.textSecondary, font: theme.fontFamily, cls: 'bp-annotation' })
      : '';
    // data-* hooks let the page runtime build a crosshair readout for every series at index i.
    const hooks = `data-i="${i}" data-cat="${escapeHtml(spec.categories[i])}" data-label="${escapeHtml(`${s.name}: ${formatValue(v, spec.unit)}`)}"`;
    const hit = `<circle cx="${cx}" cy="${cy}" r="9" fill="transparent" ${hooks}>${tip(`${spec.categories[i]} · ${s.name}: ${formatValue(v, spec.unit)}`)}</circle>`;
    return marker + label + hit;
  }).join('');
  return area + line + points;
}

/** End-of-line series names for 2–4 lines, so identity is never color-alone. All-null series skipped (review H4). */
function renderDirectLabels(spec, frame, theme) {
  const chars = DIRECT_LABEL_CHARS[frame.layout.name];
  const ends = spec.series
    .map((s, si) => ({ si, name: s.name, last: s.values.findLastIndex(v => v !== null) }))
    .filter(e => e.last >= 0)
    .map(e => ({ ...e, y: frame.value(spec.series[e.si].values[e.last]) }));
  return avoidCollisions(ends).map(({ si, name, y }) =>
    `<line x1="${frame.plot.right + 6}" x2="${frame.plot.right + 14}" y1="${r1(y)}" y2="${r1(y)}" stroke="${theme.series[si]}" stroke-width="2"${spec.series[si].dashed ? ` stroke-dasharray="3 2"` : ''}/>` +
    text(frame.plot.right + 18, y + 3, truncate(name, chars), { fill: theme.textSecondary, font: theme.fontFamily }),
  ).join('');
}

/** Empty group the page runtime draws its crosshair into; carries the category x positions. */
function crosshairHook(spec, frame) {
  const xs = spec.categories.map((_, i) => r1(frame.center(i))).join(',');
  return `<g class="bp-crosshair" data-x="${xs}" data-top="${r1(frame.plot.top)}" data-bottom="${r1(frame.plot.bottom)}"></g>`;
}

/**
 * Render a line/area/sparkline ChartSpec to an SVG body.
 * @param {import('./normalize.js').ChartSpec} spec
 * @param {import('./theme.js').DARK_THEME} theme
 * @param {import('./svg.js').WIDE} [layout]
 * @returns {string}
 */
export function renderLines(spec, theme, layout = WIDE) {
  const multi = spec.series.length >= 2;
  const chromeless = spec.sparkline;
  const directLabels = !chromeless && multi && spec.series.length <= 4;
  const legend = !chromeless && multi && spec.legend ? spec.series.map(s => s.name) : null;
  const frame = buildFrame(spec, { legend, directLabels }, layout);
  return [
    renderAxes(spec, frame, theme),
    renderReferenceBands(spec, frame, theme),
    spec.series.map((s, si) => renderSeries(spec, frame, theme, s, si)).join(''),
    renderReferenceLines(spec, frame, theme),
    directLabels ? renderDirectLabels(spec, frame, theme) : '',
    legend ? legendRow(legend, theme, { x: frame.plot.left, right: frame.canvas.width - 16, dashed: spec.series.map(s => s.dashed) }) : '',
    chromeless ? '' : crosshairHook(spec, frame),
  ].join('');
}
