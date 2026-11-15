// render-pie.js — Pie / donut via stroke-dasharray rings. One formula covers a solid pie
// (hole 0), any donut (Google pieHole, Chart.js cutout) and a 100% slice with no arc math.
import { formatValue } from './format.js';
import { r1, tip, text, truncate } from './svg.js';
import { seriesColor } from './theme.js';

const DONUT = Object.freeze({ cx: 170, cy: 180, radius: 124, gap: 2 });
const LEGEND = Object.freeze({ x: 330, right: 620, rowHeight: 28 });
const MIN_HOLE_FOR_TOTAL = 0.45; // center total only fits inside a real hole

function layoutSlices(spec) {
  const values = spec.series[0].values;
  const total = values.reduce((a, b) => a + b, 0);
  let cumulative = 0;
  const slices = values.map((value, i) => {
    const slice = { i, label: spec.categories[i], value, share: value / total, start: cumulative };
    cumulative += slice.share;
    return slice;
  });
  return { total, slices };
}

/**
 * Render a pie ChartSpec (already folded to <= 7 slices) as an SVG body.
 * @param {import('./normalize.js').ChartSpec} spec
 * @param {import('./theme.js').DARK_THEME} theme
 * @returns {string}
 */
export function renderPie(spec, theme) {
  const { cx, cy, radius, gap } = DONUT;
  const inner = radius * spec.hole;
  const ringRadius = (radius + inner) / 2; // a stroke centred here spans [inner, radius]
  const thickness = radius - inner;
  const circumference = 2 * Math.PI * ringRadius;
  const { total, slices } = layoutSlices(spec);
  const font = theme.fontFamily;
  const isPercent = spec.unit === '%'; // values already shares: skip duplicate share column + "100%" total

  const rings = slices.filter(s => s.value > 0).map(s => {
    const dash = Math.max(0.5, s.share * circumference - (s.share < 1 ? gap : 0));
    const label = `${s.label}: ${formatValue(s.value, spec.unit)} (${r1(s.share * 100)}%)`;
    return `<circle class="bp-slice" cx="${cx}" cy="${cy}" r="${r1(ringRadius)}" fill="none" stroke="${seriesColor(theme, s.i)}" stroke-width="${r1(thickness)}" stroke-dasharray="${r1(dash)} ${r1(circumference - dash)}" stroke-dashoffset="${r1(-s.start * circumference)}" transform="rotate(-90 ${cx} ${cy})">${tip(label)}</circle>`;
  });

  const legend = slices.map((s, row) => {
    const y = cy - (slices.length * LEGEND.rowHeight) / 2 + row * LEGEND.rowHeight + 14;
    const figure = isPercent ? formatValue(s.value, '%') : `${formatValue(s.value, spec.unit)} · ${r1(s.share * 100)}%`;
    return `<rect x="${LEGEND.x}" y="${r1(y - 9)}" width="10" height="10" rx="2" fill="${seriesColor(theme, s.i)}"/>` +
      text(LEGEND.x + 18, y, truncate(s.label, 18), { size: 11, fill: theme.textSecondary, font }) +
      text(LEGEND.right, y, figure, { anchor: 'end', size: 11, fill: theme.textPrimary, font });
  });

  const center = isPercent || spec.hole < MIN_HOLE_FOR_TOTAL ? '' :
    text(cx, cy + 2, formatValue(total, spec.unit), { anchor: 'middle', size: 18, weight: 700, fill: theme.textPrimary, font }) +
    text(cx, cy + 20, 'TOTAL', { anchor: 'middle', size: 9, fill: theme.textMuted, font });

  return `${rings.join('')}${center}<g class="bp-legend">${legend.join('')}</g>`;
}
