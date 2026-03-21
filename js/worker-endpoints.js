// Centralized worker endpoint config for all server-side API calls.
// Keeps provider keys off the client.

export const AI_WORKER_URL =
  window.__AI_WORKER_URL ||
  localStorage.getItem("bp_ai_worker_url") ||
  "https://github-push.abhishek-dutta1996.workers.dev";

export function workerUrl(path = "") {
  const base = String(AI_WORKER_URL).replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  return `${base}/${p}`;
}

export async function workerFetch(path, init = {}) {
  const res = await fetch(workerUrl(path), init);
  return res;
}

