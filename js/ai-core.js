import { runTextAI } from "./ai/text-engine.js";
import { runCodeAI } from "./ai/code-engine.js";
import { runImageAI } from "./ai/image-engine.js";

const cache = new Map();

const CACHE_TTL = 10 * 60 * 1000;


// callAI supports two calling conventions:
//   1. callAI(prompt, "text"|"code"|"image")  → returns raw string (legacy)
//   2. callAI(prompt, true, model, maxTokens) → returns { text, error } object
//      (used by ai-editor.js, ai-tools.js, seo-page.js, newsletter.js, etc.)
export async function callAI(prompt, type = "text", _model = null, _maxTokens = null) {

  // Detect object-mode: caller passes `true` (or `false`) as the second arg
  const returnObject = (type === true || type === false);
  const actualType   = returnObject ? "text" : (type || "text");

  const cacheKey = actualType + ":" + prompt;
  const cached   = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    // Return in the right shape
    const v = cached.value;
    return returnObject ? { text: v, error: null } : v;
  }

  let result;
  try {
    if (actualType === "text") {
      result = await runTextAI(prompt);
    } else if (actualType === "code") {
      result = await runCodeAI(prompt);
    } else if (actualType === "image") {
      result = await runImageAI(prompt);
    } else {
      result = await runTextAI(prompt);
    }

    cache.set(cacheKey, { value: result, time: Date.now() });

    return returnObject ? { text: result || "", error: null } : result;

  } catch (err) {
    console.error("[callAI] failed:", err.message);
    if (returnObject) return { text: "", error: err.message };
    throw err;
  }

}
