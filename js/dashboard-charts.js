// dashboard-charts.js — Host helper for live dashboard panels (homepage desks, RL terminal,
// RL dashboard, admin swarm telemetry). Wraps the chart engine's mountChart with two things
// the article-oriented engine output does not do on its own:
//   1. Embeds the chart in an existing card: the engine's <figure> ships its own margin,
//      padding, border and surface, which would nest a second card inside the panel.
//   2. Never leaves a blank box: when the engine refuses the data (empty, all-zero or uniform
//      values — a guard meant for LLM payloads), the panel says so in words.
// Re-mounting replaces the host's contents, so 5s/10s sync loops do not grow the DOM.
import { mountChart } from './chart-engine/browser.js';
import { escapeHtml } from './chart-engine/format.js';

const DEFAULT_MAX_WIDTH = '640px'; // the engine's viewBox width: text renders at its designed 10px
const DEFAULT_EMPTY = 'Not enough variation to chart';
const EMPTY_STYLE = 'padding:24px 8px;text-align:center;font:11px ui-monospace,monospace;color:#64748B';

/** Inline styles that drop the engine figure's own card chrome and center it in the host. */
const embedStyle = maxWidth => ({
  margin: '0px auto',
  padding: '0px',
  border: '0px',
  background: 'transparent',
  maxWidth,
});

/**
 * Render (or re-render) a dashboard chart into `el`.
 * @param {Element} el host element; its contents are replaced
 * @param {unknown} payload any payload the engine accepts (Google rows, Chart.js config, …)
 * @param {{ theme?: 'dark'|'light', maxWidth?: string, empty?: string }} [options]
 * @returns {boolean} true when a chart was drawn, false when the empty state is shown
 */
export function mountDashboardChart(el, payload, { theme = 'dark', maxWidth = DEFAULT_MAX_WIDTH, empty = DEFAULT_EMPTY } = {}) {
  const result = mountChart(el, payload, { theme });
  if (!result.ok) {
    // Expected for empty/uniform live data; the reason helps when a panel looks wrong.
    console.debug(`[dashboard-chart] ${el.id || 'chart'} not drawn: ${result.error}`);
    el.innerHTML = `<div class="bp-chart-empty" style="${EMPTY_STYLE}">${escapeHtml(empty)}</div>`;
    return false;
  }
  const figure = el.querySelector('figure.bp-chart');
  if (figure) Object.assign(figure.style, embedStyle(maxWidth));
  return true;
}
