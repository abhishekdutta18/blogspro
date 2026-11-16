// browser.js — DOM helpers for the chart engine (browser only; the core stays pure).
//   mountChart          — render/re-render into an element (replaces Chart.js destroy()+new Chart / Google draw())
//   upgradeLegacyCharts — migrate admin chart-builder markup already stored in Firestore posts
//   hydrateChartTags    — render <chart-data> elements left in already-published HTML
import { renderChart } from './index.js';
import { chartCss, enhanceCharts } from './runtime.js';

let mountCount = 0;

/**
 * Install the narrow-layout CSS and tap/crosshair listeners in a live document, once.
 * Server-rendered pages get the same thing inline from chartPageAssets().
 * @param {Document} [doc]
 */
export function ensureChartRuntime(doc = document) {
  if (!doc.head.querySelector('style[data-bp-chart-css]')) {
    const style = doc.createElement('style');
    style.setAttribute('data-bp-chart-css', '');
    style.textContent = chartCss();
    doc.head.appendChild(style);
  }
  enhanceCharts(doc);
}

/**
 * Render a chart into `el`, replacing its contents. Safe to call repeatedly for live dashboards.
 * @param {Element} el
 * @param {unknown} input payload or ChartSpec
 * @param {Parameters<typeof renderChart>[1]} [options]
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function mountChart(el, input, options) {
  try {
    // Scope ids to the host element so identical data mounted twice never collides.
    mountCount += 1;
    const idSuffix = options?.idSuffix ?? (el.id || `m${mountCount}`);
    el.innerHTML = renderChart(input, { ...options, idSuffix });
    ensureChartRuntime(el.ownerDocument);
    return { ok: true };
  } catch (err) {
    el.innerHTML = '';
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Source line from a legacy block (last italic footer div), if any. */
function legacySource(block) {
  const footer = [...block.children].reverse().find(el => el.style?.fontStyle === 'italic');
  return footer?.textContent?.trim() || '';
}

/**
 * Replace legacy `.bp-chart-block` markup (Google Charts payload in `data-bp-gchart`) with engine
 * output. Blocks without a payload (legacy stats/table) keep their existing static HTML.
 * @param {ParentNode} [root]
 * @param {Parameters<typeof renderChart>[1]} [options] defaults to the admin's light theme
 * @returns {{ upgraded: number, failed: number }}
 */
export function upgradeLegacyCharts(root = document, options = { theme: 'light' }) {
  let upgraded = 0;
  let failed = 0;
  root.querySelectorAll('.bp-chart-block').forEach((block, i) => {
    const holder = block.querySelector('[data-bp-gchart]');
    if (!holder) return;
    try {
      const payload = JSON.parse(holder.getAttribute('data-bp-gchart') || '');
      const source = legacySource(block);
      block.outerHTML = renderChart({ ...payload, ...(source ? { source } : {}) }, { ...options, idSuffix: `legacy-${i}` });
      upgraded += 1;
    } catch {
      failed += 1; // leave the legacy fallback HTML in place — it still renders without JS
    }
  });
  if (upgraded > 0) ensureChartRuntime(root.ownerDocument ?? root);
  return { upgraded, failed };
}

/**
 * Render `<chart-data>` elements still present in published HTML (pre-engine pipeline pages).
 * @param {ParentNode} [root]
 * @param {Parameters<typeof renderChart>[1]} [options]
 * @returns {{ rendered: number, failed: number }}
 */
export function hydrateChartTags(root = document, options) {
  let rendered = 0;
  let failed = 0;
  root.querySelectorAll('chart-data').forEach((tag, i) => {
    try {
      tag.outerHTML = renderChart(tag.textContent || '', { ...options, idSuffix: `tag-${i}` });
      rendered += 1;
    } catch {
      tag.remove();
      failed += 1;
    }
  });
  if (rendered > 0) ensureChartRuntime(root.ownerDocument ?? root);
  return { rendered, failed };
}
