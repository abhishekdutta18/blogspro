// render-waterfall.js — Bridge charts (earnings bridge, opening -> closing balance). Totals are
// full bars from zero in neutral ink; each change floats from the previous level and takes the
// polarity color of its sign; thin connectors carry the level from one step to the next.
import { formatValue } from './format.js';
import { buildFrame, renderAxes } from './frame.js';
import { waterfallLevels } from './forms.js';
import { renderReferenceBands, renderReferenceLines } from './render-references.js';
import { WIDE, r1, text, tip } from './svg.js';

const STEP_FILL = 0.62; // share of each category band a step occupies
const LABEL_OFFSET = 6;
const LABEL_CHAR_WIDTH = 5.6; // 9px glyph width

const signed = (v, unit) => (v > 0 ? `+${formatValue(v, unit)}` : formatValue(v, unit));

/**
 * Render a waterfall ChartSpec to an SVG body.
 * @param {import('./normalize.js').ChartSpec} spec
 * @param {import('./theme.js').DARK_THEME} theme
 * @param {import('./svg.js').WIDE} [layout]
 * @returns {string}
 */
export function renderWaterfall(spec, theme, layout = WIDE) {
  const frame = buildFrame(spec, { legend: null, directLabels: false }, layout);
  const levels = waterfallLevels(spec);
  const width = frame.band * STEP_FILL;
  const steps = levels.map(({ start, end }, i) => {
    const x = frame.center(i) - width / 2;
    const [y0, y1] = [frame.value(start), frame.value(end)];
    const top = Math.min(y0, y1);
    const total = spec.totals[i];
    const change = spec.series[0].values[i] ?? 0;
    const fill = total ? theme.textMuted : change < 0 ? theme.negative : theme.positive;
    const label = total ? formatValue(end, spec.unit) : signed(change, spec.unit);
    const detail = total ? label : `${label} (to ${formatValue(end, spec.unit)})`;
    return { x, top, height: Math.max(1, Math.abs(y1 - y0)), fill, label, below: !total && change < 0, end, detail, category: spec.categories[i] };
  });
  const marks = steps.map(s => `<rect class="bp-step" x="${r1(s.x)}" y="${r1(s.top)}" width="${r1(width)}" height="${r1(s.height)}" fill="${s.fill}">${tip(`${s.category}: ${s.detail}`)}</rect>`).join('');
  const connectors = steps.slice(0, -1).map((s, i) => {
    const y = r1(frame.value(s.end));
    return `<line class="bp-connector" x1="${r1(s.x + width)}" x2="${r1(steps[i + 1].x)}" y1="${y}" y2="${y}" stroke="${theme.baseline}" stroke-width="1" stroke-dasharray="2 2"/>`;
  }).join('');
  const fits = Math.max(...steps.map(s => s.label.length)) * LABEL_CHAR_WIDTH <= frame.band - 2;
  const labels = !fits ? '' : steps.map(s => {
    const y = s.below ? s.top + s.height + LABEL_OFFSET + 6 : s.top - LABEL_OFFSET;
    return text(s.x + width / 2, y, s.label, { anchor: 'middle', size: 9, fill: theme.textSecondary, font: theme.fontFamily, cls: 'bp-annotation' });
  }).join('');
  return [renderAxes(spec, frame, theme), renderReferenceBands(spec, frame, theme), connectors, marks, renderReferenceLines(spec, frame, theme), labels].join('');
}
