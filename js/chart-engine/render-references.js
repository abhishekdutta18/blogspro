// render-references.js — Reference lines (repo rate, inflation target) and bands (RBI tolerance
// band) across a cartesian plot, on the value axis. Bands sit behind the marks so data stays
// on top; lines and their labels sit above the marks so they are never hidden by a bar.
import { formatValue } from './format.js';
import { r1, text, tip } from './svg.js';

const LINE_DASH = '4 3';
const LABEL_SIZE = 9;
const LABEL_INSET = 6;

/** Value-axis extent of one reference, in screen units, ordered low -> high on screen. */
function extent(ref, frame) {
  const a = frame.value(ref.kind === 'line' ? ref.value : ref.from);
  const b = frame.value(ref.kind === 'line' ? ref.value : ref.to);
  return [Math.min(a, b), Math.max(a, b)];
}

function describe(ref, unit) {
  const amount = ref.kind === 'line' ? formatValue(ref.value, unit) : `${formatValue(ref.from, unit)} – ${formatValue(ref.to, unit)}`;
  return ref.label ? `${ref.label}: ${amount}` : amount;
}

function band(ref, spec, frame, theme) {
  const { plot, horizontal } = frame;
  const [p0, p1] = extent(ref, frame);
  const font = { size: LABEL_SIZE, fill: theme.textMuted, font: theme.fontFamily };
  const rect = horizontal
    ? `<rect x="${r1(p0)}" y="${plot.top}" width="${r1(p1 - p0)}" height="${r1(plot.bottom - plot.top)}" fill="${theme.track}">${tip(describe(ref, spec.unit))}</rect>`
    : `<rect x="${plot.left}" y="${r1(p0)}" width="${r1(plot.right - plot.left)}" height="${r1(p1 - p0)}" fill="${theme.track}">${tip(describe(ref, spec.unit))}</rect>`;
  const label = !ref.label ? '' : horizontal
    ? text(p0 + LABEL_INSET, plot.top + 12, ref.label, font)
    : text(plot.left + LABEL_INSET, p0 + 12, ref.label, font);
  return `<g class="bp-reference-band">${rect}${label}</g>`;
}

function line(ref, spec, frame, theme) {
  const { plot, horizontal } = frame;
  const [p] = extent(ref, frame);
  const stroke = `stroke="${theme.textSecondary}" stroke-width="1" stroke-dasharray="${LINE_DASH}"`;
  const font = { size: LABEL_SIZE, fill: theme.textSecondary, font: theme.fontFamily };
  const rule = horizontal
    ? `<line x1="${r1(p)}" x2="${r1(p)}" y1="${plot.top}" y2="${plot.bottom}" ${stroke}>${tip(describe(ref, spec.unit))}</line>`
    : `<line x1="${plot.left}" x2="${plot.right}" y1="${r1(p)}" y2="${r1(p)}" ${stroke}>${tip(describe(ref, spec.unit))}</line>`;
  const label = !ref.label ? '' : horizontal
    ? text(p + 4, plot.top + 10, ref.label, font)
    : text(plot.left + LABEL_INSET, p - 4, ref.label, font); // left: a time series ends (and is direct-labelled) on the right
  return `<g class="bp-reference-line">${rule}${label}</g>`;
}

/** Bands, drawn before the marks. */
export function renderReferenceBands(spec, frame, theme) {
  return spec.references.filter(r => r.kind === 'band').map(r => band(r, spec, frame, theme)).join('');
}

/** Lines, drawn after the marks. */
export function renderReferenceLines(spec, frame, theme) {
  return spec.references.filter(r => r.kind === 'line').map(r => line(r, spec, frame, theme)).join('');
}
