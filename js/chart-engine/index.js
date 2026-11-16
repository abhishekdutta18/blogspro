// index.js — Public API of the BlogsPro chart engine.
// Zero dependencies, isomorphic (Node pipeline + browser admin/dashboards). Output is a
// self-contained <figure> with inline styles, so charts survive GitHub Pages without JS,
// PDFs (puppeteer), RSS, crawlers and — via target:'email' — email clients.
import { normalizeChart, ChartSpecError } from './normalize.js';
import { renderBars } from './render-bars.js';
import { renderLines } from './render-lines.js';
import { renderPie } from './render-pie.js';
import { renderGauge } from './render-gauge.js';
import { renderWaterfall } from './render-waterfall.js';
import { renderHeatmap } from './render-heatmap.js';
import { renderCandles } from './render-candles.js';
import { renderStats, renderTable } from './render-html.js';
import { resolveTheme } from './theme.js';
import { escapeHtml, formatValue, formatFull } from './format.js';
import { WIDE, NARROW, canvasFor } from './svg.js';
import { mermaidToChart } from './mermaid.js';

export { normalizeChart, ChartSpecError, parsePayload } from './normalize.js';
export { mermaidToChart } from './mermaid.js';
export { CHART_PROMPT_SPEC, CHART_PROMPT_EXAMPLES } from './prompt-spec.js';
export { DARK_THEME, LIGHT_THEME } from './theme.js';
export { chartPageAssets, chartCss, enhanceCharts } from './runtime.js';

const CHART_TAG = /<chart-data\b[^>]*>([\s\S]*?)<\/chart-data>/gi;
const UNCLOSED_TAG = /<chart-data\b[^>]*>[\s\S]*?(?=\n[ \t]*\n|$)/gi;
const MERMAID_FENCE = /```mermaid[ \t]*\n([\s\S]*?)```/g;
const MIN_SVG_WIDTH = 480; // keeps 10px chart text >= ~7.5px on screen
const SVG_RENDERERS = Object.freeze({
  bar: renderBars, line: renderLines, pie: renderPie, gauge: renderGauge,
  waterfall: renderWaterfall, heatmap: renderHeatmap, candlestick: renderCandles,
});
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
  const n = spec.categories.length;
  if (spec.type === 'heatmap') return `Heatmap of ${n} rows by ${spec.series.length} columns, values ranging ${range}.`;
  if (spec.type === 'candlestick') return `${spec.candle === 'ohlc' ? 'OHLC' : 'Candlestick'} chart of ${n} periods, from ${spec.categories[0]} to ${spec.categories[n - 1]}, trading ${range}.`;
  if (spec.type === 'waterfall') return `Waterfall of ${n} steps from ${spec.categories[0]} to ${spec.categories[n - 1]}.`;
  const kind = spec.type === 'bar' ? `${spec.stacked ? 'stacked ' : ''}${spec.orientation} bar` : spec.area ? 'area' : spec.type;
  return `${kind} chart of ${spec.series.map(s => s.name).join(', ')} across ${spec.categories.length} categories, ranging ${range}.`;
}

/** Rows for the table view of an SVG chart. */
function tableRows(spec) {
  if (spec.type === 'gauge') return { head: ['', 'Value'], rows: spec.gauges.map(g => [g.label, formatValue(g.value, spec.unit)]) };
  const format = spec.type === 'candlestick' ? formatFull : formatValue; // prices are read exactly
  return {
    head: ['', ...spec.series.map(s => s.name)],
    rows: spec.categories.map((c, i) => [c, ...spec.series.map(s => (s.values[i] === null ? '–' : format(s.values[i], spec.unit)))]),
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

/** One <svg> of the chart drawn for `layout`; `id` must be unique per SVG on the page. */
function svgFor(spec, theme, id, layout, minWidth) {
  const { width, height } = canvasFor(spec, layout);
  const title = spec.title || spec.name || `${spec.series[0]?.name ?? 'Value'} chart`;
  const body = SVG_RENDERERS[spec.type](spec, theme, layout);
  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${id}-t ${id}-d" style="width:100%;min-width:${minWidth}px;height:auto;display:block"><title id="${id}-t">${escapeHtml(title)}</title><desc id="${id}-d">${escapeHtml(describe(spec))}</desc>${body}</svg>`;
}

/**
 * The plot: a wide SVG plus a narrow one laid out for phone columns. Inline styles show only the
 * wide one (safe where page CSS is stripped); the page CSS from chartPageAssets() swaps them by
 * container width. Without container-query support the wide SVG scrolls in its own frame.
 */
function svgBlock(spec, theme, id) {
  if (spec.sparkline) return `<div>${svgFor(spec, theme, id, WIDE, 0)}</div>`;
  return `<div class="bp-plot" style="container-type:inline-size">` +
    `<div class="bp-wide" style="overflow-x:auto">${svgFor(spec, theme, id, WIDE, MIN_SVG_WIDTH)}</div>` +
    `<div class="bp-narrow" style="display:none">${svgFor(spec, theme, `${id}-n`, NARROW, 0)}</div></div>`;
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
  return `<figure class="bp-chart" id="${id}" data-chart-type="${spec.type}" data-ink="${escapeHtml(t.textPrimary)}" style="margin:2.5rem 0;padding:${padding};background:${t.surface};border:1px solid ${t.border};border-radius:4px">${captionBlock(spec, t)}${plot}${tableView}${source}</figure>`;
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
 * @returns {{ text: string, restore: (html: string) => string, failures: { index: number, error: string }[], rescued: number, count: number }}
 *   `count` = charts actually rendered (failed blocks excluded), e.g. to decide whether a page needs chartPageAssets()
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
  let rescued = 0;
  const shielded = String(text ?? '')
    .replace(CHART_TAG, (_, raw) => {
      try {
        return place(renderChart(decodeEntities(raw), { ...options, idSuffix: rendered.length }));
      } catch (err) {
        return fail(raw, err);
      }
    })
    .replace(UNCLOSED_TAG, match => fail(match, new ChartSpecError('unclosed <chart-data> tag')))
    .replace(MERMAID_FENCE, (match, source) => {
      const payload = mermaidToChart(source);
      if (!payload) return match; // not a chart (flowchart etc.): leave it as the author wrote it
      try {
        const html = renderChart(payload, { ...options, idSuffix: rendered.length });
        rescued += 1;
        return place(html);
      } catch (err) {
        return fail(source, err);
      }
    });
  const token = new RegExp(`(?:<p\\b[^>]*>\\s*)?@@BPC_${nonce}_(\\d+)@@(?:\\s*</p>)?`, 'g');
  const restore = html => html.replace(token, (_, i) => rendered[Number(i)] ?? '');
  return { text: shielded, restore, failures, rescued, count: rendered.length - failures.length };
}

/**
 * Check every <chart-data> block without rendering a page — for validators and correction loops.
 * Error messages are the engine's own, so they can be fed back to the model verbatim.
 * @param {string} text
 * @returns {{ count: number, failures: { index: number, error: string }[] }}
 */
export function auditCharts(text) {
  const blocks = [...String(text ?? '').matchAll(CHART_TAG)].map(m => m[1]);
  const failures = blocks.flatMap((raw, index) => {
    try {
      normalizeChart(decodeEntities(raw));
      return [];
    } catch (err) {
      return [{ index, error: err instanceof Error ? err.message : String(err) }];
    }
  });
  return { count: blocks.length, failures };
}
