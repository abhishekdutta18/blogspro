// frame.js — Cartesian frame (plot box, value scale, category bands) and axes for both
// orientations. One value axis, always — never a dual-axis chart.
import { niceTicks, linearScale } from './scale.js';
import { formatValue } from './format.js';
import { canvasFor, r1, text, truncate } from './svg.js';

const MIN_CATEGORY_LABEL_SPACING = 56;
const TICK_CHAR_WIDTH = 6.2; // 10px mono/sans digit width
const MIN_VALUE_GUTTER = 56;

/** [lo, hi] of everything the value axis must show: stacked sums, zero for bars, references, fixed yMin/yMax. */
function valueDomain(spec) {
  const values = spec.series.flatMap(s => s.values).filter(v => v !== null);
  const sums = spec.stacked
    ? spec.categories.flatMap((_, i) => {
      const vs = spec.series.map(s => s.values[i] ?? 0);
      return [vs.filter(v => v > 0).reduce((a, b) => a + b, 0), vs.filter(v => v < 0).reduce((a, b) => a + b, 0)];
    })
    : values;
  const references = spec.references.flatMap(r => (r.kind === 'line' ? [r.value] : [r.from, r.to]));
  const shown = [...sums, ...references, ...(spec.type === 'bar' ? [0] : [])];
  return [spec.yMin ?? Math.min(...shown), spec.yMax ?? Math.max(...shown)];
}

/** Plot box margins by orientation and chrome (legend, direct labels, axis titles). */
function plotBox(spec, canvas, { legend, directLabels }, tickLabelChars) {
  if (spec.sparkline) return { left: 4, right: canvas.width - 4, top: 6, bottom: canvas.height - 6 };
  const horizontal = spec.orientation === 'horizontal' && spec.type === 'bar';
  return {
    left: horizontal ? 118 : Math.max(MIN_VALUE_GUTTER, tickLabelChars * TICK_CHAR_WIDTH + 14) + (spec.yLabel ? 10 : 0),
    right: canvas.width - (directLabels ? 96 : horizontal ? 64 : 20),
    top: legend ? 36 : 16,
    bottom: canvas.height - (spec.xLabel ? 52 : 36),
  };
}

/**
 * Geometry shared by bar and line renderers.
 * `value(v)` maps along the value axis; `center(i)` / `bandStart(i)` along the category axis.
 */
export function buildFrame(spec, chrome) {
  const canvas = canvasFor(spec);
  const [lo, hi] = valueDomain(spec);
  const ticks = niceTicks(lo, hi);
  // Size the value gutter to the widest tick label ("₹1,23,456Cr" needs more than "4%").
  const tickLabelChars = Math.max(...ticks.map(t => formatValue(t, spec.unit).length));
  const plot = plotBox(spec, canvas, chrome, tickLabelChars);
  const domain = [spec.yMin ?? ticks[0], spec.yMax ?? ticks.at(-1)];
  const horizontal = spec.orientation === 'horizontal' && spec.type === 'bar';
  const value = horizontal ? linearScale(domain, [plot.left, plot.right]) : linearScale(domain, [plot.bottom, plot.top]);
  const span = horizontal ? plot.bottom - plot.top : plot.right - plot.left;
  const band = span / spec.categories.length;
  const origin = horizontal ? plot.top : plot.left;
  const baseline = value(Math.min(Math.max(0, domain[0]), domain[1]));
  return {
    canvas, plot, horizontal, band, baseline,
    ticks: ticks.filter(t => t >= domain[0] && t <= domain[1]),
    value: v => value(Math.min(Math.max(v, domain[0]), domain[1])),
    bandStart: i => origin + band * i,
    center: i => origin + band * (i + 0.5),
  };
}

function valueAxis(spec, frame, theme) {
  const { plot, ticks, value, horizontal } = frame;
  const font = theme.fontFamily;
  return ticks.map(t => {
    const p = r1(value(t));
    const stroke = t === 0 ? theme.baseline : theme.grid;
    return horizontal
      ? `<line x1="${p}" x2="${p}" y1="${plot.top}" y2="${plot.bottom}" stroke="${stroke}" stroke-width="1"/>` +
        text(p, plot.bottom + 16, formatValue(t, spec.unit), { anchor: 'middle', fill: theme.textMuted, font })
      : `<line x1="${plot.left}" x2="${plot.right}" y1="${p}" y2="${p}" stroke="${stroke}" stroke-width="1"/>` +
        text(plot.left - 8, p + 3, formatValue(t, spec.unit), { anchor: 'end', fill: theme.textMuted, font });
  }).join('');
}

function categoryAxis(spec, frame, theme) {
  const { plot, center, horizontal, band } = frame;
  const font = theme.fontFamily;
  const step = horizontal ? 1 : Math.max(1, Math.ceil(MIN_CATEGORY_LABEL_SPACING / band));
  return spec.categories.map((c, i) => {
    if (i % step !== 0) return '';
    return horizontal
      ? text(plot.left - 8, center(i) + 3, truncate(c, 16), { anchor: 'end', fill: theme.textSecondary, font })
      : text(center(i), plot.bottom + 16, truncate(c, 10), { anchor: 'middle', fill: theme.textMuted, font });
  }).join('');
}

/** Recessive grid, tick labels, category labels and axis titles. Nothing for sparklines. */
export function renderAxes(spec, frame, theme) {
  if (spec.sparkline) return '';
  const { plot, canvas } = frame;
  const font = theme.fontFamily;
  const titles = [
    spec.xLabel ? text((plot.left + plot.right) / 2, canvas.height - 8, spec.xLabel, { anchor: 'middle', fill: theme.textSecondary, font }) : '',
    spec.yLabel ? `<g transform="translate(14 ${r1((plot.top + plot.bottom) / 2)}) rotate(-90)">${text(0, 0, spec.yLabel, { anchor: 'middle', fill: theme.textSecondary, font })}</g>` : '',
  ];
  return `<g class="bp-axes">${valueAxis(spec, frame, theme)}${categoryAxis(spec, frame, theme)}${titles.join('')}</g>`;
}
