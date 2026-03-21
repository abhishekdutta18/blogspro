// ═══════════════════════════════════════════════
// router.js — AI provider routing via Worker
// API keys are handled server-side in the Worker.
// ═══════════════════════════════════════════════
import { workerFetch } from "../worker-endpoints.js";

export async function callProvider(provider, prompt, type = "text") {
  const res = await workerFetch("api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, provider, type })
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`${provider} failed (${res.status}): ${err.substring(0, 140)}`);
  }

  const data = await res.json();
  const text =
    data?.text ??
    data?.result ??
    data?.content ??
    data?.choices?.[0]?.message?.content ??
    "";
  if (!text) throw new Error(`${provider} returned empty response`);
  return text;
}
