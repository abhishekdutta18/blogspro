import { runTextAI }  from "./ai/text-engine.js";
import { runCodeAI }  from "./ai/code-engine.js";
import { runImageAI } from "./ai/image-engine.js";

const cache    = new Map();
const CACHE_TTL = 10 * 60 * 1000;

// Provider display metadata — label + color + model shown in the modal
export const PROVIDER_META = {
  groq:        { label: 'Kimi K2 (Groq)',       color: '#f55036', icon: '🌙', model: 'kimi-k2-instruct'        },
  openrouter:  { label: 'Qwen3 235B',            color: '#7c3aed', icon: '🐼', model: 'qwen3-235b-a22b'          },
  together:    { label: 'DeepSeek V3',           color: '#0ea5e9', icon: '🔍', model: 'DeepSeek-V3'              },
  deepinfra:   { label: 'Llama 3.3 70B',         color: '#10b981', icon: '🦙', model: 'Llama-3.3-70B-Instruct'  },
  gemini:      { label: 'Gemini 2.0 Flash',      color: '#4285f4', icon: '✨', model: 'gemini-2.0-flash'         },
  mistral:     { label: 'Mistral Large',         color: '#ff6b35', icon: '🌀', model: 'mistral-large-latest'     },
  deepseek:    { label: 'DeepSeek Chat',         color: '#3b82f6', icon: '💬', model: 'deepseek-chat'            },
  cloudflare:  { label: 'Cloudflare AI',         color: '#f6821f', icon: '☁️', model: 'workers-ai'               },
  pollinations:{ label: 'Pollinations',          color: '#ec4899', icon: '🌸', model: 'flux-schnell'             },
  huggingface: { label: 'HuggingFace',           color: '#fbbf24', icon: '🤗', model: 'flux-schnell'             },
};

// callAI supports two calling conventions:
//   1. callAI(prompt, "text"|"code"|"image") → raw string (legacy)
//   2. callAI(prompt, true, model, maxTokens) → { text, error, provider }
export async function callAI(prompt, type = "text", _model = null, _maxTokens = null) {
  const returnObject = (type === true || type === false);
  const actualType   = returnObject ? "text" : (type || "text");

  const cacheKey = actualType + ":" + prompt;
  const cached   = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    const v = cached.value;
    return returnObject ? { text: v.text || v, error: null, provider: v.provider || null } : (v.text || v);
  }

  try {
    let result;   // { text, provider }

    if (actualType === "text")  result = await runTextAI(prompt);
    else if (actualType === "code")  result = await runCodeAI(prompt);
    else if (actualType === "image") result = { text: await runImageAI(prompt), provider: 'image' };
    else result = await runTextAI(prompt);

    cache.set(cacheKey, { value: result, time: Date.now() });

    return returnObject
      ? { text: result.text || "", error: null, provider: result.provider || null }
      : result.text;

  } catch (err) {
    console.error("[callAI] failed:", err.message);
    if (returnObject) return { text: "", error: err.message, provider: null };
    throw err;
  }
}
