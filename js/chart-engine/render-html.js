// render-html.js — Non-SVG chart types from the admin chart-builder: stat cards and the
// comparison table. Inline styles only, so they also render in email clients.
import { escapeHtml } from './format.js';

const CURRENCY = /^[₹$€£]/;

/**
 * Display text for a stat. Headline numbers are author-formatted: never compact them
 * ("2,847" stays "2,847"). The unit is only attached to bare numbers ("23" + "%" -> "23%").
 */
function statText(raw, unit) {
  if (!unit || !/^[-+]?[\d.,]+$/.test(raw.trim())) return raw;
  if (CURRENCY.test(unit)) return `${unit[0]}${raw}${unit.slice(1)}`;
  return unit === '%' ? `${raw}%` : `${raw} ${unit}`;
}

/**
 * Stat cards — headline numbers. Values wear text tokens (never series color); a thin
 * accent rule carries the brand.
 * @param {import('./normalize.js').ChartSpec} spec
 * @param {import('./theme.js').DARK_THEME} theme
 */
export function renderStats(spec, theme) {
  const values = spec.cells[0] ?? [];
  const cards = spec.categories.map((label, i) => `<div class="bp-stat" style="flex:1 1 140px;min-width:120px;background:${theme.surface2};border:1px solid ${theme.border};border-top:2px solid ${theme.accent};border-radius:4px;padding:14px 16px">` +
    `<div style="font:700 26px/1.1 ${theme.fontFamily};color:${theme.textPrimary};margin-bottom:6px">${escapeHtml(statText(values[i] ?? '–', spec.unit))}</div>` +
    `<div style="font:11px/1.3 ${theme.fontFamily};color:${theme.textMuted}">${escapeHtml(label)}</div></div>`).join('');
  return `<div style="display:flex;flex-wrap:wrap;gap:12px">${cards}</div>`;
}

/**
 * Comparison table — rows are series (e.g. providers), columns are categories (e.g. features).
 * @param {import('./normalize.js').ChartSpec} spec
 * @param {import('./theme.js').DARK_THEME} theme
 */
export function renderTable(spec, theme) {
  const cell = `padding:8px 12px;border-bottom:1px solid ${theme.border};font:12px/1.4 ${theme.fontFamily};vertical-align:top`;
  const head = ['', ...spec.categories].map(h => `<th style="${cell};text-align:left;color:${theme.accent};font-weight:700;white-space:nowrap">${escapeHtml(h)}</th>`).join('');
  const rows = spec.series.map((s, ri) => `<tr${ri % 2 ? ` style="background:${theme.surface2}"` : ''}>` +
    `<th scope="row" style="${cell};text-align:left;color:${theme.textPrimary};font-weight:600;white-space:nowrap">${escapeHtml(s.name)}</th>` +
    spec.categories.map((_, ci) => `<td style="${cell};color:${theme.textSecondary}">${escapeHtml(spec.cells[ri]?.[ci] || '–')}</td>`).join('') +
    '</tr>').join('');
  return `<div style="overflow-x:auto"><table class="bp-table" style="width:100%;border-collapse:collapse"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
