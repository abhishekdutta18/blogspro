import { AI_KEYS } from "../config.js";

export async function callProvider(provider, prompt, type = "text") {

  // Cloudflare always first
  if (provider === "cloudflare") {
    return callCloudflare(prompt);
  }

  const URLS = {
    groq: "https://api.groq.com/openai/v1/chat/completions",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    together: "https://api.together.xyz/v1/chat/completions",
    deepinfra: "https://api.deepinfra.com/v1/openai/chat/completions",
    mistral: "https://api.mistral.ai/v1/chat/completions",
    deepseek: "https://api.deepseek.com/chat/completions"
  };

  const MODELS = {
    groq: "llama-3.3-70b-versatile",
    openrouter: "meta-llama/llama-3-8b-instruct",
    together: "mistralai/Mixtral-8x7B-Instruct-v0.1",
    deepinfra: "meta-llama/Meta-Llama-3-8B-Instruct",
    mistral: "mistral-small",
    deepseek: "deepseek-chat"
  };

  const url = URLS[provider];
  const key = AI_KEYS[provider];
  const model = MODELS[provider];

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "user", content: prompt }
      ]
    })
  });

  if (!res.ok) {
    throw new Error(provider + " failed");
  }

  const data = await res.json();

  return data.choices?.[0]?.message?.content;
}


async function callCloudflare(prompt) {

  const res = await fetch("/api/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt })
  });

  const data = await res.json();

  return data.result;

}
