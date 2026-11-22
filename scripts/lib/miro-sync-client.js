// miro-sync-client.js — one way for pipeline code to reach the MiroSync bridge, wherever it lives.
//
// Prefers the VPS service (env.MIRO_SYNC_URL, e.g. https://sync.blogspro.in) and falls back to the
// legacy Cloudflare Durable Object binding (env.MIRO_SYNC_DO). Cutover = set MIRO_SYNC_URL; rollback =
// unset it. See docs/miro-sync-vps-cutover.md.

const DO_NAME = 'global-swarm-bridge';
const DO_ORIGIN = 'https://sync';
const REQUEST_TIMEOUT_MS = 10000;

/** @returns {boolean} true when either the VPS URL or the legacy DO binding is configured. */
export function hasMiroSync(env) {
  return Boolean(env && (env.MIRO_SYNC_URL || (env.MIRO_SYNC_DO && typeof env.MIRO_SYNC_DO.idFromName === 'function')));
}

/**
 * Fetches a MiroSync path ("/push", "/check-step?..."). Throws when neither target is configured.
 * @param {object} env
 * @param {string} pathAndQuery must start with "/"
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
export async function miroSyncFetch(env, pathAndQuery, init = {}) {
  if (!pathAndQuery.startsWith('/')) throw new Error(`MiroSync path must start with "/": ${pathAndQuery}`);
  if (env?.MIRO_SYNC_URL) {
    const headers = new Headers(init.headers);
    if (env.MIRO_SYNC_TOKEN) headers.set('Authorization', `Bearer ${env.MIRO_SYNC_TOKEN}`);
    const base = String(env.MIRO_SYNC_URL).replace(/\/+$/, '');
    return fetch(`${base}${pathAndQuery}`, { ...init, headers, signal: init.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  }
  if (hasMiroSync(env)) {
    const stub = env.MIRO_SYNC_DO.get(env.MIRO_SYNC_DO.idFromName(DO_NAME));
    return stub.fetch(`${DO_ORIGIN}${pathAndQuery}`, init);
  }
  throw new Error('MiroSync not configured (set MIRO_SYNC_URL or bind MIRO_SYNC_DO)');
}
