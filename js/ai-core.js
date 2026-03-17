import { runTextAI }  from "./ai/text-engine.js";
import { runCodeAI }  from "./ai/code-engine.js";
import { runImageAI } from "./ai/image-engine.js";
import { enhancePrompt, savePattern } from "./ai-memory.js";

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

  // ── Enhance prompt with past successful patterns ──────────
  // Only for text/code calls — not image generation
  const enhancedPrompt = (actualType !== 'image')
    ? await enhancePrompt(prompt)
    : prompt;

  const cacheKey = actualType + ":" + enhancedPrompt;
  const cached   = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    const v = cached.value;
    return returnObject ? { text: v.text || v, error: null, provider: v.provider || null } : (v.text || v);
  }

  try {
    let result;   // { text, provider }

    if (actualType === "text")       result = await runTextAI(enhancedPrompt);
    else if (actualType === "code")  result = await runCodeAI(enhancedPrompt);
    else if (actualType === "image") result = { text: await runImageAI(prompt), provider: 'image' };
    else result = await runTextAI(enhancedPrompt);

    cache.set(cacheKey, { value: result, time: Date.now() });

    // ── Save pattern if result looks successful ───────────────
    // Score heuristic: non-empty result with reasonable length = 80
    if (result.text && result.text.length > 50 && actualType !== 'image') {
      const score = result.text.length > 200 ? 85 : 72;
      savePattern(prompt, result, score); // fire-and-forget, no await
    }

    return returnObject
      ? { text: result.text || "", error: null, provider: result.provider || null }
      : result.text;

  } catch (err) {
    if (returnObject) return { text: "", error: err.message, provider: null };
    throw err;
  }
}
