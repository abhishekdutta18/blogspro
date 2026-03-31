/**
 * BlogsPro Institutional Swarm: Sentry-Observability Bridge (V1.0)
 * ==============================================================
 * Unified tracing and error tracking for 16-vertical research swarm.
 * 
 * Target: 100% Error Visibility | 10% Tracing Sample Rate
 */

import { Toucan } from 'toucan-js';
import * as SentryNode from '@sentry/node';

/**
 * Initialize Sentry for a Cloudflare Worker environment.
 * @param {Request} request 
 * @param {object} env 
 * @param {object} ctx 
 * @returns {Toucan}
 */
export function initWorkerSentry(request, env, ctx) {
    if (!env.SENTRY_DSN) return null;
    
    return new Toucan({
        dsn: env.SENTRY_DSN,
        request,
        context: ctx,
        environment: env.ENVIRONMENT || 'production',
        sampleRate: 0.1, // 10% sampling for high-frequency pulse
        requestDataOptions: {
            allowedHeaders: ['user-agent', 'cf-ray'],
            allowedSearchParams: true
        }
    });
}

/**
 * Initialize Sentry for a Node.js performance environment (High-Compute Tome).
 * @param {string} dsn 
 * @param {string} frequency 
 */
export function initNodeSentry(dsn, frequency = 'weekly') {
    if (!dsn) return;

    SentryNode.init({
        dsn: dsn,
        tracesSampleRate: 0.1, // 10% tracing for 360-minute runs
        environment: process.env.NODE_ENV || 'production',
        initialScope: {
            tags: { frequency, swarm_version: '5.0' }
        }
    });

    console.log(`🛡️ [Sentry] Node Observability Active [Swarm 5.0 | Freq: ${frequency}]`);
}

/**
 * Log a specialized Blackboard Memo to Sentry for institutional auditing.
 * @param {string} fromVertical 
 * @param {string} memo 
 * @param {object} context 
 */
export function logBlackboardMemo(fromVertical, memo, context = {}, sentryInstance = null) {
    const message = `📌 [Blackboard] Memo from ${fromVertical.toUpperCase()}`;
    const data = { memo, ...context };
    
    logSwarmBreadcrumb(message, data, sentryInstance);
    
    // Also record a message for high-visibility auditing
    if (sentryInstance && typeof sentryInstance.captureMessage === 'function') {
        sentryInstance.captureMessage(message, { level: 'info', extra: data });
    } else {
        SentryNode.captureMessage(message, { level: 'info', extra: data });
    }
}

/**
 * Capture a global strategist exception with hierarchical tags.
 * @param {Error} error 
 * @param {object} tags 
 * @param {Toucan|object} sentryInstance 
 */
export function captureSwarmError(error, tags = {}, sentryInstance = null) {
    if (sentryInstance && typeof sentryInstance.captureException === 'function') {
        sentryInstance.captureException(error, { tags });
    } else {
        SentryNode.captureException(error, { tags });
    }
}

/**
 * Log a research breadcrumb for deep-research synthesis.
 * @param {string} message 
 * @param {object} data 
 * @param {Toucan|object} sentryInstance 
 */
export function logSwarmBreadcrumb(message, data = {}, sentryInstance = null) {
    const breadcrumb = {
        category: 'research_swarm',
        message: message,
        data: data,
        level: 'info'
    };

    if (sentryInstance && typeof sentryInstance.addBreadcrumb === 'function') {
        sentryInstance.addBreadcrumb(breadcrumb);
    } else {
        SentryNode.addBreadcrumb(breadcrumb);
    }
}
