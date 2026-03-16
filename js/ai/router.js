import { AI_KEYS } from "../config.js";

export async function callProvider(provider, prompt, type = "text") {

  // Cloudflare — uses internal Workers AI endpoint
  if (provider === "cloudflare") {
    return callCloudflare(prompt);
  }

  // Gemini — uses Google's OpenAI-compatible endpoint with its own auth header
  if (provider === "gemini") {
    return callGemini(prompt);
  }

  const URLS = {
    groq:       "https://api.groq.com/openai/v1/chat/completions",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    together:   "https://api.together.xyz/v1/chat/completions",
    deepinfra:  "https://api.deepinfra.com/v1/openai/chat/completions",
    mistral:    "https://api.mistral.ai/v1/chat/completions",
    deepseek:   "https://api.deepseek.com/chat/completions"
  };

  const MODELS = {
    groq:       "llama-3.3-70b-versatile",
    openrouter: "meta-llama/llama-3-8b-instruct",
    together:   "mistralai/Mixtral-8x7B-Instruct-v0.1",
    deepinfra:  "meta-llama/Meta-Llama-3-8B-Instruct",
    mistral:    "mistral-small",
    deepseek:   "deepseek-chat"
  };

  const url   = URLS[provider];
  const key   = AI_KEYS[provider];
  const model = MODELS[provider];

  // Bug 7 fix: guard against unknown provider or missing key/url before fetch()
  if (!url)   throw new Error("Unknown provider: " + provider);
  if (!key)   throw new Error("No API key configured for: " + provider);
  if (!model) throw new Error("No model configured for: " + provider);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + key,
      "Content-Type":  "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(provider + " failed (" + res.status + "): " + errText.substring(0, 120));
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}


// Gemini via Google AI Studio OpenAI-compatible endpoint
async function callGemini(prompt) {
  const key = AI_KEYS.gemini;
  if (!key) throw new Error("No Gemini API key configured");

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type":  "application/json"
      },
      body: JSON.stringify({
        model:    "gemini-1.5-flash",
        messages: [{ role: "user", content: prompt }]
      })
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error("gemini failed (" + res.status + "): " + errText.substring(0, 120));
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}


// Cloudflare Workers AI (internal proxy endpoint)
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
