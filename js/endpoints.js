// BlogsPro — Centralised Endpoint Configuration
// ─────────────────────────────────────────────────────────────────────────────
// All backend service URLs are defined here.
// To migrate from Cloudflare Workers to GCP Cloud Run, update the GCP_* values
// below and set USE_GCP = true.  The rest of the codebase reads from this file.
// ─────────────────────────────────────────────────────────────────────────────

// ── Feature flag ─────────────────────────────────────────────────────────────
// Set to true once GCP Cloud Run services are deployed and URLs are filled in.
const USE_GCP = false;

// ── Cloudflare Worker endpoints (current, live) ──────────────────────────────
const CF_ENDPOINTS = {
  pulse:  'https://blogspro-pulse.abhishek-dutta1996.workers.dev',
  upstox: 'https://blogspro-upstox.abhishek-dutta1996.workers.dev',
  upstoxStable: 'https://blogspro-upstox-stable.abhishek-dutta1996.workers.dev',
  auth:   'https://blogspro-auth.abhishek-dutta1996.workers.dev',
  newsletter: 'https://blogspro-sentry-webhook.abhishek-dutta1996.workers.dev',
};

// ── GCP Cloud Run endpoints (fill in once services are deployed) ──────────────
// Format: https://<service-name>-<hash>-<region>.a.run.app
const GCP_ENDPOINTS = {
  pulse:        '', // e.g. https://blogspro-pulse-xxxx-uc.a.run.app
  upstox:       '', // e.g. https://blogspro-upstox-xxxx-uc.a.run.app
  upstoxStable: '', // e.g. https://blogspro-upstox-stable-xxxx-uc.a.run.app
  auth:         '', // e.g. https://blogspro-auth-xxxx-uc.a.run.app
  newsletter:   '', // e.g. https://blogspro-newsletter-xxxx-uc.a.run.app
};

// ── Active endpoints (reads from GCP if flag is set and URL is populated) ─────
function resolve(key) {
  if (USE_GCP && GCP_ENDPOINTS[key]) return GCP_ENDPOINTS[key].replace(/\/+$/, '');
  return CF_ENDPOINTS[key].replace(/\/+$/, '');
}

export const ENDPOINTS = {
  pulse:        resolve('pulse'),
  upstox:       resolve('upstox'),
  upstoxStable: resolve('upstoxStable'),
  auth:         resolve('auth'),
  newsletter:   resolve('newsletter'),
};
