/**
 * BlogsPro Institutional Swarm: Sentry-Observability Bridge (V1.0)
 * ==============================================================
 * Unified tracing and error tracking for 16-vertical research swarm.
 * 
 * Target: 100% Error Visibility | 10% Tracing Sample Rate
 */

import { Toucan } from 'toucan-js';

// Lazy-load SentryNode only in Node.js environments to prevent Worker bundling failures
let SentryNode = null;
const isNode = typeof process !== 'undefined' && process.release?.name === 'node' && !!process.versions?.node;

async function getSentryNode() {
    if (!isNode) return null;
    if (SentryNode) return SentryNode;
    try {
        const mod = await import('@sentry/node');
        // Sentry V7/V8 exports are often on the namespace directly
        SentryNode = mod.default || mod;
        return SentryNode;
    } catch (e) {
        console.warn("⚠️ [Sentry] Could not load @sentry/node in Node environment.");
        return null;
    }
}

/**
 * Initialize Sentry for a Cloudflare Worker environment.
 */
export function initWorkerSentry(request, env, ctx) {
    if (!env || !env.SENTRY_DSN) return null;
    
    // V5.1: Null-Request Safety for CRON/Service Triggers
    const syntheticRequest = request || {
        url: `https://${env.PROJECT_DOMAIN || 'blogspro-pulse'}/scheduled-dispatch`,
        method: 'SCHEDULED',
        headers: new Headers({ 'user-agent': 'BlogsPro-CRON-Orchestrator' })
    };

    return new Toucan({
        dsn: env.SENTRY_DSN,
        request: syntheticRequest,
        context: ctx,
        environment: env.ENVIRONMENT || 'production',
        sampleRate: 1.0, // Hardened: 100% for initial scale
        requestDataOptions: {
            allowedHeaders: ['user-agent', 'cf-ray', 'x-vault-auth'],
            allowedSearchParams: true
        }
    });
}

/**
 * Initialize Sentry for a Node.js performance environment (High-Compute Tome).
 */
export async function initNodeSentry(dsn, frequency = 'weekly') {
    // V10.6 Hardening: Fallback to local logging if DSN is missing
    if (!isNode) return;
    
    const TARGET_ENVIRONMENT = process.env.NODE_ENV || 'institutional-swarm';
    
    if (!dsn) {
        console.warn(`🛡️ [Sentry] DSN Missing. Telemetry active in LOCAL-ONLY mode [Env: ${TARGET_ENVIRONMENT}]`);
        return;
    }

    try {
        const Sentry = await getSentryNode();
        if (!Sentry) return;

        Sentry.init({
            dsn: dsn,
            tracesSampleRate: 1.0, 
            environment: TARGET_ENVIRONMENT,
            initialScope: {
                tags: { frequency, swarm_version: '5.4.2' }
            }
        });
        console.log(`🛡️ [Sentry] Node Observability Active [Env: ${TARGET_ENVIRONMENT} | Freq: ${frequency}]`);
    } catch (e) {
        console.warn(`⚠️ [Sentry] Node Initialization Failed:`, e.message);
    }
}

/**
 * Flush Sentry events to ensure telemetry is sent before process exit.
 */
export async function flushSentry() {
    if (!isNode || !SentryNode) return;
    try {
        await SentryNode.flush(2000);
        console.log(`📡 [Sentry] Events flushed successfully.`);
    } catch (e) {
        console.warn(`⚠️ [Sentry] Flush failed:`, e.message);
    }
}

/**
 * Capture a global strategist exception with hierarchical tags.
 */
export async function captureSwarmError(error, context = {}, sentryInstance = null) {
    const { vertical, role, prompt_snapshot, ...otherTags } = context;
    const tags = { vertical, role, ...otherTags };
    const extra = { prompt_snapshot };

    if (error && error.message && error.message.includes("AI_FLEET_EXHAUSTED")) {
        const msg = `⚠️ Transient AI Exhaustion: ${error.message}`;
        if (sentryInstance && typeof sentryInstance.captureMessage === 'function') {
            sentryInstance.captureMessage(msg, { level: 'warning', tags, extra });
        } else if (isNode) {
            const Sentry = await getSentryNode();
            if (Sentry) Sentry.captureMessage(msg, { level: 'warning', tags, extra });
        } else {
            console.warn(msg);
        }
        return;
    }

    if (sentryInstance && typeof sentryInstance.captureException === 'function') {
        sentryInstance.captureException(error, { tags, extra });
    } else if (isNode) {
        const Sentry = await getSentryNode();
        if (Sentry) Sentry.captureException(error, { tags, extra });
    } else {
        console.error("❌ [Swarm Error]", error, tags);
    }
}

/**
 * Log a high-level observational sentiment for the entire swarm run.
 */
export async function logSwarmPulse(status, summary, metadata = {}, sentryInstance = null) {
    const message = `📡 [Swarm Pulse] ${status.toUpperCase()}: ${summary}`;

    if (status !== 'error') {
        console.log(message);
        return logSwarmBreadcrumb(message, { status, ...metadata }, sentryInstance);
    }

    const options = {
        level: 'error',
        tags: { swarm_event: 'pulse_heartbeat', status, ...metadata },
        fingerprint: ['swarm-pulse-heartbeat']
    };

    if (sentryInstance && typeof sentryInstance.captureMessage === 'function') {
        sentryInstance.captureMessage(message, options);
    } else if (isNode) {
        const Sentry = await getSentryNode();
        if (Sentry) Sentry.captureMessage(message, options);
    }
    console.log(message);
}

/**
 * Log a research breadcrumb for deep-research synthesis.
 */
export async function logSwarmBreadcrumb(message, data = {}, sentryInstance = null) {
    const breadcrumb = {
        category: 'research_swarm',
        message: message,
        data: data,
        level: 'info'
    };

    if (sentryInstance && typeof sentryInstance.addBreadcrumb === 'function') {
        sentryInstance.addBreadcrumb(breadcrumb);
    } else if (isNode) {
        const Sentry = await getSentryNode();
        if (Sentry) Sentry.addBreadcrumb(breadcrumb);
    }
}

export async function logBlackboardMemo(fromVertical, memo, context = {}, sentryInstance = null) {
    const message = `📌 [Blackboard] Memo from ${fromVertical.toUpperCase()}`;
    const data = { memo, ...context };
    
    await logSwarmBreadcrumb(message, data, sentryInstance);
    
    if (sentryInstance && typeof sentryInstance.captureMessage === 'function') {
        sentryInstance.captureMessage(message, { level: 'info', extra: data });
    } else if (isNode && SentryNode) {
        SentryNode.captureMessage(message, { level: 'info', extra: data });
    }
}
