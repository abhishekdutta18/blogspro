// degrade.js — Keeps an engine bug from costing readers the chart. Input the model got wrong is
// rejected earlier (ChartSpecError, fed back to the correction loop); this module handles the
// other kind of failure — a renderer that throws or emits non-finite geometry for a valid spec.
// Ladder: wide + narrow SVG → wide SVG only → nothing (caller shows the data table, which reads
// the normalized spec directly and cannot hit a renderer bug). Every step down is reported.

/** Numeric SVG attributes; NaN/Infinity there makes the browser drop the mark without an error. */
const BROKEN_GEOMETRY = /\s(?:x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|width|height|d|points|transform|viewBox|data-x|data-top|data-bottom)="[^"]*\b(?:NaN|-?Infinity)\b/;

/**
 * True when an SVG string carries non-finite numbers in geometry (text content is ignored).
 * @param {string} svg
 * @returns {boolean}
 */
export function hasBrokenGeometry(svg) {
  return BROKEN_GEOMETRY.test(svg);
}

/** @typedef {{ stage: 'wide'|'narrow', error: string }} Degradation */

/**
 * Run one layout; a throw or broken geometry is reported and yields null.
 * @param {'wide'|'narrow'} stage
 * @param {() => string} render
 * @param {(report: Degradation) => void} onDegrade
 * @returns {string|null}
 */
function attempt(stage, render, onDegrade) {
  try {
    const svg = render();
    if (hasBrokenGeometry(svg)) throw new RangeError('non-finite geometry in SVG output');
    return svg;
  } catch (err) {
    onDegrade({ stage, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    return null;
  }
}

/**
 * Render the wide and (optional) narrow layouts, degrading instead of throwing.
 * @param {{ wide: () => string, narrow?: () => string }} layouts
 * @param {(report: Degradation) => void} onDegrade
 * @returns {{ wide: string, narrow: string|null } | null} null when no SVG could be drawn
 */
export function renderLayers({ wide, narrow }, onDegrade) {
  const wideSvg = attempt('wide', wide, onDegrade);
  if (wideSvg === null) return null;
  return { wide: wideSvg, narrow: narrow ? attempt('narrow', narrow, onDegrade) : null };
}
