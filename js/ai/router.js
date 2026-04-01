// ═══════════════════════════════════════════════
// router.js — AI provider routing via Worker
// API keys are handled server-side in the Worker.
// ═══════════════════════════════════════════════
import { workerFetch } from "../worker-endpoints.js";
import { AI_KEYS } from "../config.js";

const OPENAI_COMPAT = {
  groq:       { url: "https://api.groq.com/openai/v1/chat/completions",      model: "moonshotai/kimi-k2-instruct" },
  openrouter: { url: "https://openrouter.ai/api/v1/chat/completions",        model: "qwen/qwen3-235b-a22b" },
  together:   { url: "https://api.together.xyz/v1/chat/completions",         model: "deepseek-ai/DeepSeek-V3" },
  deepinfra:  { url: "https://api.deepinfra.com/v1/openai/chat/completions", model: "meta-llama/Llama-3.3-70B-Instruct" },
  cerebras:   { url: "https://api.cerebras.ai/v1/chat/completions",          model: "cerebras/llama3.1-70b" },
  sambanova:  { url: "https://api.sambanova.ai/v1/chat/completions",         model: "Meta-Llama-3.3-70B-Instruct" },
};

const KEY_REQUIRED = new Set(Object.keys(OPENAI_COMPAT).concat(["gemini", "mistral"]));

async function callGeminiDirect(prompt) {
  const key = String(AI_KEYS?.gemini || "").trim();
  if (!key) throw new Error("endpoint not configured");

  // Use free/public Gemini endpoints first to avoid paid usage
  const variants = [
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash",
    "gemini-1.5-pro-latest",
  ];
  let lastErr = null;
  for (const model of variants) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.6, maxOutputTokens: 4096 },
          }),
        }
      );
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        lastErr = new Error(`${model} direct failed (${res.status}): ${err.substring(0, 140)}`);
        if (res.status === 404) continue;
        throw lastErr;
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || "").join("").trim() || "";
      if (!text) throw new Error("gemini returned empty response");
      return text;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  throw lastErr || new Error("gemini direct failed");
}

async function callOpenAiCompatDirect(provider, prompt) {
  const cfg = OPENAI_COMPAT[provider];
  if (!cfg) throw new Error(`${provider} direct mode not supported`);
  const key = String(AI_KEYS?.[provider] || "").trim();
  if (!key) throw new Error("endpoint not configured");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };

  if (provider === "openrouter") {
    headers["HTTP-Referer"] = window.location.origin;
    headers["X-Title"] = "BlogsPro";
  }

  const res = await fetch(cfg.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`${provider} direct failed (${res.status}): ${err.substring(0, 140)}`);
  }

  const data = await res.json();
  const text =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    data?.text ??
    data?.result ??
    "";
  if (!text) throw new Error(`${provider} returned empty response`);
  return text;
}

async function callProviderDirect(provider, prompt) {
  if (provider === "gemini") return callGeminiDirect(prompt);
  if (OPENAI_COMPAT[provider]) return callOpenAiCompatDirect(provider, prompt);
  // Providers without direct mappings fall back to Gemini if available.
  return callGeminiDirect(prompt);
}

export async function callProvider(provider, prompt, type = "text") {
  const key = String(AI_KEYS?.[provider] || "").trim();
  const hasKey = KEY_REQUIRED.has(provider) && key;

  const directFirst = async () => {
    if (!hasKey) throw new Error("skip-direct");
    return await callProviderDirect(provider, prompt);
  };

  const viaWorker = async () => {
    const res = await workerFetch("api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, provider, type })
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      if ([400, 401, 403, 404, 405].includes(res.status) || err.toLowerCase().includes("unauthorized")) {
        throw new Error("endpoint not configured");
      }
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
  };

  try {
    // Prefer direct when we have a key; fall back to worker if direct fails.
    if (hasKey) {
      try { return await directFirst(); } catch (e) {
        if (String(e.message).includes("endpoint not configured")) {
          // try worker next
        } else {
          try { return await viaWorker(); } catch (_) {}
          throw e;
        }
      }
    }
    return await viaWorker();
  } catch (err) {
    const m = String(err?.message || "").toLowerCase();
    if (
      m.includes("endpoint not configured") ||
      m.includes("(400)") ||
      m.includes("(404)") ||
      m.includes("(405)") ||
      m.includes("unauthorized") ||
      m.includes("forbidden")
    ) {
      // If we skipped direct earlier, try it now as a last resort.
      if (KEY_REQUIRED.has(provider)) {
        return await callProviderDirect(provider, prompt);
      }
      throw err;
    }
    throw err;
  }
}
