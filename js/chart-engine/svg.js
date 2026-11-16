// svg.js — Tiny SVG string helpers + canvas sizing shared by renderers. Pure.
import { escapeHtml } from './format.js';

const SPARKLINE_HEIGHT = 96;
const MAX_HEIGHT = 900;
const CHAR_WIDTH = 6.2; // 10px label glyph width, used for every text-fit estimate
const LEGEND_ROW_HEIGHT = 20;

/**
 * The two canvases every non-sparkline chart is drawn on. A fixed viewBox scales text with its
 * container, so a 640-wide chart in a 340px phone column shows 5px labels; the narrow canvas is
 * laid out for that width instead (text stays ~1:1) and the page CSS swaps between them.
 */
export const WIDE = Object.freeze({ name: 'wide', width: 640, height: 360, gaugeHeight: 240 });
export const NARROW = Object.freeze({ name: 'narrow', width: 360, height: 300, gaugeHeight: 240 });

/** Gauges per row: side by side when wide, two per row when narrow. */
export const gaugeColumns = (spec, layout) => (layout === NARROW ? Math.min(2, spec.gauges.length) : spec.gauges.length);
export const GAUGE_ROW_HEIGHT = 200; // narrow multi-gauge rows

/** Pie geometry: donut beside the legend when wide, donut above the legend when narrow. */
export function pieGeometry(spec, layout) {
  if (layout !== NARROW) return { cx: 170, cy: 180, radius: 124, legendX: 330, legendRight: 620, legendTop: null };
  return { cx: 180, cy: 116, radius: 96, legendX: 28, legendRight: 332, legendTop: 116 + 96 + 28 };
}
const PIE_LEGEND_ROW = 28;

/**
 * Canvas (viewBox) size for a spec. Horizontal bars grow with category count
 * (Google BarChart parity: labels.length * 36 + 60) so long lists stay legible.
 * @param {object} spec normalized ChartSpec
 * @param {typeof WIDE} [layout]
 * @returns {{ width: number, height: number }}
 */
export function canvasFor(spec, layout = WIDE) {
  const { width } = layout;
  if (spec.sparkline) return { width: WIDE.width, height: SPARKLINE_HEIGHT };
  if (spec.type === 'gauge') {
    if (layout !== NARROW || spec.gauges.length === 1) return { width, height: layout.gaugeHeight };
    return { width, height: Math.ceil(spec.gauges.length / gaugeColumns(spec, layout)) * GAUGE_ROW_HEIGHT + 20 };
  }
  if (spec.type === 'pie' && layout === NARROW) {
    const { legendTop } = pieGeometry(spec, layout);
    return { width, height: legendTop + spec.categories.length * PIE_LEGEND_ROW };
  }
  if (spec.type === 'bar' && spec.orientation === 'horizontal') {
    const rowHeight = Math.max(28, (spec.stacked ? 1 : spec.series.length) * 14 + 14);
    const chrome = (spec.series.length > 1 ? 36 : 16) + 44;
    return { width, height: Math.min(MAX_HEIGHT, Math.max(160, chrome + spec.categories.length * rowHeight)) };
  }
  return { width, height: layout.height };
}

export { PIE_LEGEND_ROW, CHAR_WIDTH };

/** Round to 1 decimal to keep SVG output compact and deterministic. */
export const r1 = n => Math.round(n * 10) / 10;

/** Native SVG tooltip — works with no JS, in PDFs and in screen readers. */
export const tip = content => `<title>${escapeHtml(content)}</title>`;

/** SVG <text> with escaped content. */
export function text(x, y, content, { size = 10, fill, anchor = 'start', weight = 400, font, cls } = {}) {
  const klass = cls ? ` class="${cls}"` : '';
  return `<text${klass} x="${r1(x)}" y="${r1(y)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" font-family="${escapeHtml(font)}">${escapeHtml(content)}</text>`;
}

/** Shorten long labels for display; the full label stays in the tooltip and data table. */
export function truncate(label, max = 12) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/**
 * Split a label into at most `lines` lines of about `max` characters, breaking at spaces.
 * A word longer than a line is cut, and whatever does not fit ends in an ellipsis.
 * @returns {string[]}
 */
export function wrapLabel(label, max, lines = 2) {
  const words = String(label).split(/\s+/).filter(Boolean);
  const out = words.reduce((acc, word) => {
    const current = acc.at(-1);
    if (current !== undefined && (current + ' ' + word).length <= max) return [...acc.slice(0, -1), `${current} ${word}`];
    return [...acc, word];
  }, []);
  if (out.length === 0) return [''];
  if (out.length <= lines) return out.map(l => truncate(l, max));
  // Fold the overflow into the last line; truncate() then ends it with an ellipsis.
  return [...out.slice(0, lines - 1).map(l => truncate(l, max)), truncate(out.slice(lines - 1).join(' '), max)];
}

/** Legend item positions, wrapped onto new rows at `right`. Rows are LEGEND_ROW_HEIGHT apart. */
export function legendLayout(names, { x, right, y = 14 }) {
  return names.reduce((acc, name, i) => {
    const label = truncate(name, 18);
    const width = 16 + label.length * CHAR_WIDTH;
    const prev = acc.items.at(-1);
    const fits = !prev || acc.cursor + width <= right;
    const row = fits ? acc.row : acc.row + 1;
    const cursor = fits ? acc.cursor : x;
    const item = { i, label, x: cursor, y: y + row * LEGEND_ROW_HEIGHT };
    return { items: [...acc.items, item], cursor: cursor + width + 18, row };
  }, { items: [], cursor: x, row: 0 });
}

/** Number of legend rows a set of names needs between `x` and `right`. */
export const legendRows = (names, bounds) => legendLayout(names, bounds).row + 1;
export { LEGEND_ROW_HEIGHT };

/** Legend (rendered for >= 2 series unless disabled), wrapping onto extra rows when narrow. */
export function legendRow(names, theme, { x = 0, right = Infinity, y = 14, dashed = [] } = {}) {
  const items = legendLayout(names, { x, right, y }).items.map(({ i, label, x: cx, y: cy }) => {
    const swatch = dashed[i]
      ? `<line x1="${r1(cx)}" x2="${r1(cx + 12)}" y1="${cy - 4}" y2="${cy - 4}" stroke="${theme.series[i]}" stroke-width="2" stroke-dasharray="3 2"/>`
      : `<rect x="${r1(cx)}" y="${cy - 9}" width="10" height="10" rx="2" fill="${theme.series[i]}"/>`;
    return swatch + text(cx + 16, cy, label, { fill: theme.textSecondary, font: theme.fontFamily });
  });
  return `<g class="bp-legend">${items.join('')}</g>`;
}

/**
 * Spread label y-positions so stacked end-labels never overlap.
 * @param {{ y: number }[]} labels
 */
export function avoidCollisions(labels, minGap = 13) {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  return sorted.reduce((acc, label) => {
    const prev = acc.at(-1);
    const y = prev && label.y - prev.y < minGap ? prev.y + minGap : label.y;
    return [...acc, { ...label, y }];
  }, []);
}
