// render-pie.js — Pie / donut via stroke-dasharray rings. One formula covers a solid pie
// (hole 0), any donut (Google pieHole, Chart.js cutout) and a 100% slice with no arc math.
import { formatValue } from './format.js';
import { WIDE, PIE_LEGEND_ROW, pieGeometry, r1, tip, text, truncate } from './svg.js';
import { seriesColor } from './theme.js';

const SLICE_GAP = 2;
const LEGEND_LABEL_CHARS = Object.freeze({ wide: 18, narrow: 22 });
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
 * @param {import('./svg.js').WIDE} [layout]
 * @returns {string}
 */
export function renderPie(spec, theme, layout = WIDE) {
  const { cx, cy, radius, legendX, legendRight, legendTop } = pieGeometry(spec, layout);
  const gap = SLICE_GAP;
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

  // Wide: legend centred beside the donut. Narrow: legend rows start below it.
  const firstRow = legendTop ?? cy - (slices.length * PIE_LEGEND_ROW) / 2 + 14;
  const legend = slices.map((s, row) => {
    const y = firstRow + row * PIE_LEGEND_ROW;
    const figure = isPercent ? formatValue(s.value, '%') : `${formatValue(s.value, spec.unit)} · ${r1(s.share * 100)}%`;
    return `<rect x="${legendX}" y="${r1(y - 9)}" width="10" height="10" rx="2" fill="${seriesColor(theme, s.i)}"/>` +
      text(legendX + 18, y, truncate(s.label, LEGEND_LABEL_CHARS[layout.name]), { size: 11, fill: theme.textSecondary, font }) +
      text(legendRight, y, figure, { anchor: 'end', size: 11, fill: theme.textPrimary, font });
  });

  const center = isPercent || spec.hole < MIN_HOLE_FOR_TOTAL ? '' :
    text(cx, cy + 2, formatValue(total, spec.unit), { anchor: 'middle', size: 18, weight: 700, fill: theme.textPrimary, font }) +
    text(cx, cy + 20, 'TOTAL', { anchor: 'middle', size: 9, fill: theme.textMuted, font });

  return `${rings.join('')}${center}<g class="bp-legend">${legend.join('')}</g>`;
}
