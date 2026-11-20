// render-gauge.js — Semicircle gauges (Google Gauge parity: min/max, red/yellow/green bands).
// The value arc takes the status color of the band it falls in, and the state is always
// spelled out (icon dot + word) so color never carries meaning alone.
import { formatValue } from './format.js';
import { WIDE, NARROW, GAUGE_ROW_HEIGHT, gaugeColumns, r1, text, tip } from './svg.js';

const TRACK_WIDTH = 18;
const BAND_WIDTH = 4;
const BAND_OFFSET = 15;
const WIDE_CENTER_Y = 170;
const ROW_CENTER_Y = 140; // narrow multi-gauge rows: centre within each GAUGE_ROW_HEIGHT row
const VALUE_SIZE = Object.freeze({ full: 26, compact: 20 });
const LEVEL_LABEL = Object.freeze({ critical: 'CRITICAL', warning: 'ELEVATED', good: 'NORMAL', normal: '' });

/** Angle (radians) for a value: min at the left (π), max at the right (0). */
const angleFor = (g, v) => Math.PI - ((v - g.min) / (g.max - g.min)) * Math.PI;

/** Upper-semicircle arc path between two values. */
function arc(cx, cy, r, g, from, to) {
  const [a0, a1] = [angleFor(g, from), angleFor(g, to)];
  const p = a => `${r1(cx + r * Math.cos(a))},${r1(cy - r * Math.sin(a))}`;
  return `M${p(a0)}A${r1(r)},${r1(r)} 0 0 1 ${p(a1)}`;
}

function renderOne(g, cell, unit, theme) {
  const cx = cell.x + cell.width / 2;
  const cy = cell.cy;
  const r = Math.min(cell.width * 0.36, 110);
  const font = theme.fontFamily;
  const valueColor = g.level === 'normal' ? theme.accent : theme.status[g.level];
  const bands = g.bands.map(b => {
    const from = Math.max(g.min, Math.min(b.from, b.to));
    const to = Math.min(g.max, Math.max(b.from, b.to));
    return to > from ? `<path d="${arc(cx, cy, r + BAND_OFFSET, g, from, to)}" fill="none" stroke="${theme.status[b.level]}" stroke-width="${BAND_WIDTH}"/>` : '';
  }).join('');
  const valueArc = g.value > g.min
    ? `<path class="bp-gauge-value" d="${arc(cx, cy, r, g, g.min, g.value)}" fill="none" stroke="${valueColor}" stroke-width="${TRACK_WIDTH}"/>`
    : '';
  const state = LEVEL_LABEL[g.level]
    ? `<circle cx="${r1(cx - 30)}" cy="${cy + 37}" r="4" fill="${theme.status[g.level]}"/>` +
      text(cx - 22, cy + 41, LEVEL_LABEL[g.level], { size: 10, weight: 700, fill: theme.textSecondary, font })
    : '';
  return `<g class="bp-gauge">${tip(`${g.label}: ${formatValue(g.value, unit)}`)}` +
    `<path d="${arc(cx, cy, r, g, g.min, g.max)}" fill="none" stroke="${theme.track}" stroke-width="${TRACK_WIDTH}"/>` +
    bands + valueArc +
    text(cx, cy - 8, formatValue(g.value, unit), { anchor: 'middle', size: cell.valueSize, weight: 700, fill: theme.textPrimary, font }) +
    text(cx, cy + 18, g.label, { anchor: 'middle', size: 11, fill: theme.textSecondary, font }) +
    text(cx - r, cy + 18, formatValue(g.min, unit), { anchor: 'middle', size: 9, fill: theme.textMuted, font }) +
    text(cx + r, cy + 18, formatValue(g.max, unit), { anchor: 'middle', size: 9, fill: theme.textMuted, font }) +
    state + '</g>';
}

/**
 * Render a gauge ChartSpec (1–4 gauges side by side) to an SVG body.
 * @param {import('./normalize.js').ChartSpec} spec
 * @param {import('./theme.js').DARK_THEME} theme
 * @param {import('./svg.js').WIDE} [layout]
 * @returns {string}
 */
export function renderGauge(spec, theme, layout = WIDE) {
  const columns = gaugeColumns(spec, layout);
  const width = layout.width / columns;
  const gridded = layout === NARROW && spec.gauges.length > 1;
  return spec.gauges.map((g, i) => {
    const row = Math.floor(i / columns);
    const cell = {
      x: (i % columns) * width,
      width,
      cy: gridded ? row * GAUGE_ROW_HEIGHT + ROW_CENTER_Y : WIDE_CENTER_Y,
      valueSize: width < 260 ? VALUE_SIZE.compact : VALUE_SIZE.full,
    };
    return renderOne(g, cell, spec.unit, theme);
  }).join('');
}
