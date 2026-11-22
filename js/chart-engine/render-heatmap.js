// render-heatmap.js — Row × column grid colored by value (monthly returns, sector × period).
// Single-sign data: one hue, magnitude moving away from the surface. Mixed signs: diverging
// red <-> gray <-> blue around zero. Values are printed only when every one fits its cell;
// otherwise the per-cell tooltip and the data table carry them.
import { formatValue } from './format.js';
import { mix, readableInk } from './color.js';
import { CHAR_WIDTH, HEATMAP, WIDE, heatRowHeight, r1, text, tip, truncate } from './svg.js';

const CELL_GAP = 2;
const VALUE_SIZE = 9;
const VALUE_CHAR_WIDTH = 5.6; // 9px glyph width
const RIGHT_MARGIN = 12;
const ROW_GUTTER = Object.freeze({ min: 40, max: 118 });
const KEY_STEPS = 5;
const KEY_SWATCH = Object.freeze({ width: 26, height: 8 });
/** Custom theme objects without heat tokens fall back to the dark ramp. */
const FALLBACK_HEAT = Object.freeze({ low: '#10233a', high: '#9cc8ff', negative: '#ff8f86', mid: '#2a2a2a', positive: '#9cc8ff' });

/** Map a value to a ramp color: diverging around zero for mixed signs, else min -> max. */
function colorScale(values, heat) {
  const [lo, hi] = [Math.min(...values), Math.max(...values)];
  if (lo < 0 && hi > 0) {
    const extent = Math.max(-lo, hi);
    return { diverging: true, lo: -extent, hi: extent, color: v => (v < 0 ? mix(heat.mid, heat.negative, -v / extent) : mix(heat.mid, heat.positive, v / extent)) };
  }
  const span = hi - lo;
  return { diverging: false, lo, hi, color: v => mix(heat.low, heat.high, span === 0 ? 1 : (v - lo) / span) };
}

function geometry(spec, layout) {
  const longest = Math.max(...spec.categories.map(c => c.length));
  const left = Math.min(ROW_GUTTER.max, Math.max(ROW_GUTTER.min, longest * CHAR_WIDTH + 14));
  const cellW = (layout.width - left - RIGHT_MARGIN) / spec.series.length;
  return { left, cellW, cellH: heatRowHeight(spec), top: HEATMAP.header };
}

function columnHeaders(spec, g, theme) {
  const chars = Math.floor((g.cellW - 2) / VALUE_CHAR_WIDTH);
  const step = chars >= 3 ? 1 : Math.ceil(3 / Math.max(1, chars));
  return spec.series.map((s, j) => (j % step !== 0 ? '' :
    text(g.left + g.cellW * (j + 0.5), g.top - 10, truncate(s.name, Math.max(3, chars) * step), { anchor: 'middle', size: VALUE_SIZE, fill: theme.textMuted, font: theme.fontFamily }))).join('');
}

function cells(spec, g, scale, theme, showValues) {
  return spec.categories.map((row, i) => {
    const y = g.top + i * g.cellH;
    const rowChars = Math.floor((g.left - 14) / CHAR_WIDTH);
    const label = text(g.left - 8, y + g.cellH / 2 + 3, truncate(row, rowChars), { anchor: 'end', fill: theme.textSecondary, font: theme.fontFamily });
    const marks = spec.series.map((s, j) => {
      const v = s.values[i];
      const x = g.left + j * g.cellW;
      const box = `x="${r1(x + CELL_GAP / 2)}" y="${r1(y + CELL_GAP / 2)}" width="${r1(g.cellW - CELL_GAP)}" height="${r1(g.cellH - CELL_GAP)}" rx="2"`;
      // Missing is an outline, not a fill: a gray fill would read as "about zero" on a diverging ramp.
      if (v === null) return `<rect class="bp-cell" ${box} fill="none" stroke="${theme.baseline}" stroke-dasharray="2 2">${tip(`${row} · ${s.name}: no data`)}</rect>`;
      const fill = scale.color(v);
      const rect = `<rect class="bp-cell" ${box} fill="${fill}">${tip(`${row} · ${s.name}: ${formatValue(v, spec.unit)}`)}</rect>`;
      const value = showValues
        ? text(x + g.cellW / 2, y + g.cellH / 2 + 3, formatValue(v, spec.unit), { anchor: 'middle', size: VALUE_SIZE, fill: readableInk(fill), font: theme.fontFamily, cls: 'bp-cell-label' })
        : '';
      return rect + value;
    }).join('');
    return label + marks;
  }).join('');
}

/** Discrete swatches across the ramp with its end (and zero) labelled. */
function colorKey(spec, g, scale, theme, canvasHeight) {
  const y = canvasHeight - HEATMAP.key + 18;
  const font = { size: VALUE_SIZE, fill: theme.textMuted, font: theme.fontFamily };
  const swatches = Array.from({ length: KEY_STEPS }, (_, k) => {
    const v = scale.lo + ((scale.hi - scale.lo) * k) / (KEY_STEPS - 1);
    return `<rect x="${r1(g.left + k * KEY_SWATCH.width)}" y="${y}" width="${KEY_SWATCH.width}" height="${KEY_SWATCH.height}" fill="${scale.color(v)}"/>`;
  }).join('');
  const right = g.left + KEY_STEPS * KEY_SWATCH.width;
  const labels = text(g.left, y + 20, formatValue(scale.lo, spec.unit), font) +
    (scale.diverging ? text((g.left + right) / 2, y + 20, formatValue(0, spec.unit), { ...font, anchor: 'middle' }) : '') +
    text(right, y + 20, formatValue(scale.hi, spec.unit), { ...font, anchor: 'end' });
  return `<g class="bp-color-key">${swatches}${labels}</g>`;
}

/**
 * Render a heatmap ChartSpec (rows = categories, columns = series) to an SVG body.
 * @param {import('./normalize.js').ChartSpec} spec
 * @param {import('./theme.js').DARK_THEME} theme
 * @param {import('./svg.js').WIDE} [layout]
 * @returns {string}
 */
export function renderHeatmap(spec, theme, layout = WIDE) {
  const values = spec.series.flatMap(s => s.values).filter(v => v !== null);
  const scale = colorScale(values, theme.heat ?? FALLBACK_HEAT);
  const g = geometry(spec, layout);
  const widest = Math.max(...values.map(v => formatValue(v, spec.unit).length)) * VALUE_CHAR_WIDTH;
  const showValues = widest <= g.cellW - 4 && g.cellH >= HEATMAP.rowMin + 4;
  const height = HEATMAP.header + spec.categories.length * g.cellH + HEATMAP.key;
  return columnHeaders(spec, g, theme) + cells(spec, g, scale, theme, showValues) + colorKey(spec, g, scale, theme, height);
}
