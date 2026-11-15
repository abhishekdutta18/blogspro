// index.js — Public API of the BlogsPro chart engine.
// Zero dependencies, isomorphic (Node pipeline + browser admin/dashboards). Output is a
// self-contained <figure> with inline styles, so charts survive GitHub Pages without JS,
// PDFs (puppeteer), RSS, crawlers and — via target:'email' — email clients.
import { normalizeChart, ChartSpecError } from './normalize.js';
import { renderBars } from './render-bars.js';
import { renderLines } from './render-lines.js';
import { renderPie } from './render-pie.js';
import { renderGauge } from './render-gauge.js';
import { renderStats, renderTable } from './render-html.js';
import { resolveTheme } from './theme.js';
import { escapeHtml, formatValue } from './format.js';
import { canvasFor } from './svg.js';

export { normalizeChart, ChartSpecError } from './normalize.js';
export { DARK_THEME, LIGHT_THEME } from './theme.js';

const CHART_TAG = /<chart-data\b[^>]*>([\s\S]*?)<\/chart-data>/gi;
const UNCLOSED_TAG = /<chart-data\b[^>]*>[\s\S]*?(?=\n[ \t]*\n|$)/gi;
const MIN_SVG_WIDTH = 480; // keeps 10px chart text >= ~7.5px on screen
const SVG_RENDERERS = Object.freeze({ bar: renderBars, line: renderLines, pie: renderPie, gauge: renderGauge });
const HTML_RENDERERS = Object.freeze({ stats: renderStats, table: renderTable });

/** djb2 — deterministic short id so re-renders produce identical HTML (clean git diffs). */
function hashId(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return `bpc-${h.toString(36)}`;
}

/** One-sentence screen-reader summary of what the chart shows. */
function describe(spec) {
  if (spec.type === 'gauge') return spec.gauges.map(g => `${g.label} at ${formatValue(g.value, spec.unit)} of ${formatValue(g.max, spec.unit)}`).join('; ') + '.';
  const values = spec.series.flatMap(s => s.values).filter(v => v !== null);
  const range = `${formatValue(Math.min(...values), spec.unit)} to ${formatValue(Math.max(...values), spec.unit)}`;
  const kind = spec.type === 'bar' ? `${spec.stacked ? 'stacked ' : ''}${spec.orientation} bar` : spec.area ? 'area' : spec.type;
  return `${kind} chart of ${spec.series.map(s => s.name).join(', ')} across ${spec.categories.length} categories, ranging ${range}.`;
}

/** Rows for the table view of an SVG chart. */
function tableRows(spec) {
  if (spec.type === 'gauge') return { head: ['', 'Value'], rows: spec.gauges.map(g => [g.label, formatValue(g.value, spec.unit)]) };
  return {
    head: ['', ...spec.series.map(s => s.name)],
    rows: spec.categories.map((c, i) => [c, ...spec.series.map(s => (s.values[i] === null ? '–' : formatValue(s.values[i], spec.unit)))]),
  };
}

/** Table view — the accessibility fallback on the web (collapsed) and the whole chart in email (open). */
function dataTable(spec, theme, { open }) {
  const cell = `padding:4px 10px;border-bottom:1px solid ${theme.border}`;
  const { head, rows } = tableRows(spec);
  const table = `<table style="border-collapse:collapse;margin-top:8px;width:100%;color:${theme.textSecondary};font:11px ${theme.fontFamily}"><thead><tr>${head.map(h => `<th style="${cell};text-align:left">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>` +
    rows.map(r => `<tr>${r.map((v, i) => `<td style="${cell};text-align:${i ? 'right' : 'left'}">${escapeHtml(v)}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
  if (open) return table;
  return `<details style="margin-top:10px;color:${theme.textSecondary};font:11px ${theme.fontFamily}"><summary style="cursor:pointer;color:${theme.textMuted}">View data</summary>${table}</details>`;
}

function captionBlock(spec, theme) {
  const parts = [
    spec.name ? `<div style="font:700 10px ${theme.fontFamily};letter-spacing:.08em;text-transform:uppercase;color:${theme.textMuted};margin-bottom:4px">${escapeHtml(spec.name)}</div>` : '',
    spec.title ? `<div style="font:700 13px ${theme.fontFamily};letter-spacing:.06em;text-transform:uppercase;color:${theme.textPrimary}">${escapeHtml(spec.title)}</div>` : '',
    spec.subtitle ? `<div style="font:11px ${theme.fontFamily};color:${theme.textSecondary};margin-top:2px">${escapeHtml(spec.subtitle)}</div>` : '',
  ].join('');
  return parts ? `<figcaption style="margin:0 0 12px">${parts}</figcaption>` : '';
}

function svgBlock(spec, theme, id) {
  const { width, height } = canvasFor(spec);
  const title = spec.title || spec.name || `${spec.series[0]?.name ?? 'Value'} chart`;
  const body = SVG_RENDERERS[spec.type](spec, theme);
  const minWidth = spec.sparkline ? 0 : MIN_SVG_WIDTH;
  // A fixed viewBox scales text with the container; below minWidth the chart scrolls in its own frame.
  return `<div style="overflow-x:auto"><svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${id}-t ${id}-d" style="width:100%;min-width:${minWidth}px;height:auto;display:block"><title id="${id}-t">${escapeHtml(title)}</title><desc id="${id}-d">${escapeHtml(describe(spec))}</desc>${body}</svg></div>`;
}

/**
 * Render a chart payload to a self-contained HTML <figure>.
 * @param {unknown} input raw <chart-data> text, parsed object/array, or a ChartSpec
 * @param {{ theme?: 'dark'|'light'|object, target?: 'web'|'email', idSuffix?: string|number }} [options]
 * @returns {string}
 * @throws {ChartSpecError} when the payload cannot be charted honestly
 */
export function renderChart(input, { theme, target = 'web', idSuffix } = {}) {
  const spec = normalizeChart(input);
  const t = resolveTheme(theme ?? spec.theme);
  const baseId = spec.id || hashId(`${JSON.stringify(spec)}|${t.name}|${target}`);
  const id = idSuffix === undefined ? baseId : `${baseId}-${idSuffix}`;
  const email = target === 'email';
  const isHtmlType = spec.type in HTML_RENDERERS;
  const plot = isHtmlType ? HTML_RENDERERS[spec.type](spec, t) : email ? dataTable(spec, t, { open: true }) : svgBlock(spec, t, id);
  const tableView = isHtmlType || email ? '' : dataTable(spec, t, { open: false });
  const source = spec.source ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid ${t.border};font:italic 10px ${t.fontFamily};color:${t.textMuted}">${escapeHtml(spec.source)}</div>` : '';
  const padding = spec.sparkline ? '10px' : '20px';
  return `<figure class="bp-chart" id="${id}" data-chart-type="${spec.type}" style="margin:2.5rem 0;padding:${padding};background:${t.surface};border:1px solid ${t.border};border-radius:4px">${captionBlock(spec, t)}${plot}${tableView}${source}</figure>`;
}

/**
 * What a reader sees when a <chart-data> payload cannot be rendered. Default: nothing
 * (the failure is still reported via extractChartBlocks().failures for telemetry).
 * @param {string} raw original payload text — untrusted, escape before any output
 * @param {Error} error why normalization failed
 * @returns {string}
 */
// eslint-disable-next-line no-unused-vars
export function invalidChartFallback(raw, error) {
  return ''; // TODO(policy): decide what readers see for a broken chart — see PR notes
}

/** Undo HTML entity escaping some upstream steps apply to chart JSON. */
function decodeEntities(raw) {
  return raw.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** Per-call random nonce: article text cannot predict it, so it cannot forge tokens (review M3). */
function makeNonce() {
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint32Array(2));
  return bytes ? Array.from(bytes, n => n.toString(36)).join('') : Math.random().toString(36).slice(2);
}

/**
 * Replace every <chart-data> block with a placeholder token so markdown parsing cannot mangle
 * the SVG, then swap rendered figures back in with `restore`. Unclosed tags are consumed up to
 * the next blank line so raw JSON never reaches the page.
 *
 * @param {string} text markdown/HTML containing <chart-data> blocks
 * @param {{ theme?: 'dark'|'light'|object, target?: 'web'|'email' }} [options]
 * @returns {{ text: string, restore: (html: string) => string, failures: { index: number, error: string }[] }}
 */
export function extractChartBlocks(text, options = {}) {
  const nonce = makeNonce();
  const rendered = [];
  const failures = [];
  const place = html => {
    rendered.push(html);
    return `\n\n@@BPC_${nonce}_${rendered.length - 1}@@\n\n`;
  };
  const fail = (raw, err) => {
    const error = err instanceof Error ? err : new Error(String(err));
    failures.push({ index: rendered.length, error: error.message });
    return place(invalidChartFallback(raw, error));
  };
  const shielded = String(text ?? '')
    .replace(CHART_TAG, (_, raw) => {
      try {
        return place(renderChart(decodeEntities(raw), { ...options, idSuffix: rendered.length }));
      } catch (err) {
        return fail(raw, err);
      }
    })
    .replace(UNCLOSED_TAG, match => fail(match, new ChartSpecError('unclosed <chart-data> tag')));
  const token = new RegExp(`(?:<p\\b[^>]*>\\s*)?@@BPC_${nonce}_(\\d+)@@(?:\\s*</p>)?`, 'g');
  const restore = html => html.replace(token, (_, i) => rendered[Number(i)] ?? '');
  return { text: shielded, restore, failures };
}
