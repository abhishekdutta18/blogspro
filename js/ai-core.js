import { runTextAI }  from "./ai/text-engine.js";
import { runCodeAI }  from "./ai/code-engine.js";
import { runImageAI } from "./ai/image-engine.js";
import { enhancePrompt, savePattern } from "./ai-memory.js";
import { RateLimiter, showToast } from "./config.js";

const cache    = new Map();
const CACHE_TTL = 10 * 60 * 1000;

// Rate limiters for different AI operations
const textLimiter = new RateLimiter(2000);   // 1 request per 2 seconds
const codeLimiter = new RateLimiter(2000);   // 1 request per 2 seconds
const imageLimiter = new RateLimiter(5000);  // 1 request per 5 seconds

// Provider display metadata — label + color + model shown in the modal
export const PROVIDER_META = {
  groq:        { label: 'Kimi K2 (Groq)',       color: '#f55036', icon: '🌙', model: 'kimi-k2-instruct'        },
  openrouter:  { label: 'Qwen3 235B',            color: '#7c3aed', icon: '🐼', model: 'qwen3-235b-a22b'          },
  together:    { label: 'DeepSeek V3',           color: '#0ea5e9', icon: '🔍', model: 'DeepSeek-V3'              },
  deepinfra:   { label: 'Llama 3.3 70B',         color: '#10b981', icon: '🦙', model: 'Llama-3.3-70B-Instruct'  },
  gemini:      { label: 'Gemini 2.0 Flash',      color: '#4285f4', icon: '✨', model: 'gemini-2.0-flash'         },
  mistral:     { label: 'Mistral Large',         color: '#ff6b35', icon: '🌀', model: 'mistral-large-latest'     },
  deepseek:    { label: 'DeepSeek Chat',         color: '#3b82f6', icon: '💬', model: 'deepseek-chat'            },
  google:      { label: 'Google Imagen',         color: '#4285f4', icon: '🖼', model: 'imagen-3.0-generate-002'  },
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

  // ── Rate limiting checks ────────────────────────
  let limiter;
  if (actualType === "text") limiter = textLimiter;
  else if (actualType === "code") limiter = codeLimiter;
  else if (actualType === "image") limiter = imageLimiter;

  if (limiter && !limiter.canRequest()) {
    const waitTime = Math.ceil(limiter.getWaitTime() / 1000);
    const msg = `Please wait ${waitTime}s before the next ${actualType} generation.`;
    if (returnObject) return { text: "", error: msg, provider: null };
    showToast(msg, 'info');
    throw new Error(msg);
  }

  // ── Cache logic: separate keys for base vs enhanced prompts ─
  // This prevents cache invalidation when pattern memory changes
  const baseCacheKey = actualType + ":base:" + prompt;
  const baseCache = cache.get(baseCacheKey);
  if (baseCache && Date.now() - baseCache.time < CACHE_TTL) {
    const v = baseCache.value;
    return returnObject ? { text: v.text || v, error: null, provider: v.provider || null } : (v.text || v);
  }

  // ── Enhance prompt with past successful patterns ──────────
  // Only for text/code calls — not image generation
  const enhancedPrompt = (actualType !== 'image')
    ? await enhancePrompt(prompt)
    : prompt;

  // Check enhanced cache (expires faster, only 5 min)
  const enhancedCacheKey = actualType + ":enhanced:" + enhancedPrompt;
  const enhancedCache = cache.get(enhancedCacheKey);
  if (enhancedCache && Date.now() - enhancedCache.time < 5 * 60 * 1000) {
    const v = enhancedCache.value;
    return returnObject ? { text: v.text || v, error: null, provider: v.provider || null } : (v.text || v);
  }

  try {
    let result;   // { text, provider }

    if (actualType === "text")       result = await runTextAI(enhancedPrompt);
    else if (actualType === "code")  result = await runCodeAI(enhancedPrompt);
    else if (actualType === "image") result = { text: await runImageAI(prompt), provider: 'image' };
    else result = await runTextAI(enhancedPrompt);

    // Cache both base and enhanced results
    cache.set(baseCacheKey, { value: result, time: Date.now() });
    cache.set(enhancedCacheKey, { value: result, time: Date.now() });

    // ── Save pattern if result looks successful ───────────────
    // Score heuristic: non-empty result with reasonable length = 80
    if (result.text && result.text.length > 50 && actualType !== 'image') {
      const score = result.text.length > 200 ? 85 : 72;
      // Add error handling to pattern save
      savePattern(prompt, result, score).catch(err => {
        console.warn('Failed to save pattern:', err.message);
      });
    }

    return returnObject
      ? { text: result.text || "", error: null, provider: result.provider || null }
      : result.text;

  } catch (err) {
    if (returnObject) return { text: "", error: err.message, provider: null };
    throw err;
  }
}
