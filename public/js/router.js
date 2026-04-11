// ═══════════════════════════════════════════════
// router.js — AI provider routing via Worker
// API keys are handled server-side in the Worker.
// ═══════════════════════════════════════════════
import { workerFetch } from "./worker-endpoints.js";
import { AI_KEYS } from "./config.js";

const OPENAI_COMPAT = {
  groq:       { url: "https://api.groq.com/openai/v1/chat/completions", model: "moonshotai/kimi-k2-instruct" },
  openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", model: "qwen/qwen3-235b-a22b" },
  together:   { url: "https://api.together.xyz/v1/chat/completions", model: "deepseek-ai/DeepSeek-V3" },
  deepinfra:  { url: "https://api.deepinfra.com/v1/openai/chat/completions", model: "meta-llama/Llama-3.3-70B-Instruct" },
};

async function callGeminiDirect(prompt) {
  const key = String(AI_KEYS?.gemini || "").trim();
  if (!key) throw new Error("gemini key not configured");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`gemini direct failed (${res.status}): ${err.substring(0, 140)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || "").join("").trim() || "";
  if (!text) throw new Error("gemini returned empty response");
  return text;
}

async function callOpenAiCompatDirect(provider, prompt) {
  const cfg = OPENAI_COMPAT[provider];
  if (!cfg) throw new Error(`${provider} direct mode not supported`);
  const key = String(AI_KEYS?.[provider] || "").trim();
  if (!key) throw new Error(`${provider} key not configured`);

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
      temperature: 0.7,
      max_tokens: 4096,
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
  return callGeminiDirect(prompt);
}

export async function callProvider(provider, prompt, type = "text") {
  try {
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
  } catch (err) {
    const m = String(err?.message || "").toLowerCase();
    if (
      m.includes("endpoint not configured") ||
      m.includes("(400)") ||
      m.includes("(404)") ||
      m.includes("(405)")
    ) {
      return await callProviderDirect(provider, prompt);
    }
    throw err;
  }
}
