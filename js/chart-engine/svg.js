// svg.js — Tiny SVG string helpers + canvas sizing shared by renderers. Pure.
import { escapeHtml } from './format.js';

const WIDTH = 640;
const SPARKLINE_HEIGHT = 96;
const DEFAULT_HEIGHT = 360;
const GAUGE_HEIGHT = 240;
const MAX_HEIGHT = 900;

/**
 * Canvas (viewBox) size for a spec. Horizontal bars grow with category count
 * (Google BarChart parity: labels.length * 36 + 60) so long lists stay legible.
 * @returns {{ width: number, height: number }}
 */
export function canvasFor(spec) {
  if (spec.sparkline) return { width: WIDTH, height: SPARKLINE_HEIGHT };
  if (spec.type === 'gauge') return { width: WIDTH, height: GAUGE_HEIGHT };
  if (spec.type === 'bar' && spec.orientation === 'horizontal') {
    const rowHeight = Math.max(28, (spec.stacked ? 1 : spec.series.length) * 14 + 14);
    const chrome = (spec.series.length > 1 ? 36 : 16) + 44;
    return { width: WIDTH, height: Math.min(MAX_HEIGHT, Math.max(160, chrome + spec.categories.length * rowHeight)) };
  }
  return { width: WIDTH, height: DEFAULT_HEIGHT };
}

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

/** Horizontal legend row (rendered for >= 2 series unless disabled). */
export function legendRow(names, theme, { x = 0, y = 14, dashed = [] } = {}) {
  let cursor = x;
  const items = names.map((name, i) => {
    const label = truncate(name, 18);
    const swatch = dashed[i]
      ? `<line x1="${r1(cursor)}" x2="${r1(cursor + 12)}" y1="${y - 4}" y2="${y - 4}" stroke="${theme.series[i]}" stroke-width="2" stroke-dasharray="3 2"/>`
      : `<rect x="${r1(cursor)}" y="${y - 9}" width="10" height="10" rx="2" fill="${theme.series[i]}"/>`;
    const item = swatch + text(cursor + 16, y, label, { fill: theme.textSecondary, font: theme.fontFamily });
    cursor += 16 + label.length * 6.2 + 18;
    return item;
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
