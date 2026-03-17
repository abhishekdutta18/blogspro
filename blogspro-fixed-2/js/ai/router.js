// ═══════════════════════════════════════════════
// router.js — AI provider routing
// Updated March 2026 with latest models
// ═══════════════════════════════════════════════
import { AI_KEYS } from "../remote-config.js";

// ── Global per-provider rate limiter ─────────────────────────────
// Groq free tier: 30 req/min → enforce 2.2s minimum gap per provider
// This runs at router level so ALL callers (ai-writer, post-audit,
// ai-editor, etc.) share the same queue automatically.
const _queue   = {};   // provider → Promise (tail of last scheduled call)
const MIN_GAP  = 2200; // ms between calls to same provider

function _schedule(provider, fn) {
  const prev = _queue[provider] || Promise.resolve();
  const next = prev.then(() => new Promise(resolve => setTimeout(resolve, MIN_GAP))).then(fn);
  _queue[provider] = next.catch(() => {}); // don't let errors break the queue
  return next;
}

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

  // All HTTP calls go through the per-provider queue to enforce MIN_GAP
  return _schedule(provider, async () => {
    const res = await fetch(url, {
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
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`${provider} failed (${res.status}): ${err.substring(0, 120)}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content;
  });
}


// ── Gemini 2.0 Flash ──────────────────────────
async function callGemini(prompt) {
  const key = AI_KEYS.gemini;
  if (!key) throw new Error("No Gemini key");
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 8000,
      })
    }
  );
  if (!res.ok) throw new Error(`gemini failed (${res.status})`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}


// ── Cloudflare Workers AI ─────────────────────
async function callCloudflare(prompt) {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });
  if (!res.ok) throw new Error("cloudflare failed (" + res.status + ")");
  const data = await res.json();
  return data.result;
}


// ── Pollinations (free image text-to-img) ─────
async function callPollinations(prompt) {
  // Text completion via pollinations
  const res = await fetch("https://text.pollinations.ai/" + encodeURIComponent(prompt));
  if (!res.ok) throw new Error("pollinations failed (" + res.status + ")");
  return await res.text();
}
