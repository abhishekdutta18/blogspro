// frame.js — Cartesian frame (plot box, value scale, category bands) and axes for both
// orientations. One value axis, always — never a dual-axis chart.
import { niceTicks, linearScale } from './scale.js';
import { waterfallLevels } from './forms.js';
import { dayLabel, timeTicks } from './time.js';
import { tickLabels } from './format.js';
import { WIDE, CHAR_WIDTH, LEGEND_ROW_HEIGHT, canvasFor, legendRows, r1, text, wrapLabel } from './svg.js';

const MIN_CATEGORY_LABEL_SPACING = 56;
const MIN_VALUE_GUTTER = 56;
const LABEL_LINE_HEIGHT = 12; // second line of a wrapped category label
const CATEGORY_GUTTER = Object.freeze({ wide: 118, narrow: 96 }); // horizontal bars' label column
const DIRECT_LABEL_GUTTER = Object.freeze({ wide: 96, narrow: 80 });
const VALUE_TICKS = Object.freeze({ wide: 5, narrow: 3 }); // horizontal value axis, where tick labels sit side by side
const LABEL_CHARS = Object.freeze({ min: 4, max: 14 });
const TICK_LABEL_GAP = 8; // min px between neighbouring value-axis labels
const TIME_TICK_SPACING = 64; // px per calendar tick label ("Sep '25" plus breathing room)
const TIME_EDGE_PAD = 16; // keeps the first/last dated point off the plot edge

/** [lo, hi] of everything the value axis must show: stacked sums, zero for bars, references, fixed yMin/yMax. */
function valueDomain(spec) {
  const values = spec.type === 'waterfall'
    ? waterfallLevels(spec).flatMap(l => [l.start, l.end])
    : spec.series.flatMap(s => s.values).filter(v => v !== null);
  const sums = spec.stacked
    ? spec.categories.flatMap((_, i) => {
      const vs = spec.series.map(s => s.values[i] ?? 0);
      return [vs.filter(v => v > 0).reduce((a, b) => a + b, 0), vs.filter(v => v < 0).reduce((a, b) => a + b, 0)];
    })
    : values;
  const references = spec.references.flatMap(r => (r.kind === 'line' ? [r.value] : [r.from, r.to]));
  const zeroBased = spec.type === 'bar' || spec.type === 'waterfall'; // a price axis is not
  const shown = [...sums, ...references, ...(zeroBased ? [0] : [])];
  return [spec.yMin ?? Math.min(...shown), spec.yMax ?? Math.max(...shown)];
}

/**
 * How category labels fit: which ones are drawn (`step`), how many characters a line holds,
 * and whether any of them needs a second line. Vertical labels get their band's width;
 * horizontal ones get the label column.
 */
function categoryLabelFit(spec, { left, right }, horizontal) {
  if (horizontal) return { step: 1, chars: Math.floor((left - 14) / CHAR_WIDTH), wraps: false };
  const band = (right - left) / spec.categories.length;
  const step = Math.max(1, Math.ceil(MIN_CATEGORY_LABEL_SPACING / band));
  const chars = Math.min(LABEL_CHARS.max, Math.max(LABEL_CHARS.min, Math.floor((band * step - 6) / CHAR_WIDTH)));
  const wraps = !isTimeScaled(spec) && displayLabels(spec).some((c, i) => i % step === 0 && wrapLabel(c, chars).length > 1);
  return { step, chars, wraps };
}

/** Prices are read exactly: "25,650", never "25.7K". */
const isPriceAxis = spec => spec.type === 'candlestick';

/** Dated line charts are placed on a true time scale; other dated charts keep even spacing. */
const isTimeScaled = spec => spec.type === 'line' && Array.isArray(spec.times);

/** Category labels as drawn: "10 Nov" for dated categories, the raw text otherwise. */
const displayLabels = spec => (spec.times ? spec.times.map(dayLabel) : spec.categories);

/** Plot box margins by orientation, layout and chrome (legend, direct labels, axis titles, wrapped labels). */
function plotBox(spec, canvas, layout, { legend, directLabels }, tickLabelChars) {
  if (spec.sparkline) return { box: { left: 4, right: canvas.width - 4, top: 6, bottom: canvas.height - 6 }, labels: { step: 1, chars: 0, wraps: false } };
  const horizontal = spec.orientation === 'horizontal' && spec.type === 'bar';
  const left = horizontal ? CATEGORY_GUTTER[layout.name] : Math.max(MIN_VALUE_GUTTER, tickLabelChars * CHAR_WIDTH + 14) + (spec.yLabel ? 10 : 0);
  const right = canvas.width - (directLabels ? DIRECT_LABEL_GUTTER[layout.name] : horizontal ? 64 : 20);
  const labels = categoryLabelFit(spec, { left, right }, horizontal);
  const rows = legend ? legendRows(legend, { x: left, right: canvas.width - 16 }) : 0;
  return {
    box: {
      left,
      right,
      top: rows ? 16 + rows * LEGEND_ROW_HEIGHT : 16,
      bottom: canvas.height - (spec.xLabel ? 52 : 36) - (labels.wraps ? LABEL_LINE_HEIGHT : 0),
    },
    labels,
  };
}

/**
 * Geometry shared by bar and line renderers.
 * `value(v)` maps along the value axis; `center(i)` / `bandStart(i)` along the category axis.
 * @param {object} spec normalized ChartSpec
 * @param {{ legend: string[]|null, directLabels: boolean }} chrome legend names (null = no legend)
 * @param {typeof WIDE} [layout]
 */
export function buildFrame(spec, chrome, layout = WIDE) {
  const canvas = canvasFor(spec, layout);
  const horizontal = spec.orientation === 'horizontal' && spec.type === 'bar';
  const [lo, hi] = valueDomain(spec);
  const ticks = niceTicks(lo, hi, horizontal ? VALUE_TICKS[layout.name] : VALUE_TICKS.wide);
  // Size the value gutter to the widest tick label ("₹1,23,456Cr" needs more than "4%").
  const tickLabelChars = Math.max(...tickLabels(ticks, spec.unit, isPriceAxis(spec)).map(l => l.length));
  const { box: plot, labels } = plotBox(spec, canvas, layout, chrome, tickLabelChars);
  const domain = [spec.yMin ?? ticks[0], spec.yMax ?? ticks.at(-1)];
  const value = horizontal ? linearScale(domain, [plot.left, plot.right]) : linearScale(domain, [plot.bottom, plot.top]);
  const span = horizontal ? plot.bottom - plot.top : plot.right - plot.left;
  const band = span / spec.categories.length;
  const origin = horizontal ? plot.top : plot.left;
  const baseline = value(Math.min(Math.max(0, domain[0]), domain[1]));
  const time = isTimeScaled(spec) ? timeScale(spec.times, plot) : null;
  return {
    canvas, plot, horizontal, band, baseline, labels, layout, time,
    ticks: ticks.filter(t => t >= domain[0] && t <= domain[1]),
    value: v => value(Math.min(Math.max(v, domain[0]), domain[1])),
    bandStart: i => origin + band * i,
    center: time ? i => time(spec.times[i]) : i => origin + band * (i + 0.5),
  };
}


/**
 * Which ticks get a label on a horizontal value axis, where labels sit side by side: every k-th
 * tick, counted from zero so the baseline is always labelled. Gridlines stay on every tick.
 */
function labelledTicks(spec, frame) {
  const { ticks, value, horizontal } = frame;
  if (!horizontal || ticks.length < 2) return () => true;
  const widest = Math.max(...tickLabels(ticks, spec.unit, isPriceAxis(spec)).map(l => l.length)) * CHAR_WIDTH + TICK_LABEL_GAP;
  const spacing = Math.abs(value(ticks[1]) - value(ticks[0]));
  const every = Math.max(1, Math.ceil(widest / spacing));
  const anchor = Math.max(0, ticks.indexOf(0));
  return i => (i - anchor) % every === 0;
}

/** Timestamp -> x across the plot, padded so edge points are not drawn on the axis. */
function timeScale(times, plot) {
  const [t0, t1] = [Math.min(...times), Math.max(...times)];
  const pad = Math.min(TIME_EDGE_PAD, (plot.right - plot.left) * 0.05);
  if (t1 === t0) return () => (plot.left + plot.right) / 2;
  return linearScale([t0, t1], [plot.left + pad, plot.right - pad]);
}

/** Calendar tick labels (months, years, days) for a time-scaled x axis. */
function timeAxis(spec, frame, theme) {
  const { plot, time } = frame;
  const [t0, t1] = [Math.min(...spec.times), Math.max(...spec.times)];
  const maxTicks = Math.max(2, Math.floor((plot.right - plot.left) / TIME_TICK_SPACING));
  return timeTicks(t0, t1, maxTicks).map(({ t, label }) =>
    text(time(t), plot.bottom + 16, label, { anchor: 'middle', fill: theme.textMuted, font: theme.fontFamily })).join('');
}

function valueAxis(spec, frame, theme) {
  const { plot, ticks, value, horizontal } = frame;
  const font = theme.fontFamily;
  const isLabelled = labelledTicks(spec, frame);
  const labels = tickLabels(ticks, spec.unit, isPriceAxis(spec));
  return ticks.map((t, i) => {
    const p = r1(value(t));
    const stroke = t === 0 ? theme.baseline : theme.grid;
    return horizontal
      ? `<line x1="${p}" x2="${p}" y1="${plot.top}" y2="${plot.bottom}" stroke="${stroke}" stroke-width="1"/>` +
        (isLabelled(i) ? text(p, plot.bottom + 16, labels[i], { anchor: 'middle', fill: theme.textMuted, font }) : '')
      : `<line x1="${plot.left}" x2="${plot.right}" y1="${p}" y2="${p}" stroke="${stroke}" stroke-width="1"/>` +
        text(plot.left - 8, p + 3, labels[i], { anchor: 'end', fill: theme.textMuted, font });
  }).join('');
}

/** Category labels, wrapped onto up to two lines (the full label stays in tooltips and the table). */
function categoryAxis(spec, frame, theme) {
  if (frame.time) return timeAxis(spec, frame, theme);
  const { plot, center, horizontal, labels } = frame;
  const font = theme.fontFamily;
  return displayLabels(spec).map((c, i) => {
    if (i % labels.step !== 0) return '';
    const lines = wrapLabel(c, labels.chars);
    return lines.map((line, k) => (horizontal
      ? text(plot.left - 8, center(i) + 3 + (k - (lines.length - 1) / 2) * LABEL_LINE_HEIGHT, line, { anchor: 'end', fill: theme.textSecondary, font })
      : text(center(i), plot.bottom + 16 + k * LABEL_LINE_HEIGHT, line, { anchor: 'middle', fill: theme.textMuted, font }))).join('');
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
