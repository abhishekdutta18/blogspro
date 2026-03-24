// ═══════════════════════════════════════════════
// router.js — AI provider routing
// Updated March 2026 with latest models
// ═══════════════════════════════════════════════
import { AI_KEYS } from "../remote-config.js";
import { fetchWithTimeout } from "../config.js";

export async function callProvider(provider, prompt, type = "text") {

  if (provider === "cloudflare")   return callCloudflare(prompt);
  if (provider === "gemini")       return callGemini(prompt);
  if (provider === "pollinations") return callPollinations(prompt);

  const URLS = {
    groq:       "https://api.groq.com/openai/v1/chat/completions",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    together:   "https://api.together.xyz/v1/chat/completions",
    deepinfra:  "https://api.deepinfra.com/v1/openai/chat/completions",
    mistral:    "https://api.mistral.ai/v1/chat/completions",
    deepseek:   "https://api.deepseek.com/chat/completions",
    huggingface:"https://api-inference.huggingface.co/models/",
  };

  // Latest models as of March 2026
  const TEXT_MODELS = {
    groq:       "moonshotai/kimi-k2-instruct",     // Kimi K2 1T MoE — best
    openrouter: "qwen/qwen3-235b-a22b",             // Qwen3 235B
    together:   "deepseek-ai/DeepSeek-V3",          // DeepSeek V3
    deepinfra:  "meta-llama/Llama-3.3-70B-Instruct",
    mistral:    "mistral-large-latest",
    deepseek:   "deepseek-chat",
  };

  const CODE_MODELS = {
    groq:       "moonshotai/kimi-k2-instruct",
    openrouter: "qwen/qwen2.5-coder-32b-instruct",
    together:   "deepseek-ai/deepseek-coder-v2-instruct",
    deepinfra:  "meta-llama/CodeLlama-70b-Instruct-hf",
    mistral:    "codestral-latest",
    deepseek:   "deepseek-coder",
  };

  const MODELS = type === "code" ? CODE_MODELS : TEXT_MODELS;

  const url   = URLS[provider];
  const key   = AI_KEYS[provider];
  const model = MODELS[provider];

  if (!url)   throw new Error("Unknown provider: " + provider);
  if (!key)   throw new Error("No API key for: " + provider);
  if (!model) throw new Error("No model for: " + provider);

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + key,
      "Content-Type":  "application/json",
      // OpenRouter requires these headers
      ...(provider === "openrouter" ? {
        "HTTP-Referer": "https://blogspro.in",
        "X-Title": "BlogsPro"
      } : {})
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 8000,
    })
  }, 30000);

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    // Log full error to console, show user-friendly message
    console.error(`${provider} API error (${res.status}):`, err);
    throw new Error(`${provider} failed: please try again`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}


// ── Gemini 2.0 Flash ──────────────────────────
async function callGemini(prompt) {
  const key = AI_KEYS.gemini;
  if (!key) throw new Error("No Gemini key");
  const res = await fetchWithTimeout(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 8000,
      })
    },
    30000
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error('Gemini API error:', err);
    throw new Error(`gemini failed: please try again`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}


// ── Cloudflare Workers AI ─────────────────────
async function callCloudflare(prompt) {
  const res = await fetchWithTimeout("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  }, 30000);
  if (!res.ok) throw new Error("cloudflare failed: please try again");
  const data = await res.json();
  return data.result;
}


// ── Pollinations (free image text-to-img) ─────
async function callPollinations(prompt) {
  // Text completion via pollinations
  const res = await fetchWithTimeout("https://text.pollinations.ai/" + encodeURIComponent(prompt), {}, 30000);
  if (!res.ok) throw new Error("pollinations failed: please try again");
  return await res.text();
}
