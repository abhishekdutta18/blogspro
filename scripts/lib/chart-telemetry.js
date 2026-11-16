/**
 * chart-telemetry.js — Records charts the engine refused to render at page-build time.
 *
 * Breadcrumbs, not captured events: the Sentry → GitHub webhook files one issue per event,
 * and a single malformed chart is a content-quality signal, not an incident. The validator's
 * CHART_REJECTED rule is what drives the model to fix charts before they reach a template.
 */
import { logSwarmBreadcrumb } from './sentry-bridge.js';

/**
 * @param {{ index: number, error: string }[]} failures from extractChartBlocks()
 * @param {{ target?: string }} [context] render target, for filtering in Sentry
 * @returns {void}
 */
export function reportChartFailures(failures, context = {}) {
  failures.forEach(({ index, error }) => {
    console.warn(`📊 [ChartEngine] chart #${index + 1} dropped: ${error}`);
    // Fire-and-forget: telemetry must never block or fail a page build.
    logSwarmBreadcrumb('chart_dropped', { chart: index + 1, error, ...context }).catch(() => {});
  });
}
