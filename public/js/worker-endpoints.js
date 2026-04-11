// Centralized worker endpoint config for all BlogsPro Institutional operations.
// Strictly favors the Durable Pulse Orchestrator (V5.4).

const PULSE_WORKER_BASE = "https://blogspro-pulse.abhishek-dutta1996.workers.dev";

function normalizeBase(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

export function workerCandidates(path = "") {
  const p = String(path || "").replace(/^\/+/, "");
  const candidates = [];

  // 1. Check for manual overrides in Local Storage
  const override = localStorage.getItem("bp_ai_worker_url") || localStorage.getItem("bp_ai_api_base");
  if (override) candidates.push(normalizeBase(override));

  // 2. Default to Institutional Pulse
  candidates.push(PULSE_WORKER_BASE);

  // 3. Fallback to origin if running on blogspro.in
  if (window.location.origin.includes("blogspro.in")) {
    candidates.push(window.location.origin);
  }

  return [...new Set(candidates)];
}

export function workerUrl(path = "", base = null) {
  const p = String(path || "").replace(/^\/+/, "");
  const resolvedBase = normalizeBase(base || workerCandidates(path)[0]);
  return `${resolvedBase}/${p}`;
}

export async function workerFetch(path, init = {}) {
  const candidates = workerCandidates(path);
  
  let lastError = null;
  for (const base of candidates) {
    try {
      const url = workerUrl(path, base);
      const res = await fetch(url, init);
      if (res.ok) return res;
      if (res.status >= 500) {
        lastError = new Error(`Worker Error (${res.status}): ${res.statusText}`);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("All worker candidates failed.");
}

// Legacy support for cached fetches (now routed through Pulse)
export async function cachedFetch(targetUrl) {
  return fetch(targetUrl); // Pulse handles internal caching/DO sync
}
