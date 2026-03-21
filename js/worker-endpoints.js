// Centralized worker endpoint config for all server-side API calls.
// Keeps provider keys off the client and supports safe fallback routes.

const LEGACY_GITHUB_PUSH_WORKER = "https://github-push.abhishek-dutta1996.workers.dev";
const NON_AI_WORKERS = [LEGACY_GITHUB_PUSH_WORKER];

const configuredBases = [
  window.__AI_API_BASE__,
  localStorage.getItem("bp_ai_api_base"),
  window.__AI_WORKER_URL,
  localStorage.getItem("bp_ai_worker_url"),
].filter(Boolean);

function normalizeBase(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function unique(values) {
  return [...new Set(values.map(normalizeBase).filter(Boolean))];
}

export function workerCandidates(path = "") {
  const p = String(path || "").replace(/^\/+/, "");
  const configured = unique(configuredBases);
  const isAiPath = /^api\/(ai|generate-image|validate-url)/.test(p);
  const baseCandidates = [];

  if (isAiPath) {
    // For AI routes, only use explicit AI API bases.
    // Do not route to deploy-only workers or static-site origins by default.
    const aiConfigured = configured.filter((base) =>
      !NON_AI_WORKERS.includes(base)
    );

    // Optional override if the site later exposes a same-origin AI endpoint.
    if (window.__AI_USE_SAME_ORIGIN__ === true) {
      baseCandidates.push(window.location.origin);
      if (window.location.origin !== "https://blogspro.in") {
        baseCandidates.push("https://blogspro.in");
      }
    }

    baseCandidates.push(...aiConfigured);
    return unique(baseCandidates);
  }

  // Non-AI routes can still use configured bases.
  baseCandidates.push(...configured);

  // Keep legacy deploy worker as the final fallback only.
  baseCandidates.push(LEGACY_GITHUB_PUSH_WORKER);

  return unique(baseCandidates);
}

export function workerUrl(path = "", base = null) {
  const p = String(path || "").replace(/^\/+/, "");
  const resolvedBase = normalizeBase(base || workerCandidates(path)[0]);
  return `${resolvedBase}/${p}`;
}

export async function workerFetch(path, init = {}) {
  const candidates = workerCandidates(path);
  const p = String(path || "").replace(/^\/+/, "");
  const isAiPath = /^api\/(ai|generate-image|validate-url)/.test(p);

  if (candidates.length === 0 && isAiPath) {
    throw new Error("AI worker endpoint not configured");
  }

  let lastResponse = null;
  let lastError = null;

  for (const base of candidates) {
    try {
      const res = await fetch(workerUrl(path, base), init);
      if (res.ok) return res;

      // Retry on endpoint mismatch and transient server errors.
      if ([400, 404, 405, 429, 500, 502, 503, 504].includes(res.status)) {
        lastResponse = res;
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error("Worker request failed");
}
