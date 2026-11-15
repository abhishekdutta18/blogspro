// miro-terminal-charts.js — Server-side charts for the MiroSync swarm terminal (/terminal).
// The terminal page is served by a Durable Object, not GitHub Pages, so it cannot import the
// browser chart helper. Instead the worker renders the four panels to SVG/HTML strings with the
// shared chart engine and the page swaps them in on each poll. Pure: no DOM, no I/O.
import { renderChart } from '../../js/chart-engine/index.js';
import { escapeHtml } from '../../js/chart-engine/format.js';
import { DARK_THEME } from '../../js/chart-engine/theme.js';

const THEME = 'dark';
const EMPTY_STYLE = 'padding:24px 8px;text-align:center;font:11px ui-monospace,monospace;color:#64748B';
// Google Gauge bands the terminal used: red 0–20, yellow 20–50, green 50–100.
const OASIS_BANDS = Object.freeze({ redFrom: 0, redTo: 20, yellowFrom: 20, yellowTo: 50, greenFrom: 50, greenTo: 100 });

/**
 * @typedef {{ trace?: { stepId: string, duration?: number }[],
 *   disagreementHeatmap?: { p1: string, p2: string, variance: number }[],
 *   consensusTimeline?: { step: number|string, alignment: number }[],
 *   swarmSentiment?: number, ghostProjection?: { telemetry?: { swarmSentiment?: number } } }} SwarmJob
 * @typedef {{ latency: string|null, heatmap: string|null, timeline: string|null, oasis: string }} TerminalCharts
 */

/** Render one panel; a payload the engine rejects becomes a short message instead of an error. */
function panel(id, payload, empty) {
  try {
    return renderChart(payload, { theme: THEME, idSuffix: id });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`📊 [MiroTerminal] ${id} not drawn: ${reason}`);
    return `<div class="bp-chart-empty" style="${EMPTY_STYLE}">${escapeHtml(empty)}</div>`;
  }
}

function latencyChart(trace) {
  const rows = (trace ?? []).filter(t => t.duration).map(t => [String(t.stepId).split('_').pop(), t.duration]);
  if (rows.length === 0) return null;
  return panel('latency', { type: 'area', legend: { position: 'none' }, data: [['Stage', 'ms'], ...rows] }, 'No stage timings to chart');
}

/**
 * Disagreement heatmap as a record table: one row per persona pair, like the Google Table it
 * replaces. Not the engine's `table` type, which is a comparison grid (series as rows, capped
 * at 6) and would silently drop pairs beyond the sixth.
 */
function heatmapTable(heatmap) {
  if (!heatmap) return null;
  const t = DARK_THEME;
  const cell = `padding:6px 10px;border-bottom:1px solid ${t.border};font:11px ${t.fontFamily}`;
  const head = ['P_Alpha', 'P_Beta', 'Delta']
    .map(h => `<th style="${cell};text-align:left;color:${t.accent}">${escapeHtml(h)}</th>`).join('');
  const rows = heatmap.map(h =>
    `<tr><td style="${cell};color:${t.textPrimary}">${escapeHtml(h.p1)}</td>` +
    `<td style="${cell};color:${t.textPrimary}">${escapeHtml(h.p2)}</td>` +
    `<td style="${cell};color:${t.textSecondary};text-align:right">${escapeHtml(h.variance)}</td></tr>`).join('');
  return `<div style="overflow:auto;max-height:250px"><table class="bp-table" style="width:100%;border-collapse:collapse"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function timelineChart(timeline) {
  if (!timeline) return null;
  const rows = timeline.map(t => [String(t.step), t.alignment]);
  return panel('timeline', { type: 'line', legend: { position: 'none' }, data: [['Step', 'Alignment'], ...rows] }, 'No alignment data');
}

function oasisGauges(job) {
  const ghost = job.ghostProjection?.telemetry?.swarmSentiment || 0;
  const live = job.swarmSentiment || 0;
  return panel('oasis', { type: 'gauge', ...OASIS_BANDS, data: [['Label', 'Value'], ['Ghost', ghost], ['Live', live]] }, 'No sentiment data');
}

/**
 * Render the terminal's four chart panels for one swarm job.
 * Sections whose source data is absent are `null`, so the page keeps what it last drew there.
 * @param {SwarmJob} job
 * @returns {TerminalCharts}
 */
export function renderTerminalCharts(job = {}) {
  return {
    latency: latencyChart(job.trace),
    heatmap: heatmapTable(job.disagreementHeatmap),
    timeline: timelineChart(job.consensusTimeline),
    oasis: oasisGauges(job),
  };
}
