// render-bars.js — Horizontal (Google BarChart) and vertical (ColumnChart / Chart.js bar)
// bars, grouped or stacked. 4px rounded data-end, square baseline end, 2px surface gaps.
import { formatValue } from './format.js';
import { buildFrame, renderAxes } from './frame.js';
import { WIDE, r1, tip, text, legendRow } from './svg.js';
import { renderReferenceBands, renderReferenceLines } from './render-references.js';

const BAR_GAP = 2;
const BAR_RADIUS = 4;
const GROUP_FILL = 0.72; // share of each category band used by its bars
const LABEL_OFFSET = 6; // px between a bar end (or zero line) and its value label
const AUTO_ANNOTATE_MAX = 12; // single-series horizontal bars get value labels up to this many rows

/**
 * Rectangle path from the baseline (b0) to the data end (b1) along the value axis, spanning
 * [c0, c1] across it. Only the data end is rounded, and only if `rounded`.
 */
function barPath({ horizontal, b0, b1, c0, c1, rounded }) {
  const len = Math.abs(b1 - b0);
  const r = rounded ? Math.min(BAR_RADIUS, (c1 - c0) / 2, len) : 0;
  const dir = b1 >= b0 ? 1 : -1;
  const end = b1 - dir * r;
  if (horizontal) {
    return `M${r1(b0)},${r1(c0)}H${r1(end)}Q${r1(b1)},${r1(c0)} ${r1(b1)},${r1(c0 + r)}V${r1(c1 - r)}Q${r1(b1)},${r1(c1)} ${r1(end)},${r1(c1)}H${r1(b0)}Z`;
  }
  return `M${r1(c0)},${r1(b0)}V${r1(end)}Q${r1(c0)},${r1(b1)} ${r1(c0 + r)},${r1(b1)}H${r1(c1 - r)}Q${r1(c1)},${r1(b1)} ${r1(c1)},${r1(end)}V${r1(b0)}Z`;
}

/** One {si, ci, v, b0, b1, c0, c1, rounded} per drawable bar. */
function layoutBars(spec, frame) {
  const k = spec.series.length;
  const groupWidth = frame.band * GROUP_FILL;
  const offset = (frame.band - groupWidth) / 2;
  if (spec.stacked) {
    return spec.categories.flatMap((_, ci) => {
      let pos = 0;
      let neg = 0;
      const lastPos = spec.series.findLastIndex(s => (s.values[ci] ?? 0) > 0);
      const lastNeg = spec.series.findLastIndex(s => (s.values[ci] ?? 0) < 0);
      const c0 = frame.bandStart(ci) + offset;
      return spec.series.map((s, si) => {
        const v = s.values[ci];
        if (v === null || v === 0) return null;
        const start = v > 0 ? pos : neg;
        if (v > 0) pos += v; else neg += v;
        const rounded = si === (v > 0 ? lastPos : lastNeg);
        return { si, ci, v, b0: frame.value(start), b1: frame.value(start + v), c0, c1: c0 + groupWidth, rounded };
      }).filter(Boolean);
    });
  }
  const thickness = Math.max(1, groupWidth / k - BAR_GAP);
  return spec.series.flatMap((s, si) => s.values.map((v, ci) => {
    if (v === null) return null;
    const c0 = frame.bandStart(ci) + offset + si * (thickness + BAR_GAP);
    return { si, ci, v, b0: frame.baseline, b1: frame.value(v), c0, c1: c0 + thickness, rounded: true };
  }).filter(Boolean));
}

/** Value labels at the data end (selective: auto only for short single-series horizontal lists). */
function annotations(spec, bars, frame, theme) {
  const auto = spec.annotate === null && frame.horizontal && spec.series.length === 1 && spec.categories.length <= AUTO_ANNOTATE_MAX;
  if (spec.annotate !== 'all' && !auto) return '';
  return bars.map(b => {
    const label = formatValue(b.v, spec.unit);
    const mid = (b.c0 + b.c1) / 2;
    const outward = b.b1 >= b.b0 ? 1 : -1;
    // A loss's label goes right of the zero line: left of the bar is the category-label gutter.
    const x = outward > 0 ? b.b1 + LABEL_OFFSET : frame.baseline + LABEL_OFFSET;
    return frame.horizontal
      ? text(x, mid + 3, label, { anchor: 'start', fill: theme.textSecondary, font: theme.fontFamily, cls: 'bp-annotation' })
      : text(mid, b.b1 - outward * 6, label, { anchor: 'middle', size: 9, fill: theme.textSecondary, font: theme.fontFamily, cls: 'bp-annotation' });
  }).join('');
}

/** A lone series with gains and losses colors by sign; several series keep their identity hues. */
function fillFor(spec, theme) {
  const values = spec.series[0].values.filter(v => v !== null);
  const polarity = spec.series.length === 1 && values.some(v => v > 0) && values.some(v => v < 0);
  return b => (polarity ? (b.v < 0 ? theme.negative : theme.positive) : theme.series[b.si]);
}

/**
 * Render a bar ChartSpec to an SVG body.
 * @param {import('./normalize.js').ChartSpec} spec
 * @param {import('./theme.js').DARK_THEME} theme
 * @param {import('./svg.js').WIDE} [layout]
 * @returns {string}
 */
export function renderBars(spec, theme, layout = WIDE) {
  const multi = spec.series.length >= 2;
  const legend = multi && spec.legend && !spec.sparkline ? spec.series.map(s => s.name) : null;
  const frame = buildFrame(spec, { legend, directLabels: false }, layout);
  const bars = layoutBars(spec, frame);
  const fill = fillFor(spec, theme);
  const gapStroke = spec.stacked ? ` stroke="${theme.surface}" stroke-width="${BAR_GAP}"` : '';
  const marks = bars.map(b => {
    const label = `${spec.categories[b.ci]}${multi ? ` · ${spec.series[b.si].name}` : ''}: ${formatValue(b.v, spec.unit)}`;
    return `<path class="bp-bar" d="${barPath({ horizontal: frame.horizontal, ...b })}" fill="${fill(b)}"${gapStroke}>${tip(label)}</path>`;
  }).join('');
  return [
    `<g data-orientation="${frame.horizontal ? 'horizontal' : 'vertical'}">`,
    renderAxes(spec, frame, theme),
    renderReferenceBands(spec, frame, theme),
    marks,
    renderReferenceLines(spec, frame, theme),
    annotations(spec, bars, frame, theme),
    legend ? legendRow(legend, theme, { x: frame.plot.left, right: frame.canvas.width - 16 }) : '',
    '</g>',
  ].join('');
}
