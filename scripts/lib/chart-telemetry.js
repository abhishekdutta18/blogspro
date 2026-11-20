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

/**
 * Charts the engine drew in a simpler form because a renderer failed on valid input (wide-only
 * SVG, or the data table). This is an engine defect, not a model mistake, so it is logged as an
 * error for the build log. It stays a breadcrumb in Sentry for the same reason failures do: one
 * event per chart per page would file one GitHub issue each.
 * @param {{ index: number, stage: string, error: string }[]} degraded from extractChartBlocks()
 * @param {{ target?: string }} [context]
 * @returns {void}
 */
export function reportChartDegradations(degraded, context = {}) {
  degraded.forEach(({ index, stage, error }) => {
    console.error(`📊 [ChartEngine] engine defect: chart #${index + 1} ${stage} layout failed (${error}); shown in a simpler form`);
    logSwarmBreadcrumb('chart_degraded', { chart: index + 1, stage, error, ...context }).catch(() => {});
  });
}
