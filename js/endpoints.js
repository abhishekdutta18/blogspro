// BlogsPro — Centralised Endpoint Configuration
// ─────────────────────────────────────────────────────────────────────────────
// All backend service URLs are defined here.
// To migrate from Cloudflare Workers to GCP Cloud Run, update the GCP_* values
// below and set USE_GCP = true.  The rest of the codebase reads from this file.
// ─────────────────────────────────────────────────────────────────────────────

// ── Feature flag ─────────────────────────────────────────────────────────────
// Set to true once GCP Cloud Run services are deployed and URLs are filled in.
const USE_GCP = false;

// Set to true to route all API calls to the alternative unified Express server.
const USE_ALTERNATIVE = false;
const ALTERNATIVE_BASE = 'http://localhost:8081';

// ── Cloudflare Worker endpoints (current, live) ──────────────────────────────
const CF_ENDPOINTS = {
  pulse:  'https://blogspro-pulse.abhishek-dutta1996.workers.dev',
  upstox: 'https://blogspro-upstox.abhishek-dutta1996.workers.dev',
  upstoxStable: 'https://blogspro-upstox-stable.abhishek-dutta1996.workers.dev',
  auth:   'https://blogspro-auth.abhishek-dutta1996.workers.dev',
  newsletter: 'https://blogspro-sentry-webhook.abhishek-dutta1996.workers.dev',
  ai:         'https://blogspro-pulse.abhishek-dutta1996.workers.dev',
};

// ── GCP Cloud Run endpoints (fill in once services are deployed) ──────────────
// Format: https://<service-name>-<hash>-<region>.a.run.app
const GCP_ENDPOINTS = {
  pulse:        '', // e.g. https://blogspro-pulse-xxxx-uc.a.run.app
  upstox:       '', // e.g. https://blogspro-upstox-xxxx-uc.a.run.app
  upstoxStable: '', // e.g. https://blogspro-upstox-stable-xxxx-uc.a.run.app
  auth:         '', // e.g. https://blogspro-auth-xxxx-uc.a.run.app
  newsletter:   '', // e.g. https://blogspro-newsletter-xxxx-uc.a.run.app
  ai:           '', // e.g. https://blogspro-ai-xxxx-uc.a.run.app
};

// ── Alternative/Local unified Express endpoints ──────────────────────────────
const ALTERNATIVE_ENDPOINTS = {
  pulse:        `${ALTERNATIVE_BASE}/pulse`,
  upstox:       `${ALTERNATIVE_BASE}/upstox`,
  upstoxStable: `${ALTERNATIVE_BASE}/upstox`,
  auth:         `${ALTERNATIVE_BASE}/auth`,
  newsletter:   `${ALTERNATIVE_BASE}/newsletter`,
  ai:           `${ALTERNATIVE_BASE}/ai`,
};

// ── Active endpoints (reads from alternative or GCP if flag is set) ───────────
function resolve(key) {
  if (USE_ALTERNATIVE) return ALTERNATIVE_ENDPOINTS[key].replace(/\/+$/, '');
  if (USE_GCP && GCP_ENDPOINTS[key]) return GCP_ENDPOINTS[key].replace(/\/+$/, '');
  return CF_ENDPOINTS[key].replace(/\/+$/, '');
}

export const ENDPOINTS = {
  pulse:        resolve('pulse'),
  upstox:       resolve('upstox'),
  upstoxStable: resolve('upstoxStable'),
  auth:         resolve('auth'),
  newsletter:   resolve('newsletter'),
  ai:           resolve('ai'),
};
