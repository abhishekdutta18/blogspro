// Centralized worker endpoint config for all BlogsPro Institutional operations.
// Strictly favors the Durable Pulse Orchestrator (V5.4).

import { ENDPOINTS } from './endpoints.js';

const PULSE_WORKER_BASE = ENDPOINTS.pulse;

function normalizeBase(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

export function workerCandidates(path = "") {
  const p = String(path || "").replace(/^\/+/, "");
  const candidates = [];

  // 1. Check for manual overrides in Local Storage (only https:// accepted, or http:// on localhost/127.0.0.1)
  const override = localStorage.getItem("bp_ai_worker_url") || localStorage.getItem("bp_ai_api_base");
  if (override) {
    const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "[::1]";
    if (/^https:\/\/.+/i.test(override) || (isLocalHost && /^http:\/\/.+/i.test(override))) {
      candidates.push(normalizeBase(override));
    }
  }

  // 2. Default to the specific endpoint based on path
  if (p === "api/ai" || p === "ai-gateway" || p === "ai/generate") {
    candidates.push(ENDPOINTS.ai);
  } else {
    candidates.push(PULSE_WORKER_BASE);
  }

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
  const TIMEOUT_MS = 12000;
  
  let lastError = null;
  for (const base of candidates) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    try {
      const url = workerUrl(path, base);
      const res = await fetch(url, {
        ...init,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (res.ok) return res;
      if (res.status >= 500) {
        lastError = new Error(`Worker Error (${res.status}): ${res.statusText}`);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      if (err.name === 'AbortError') {
        console.warn(`[workerFetch] Timeout reached for ${base}. Skipping.`);
      }
    }
  }
  throw lastError || new Error("All worker candidates failed.");
}

// Legacy support for cached fetches (now routed through Pulse)
export async function cachedFetch(targetUrl) {
  return fetch(targetUrl); // Pulse handles internal caching/DO sync
}
