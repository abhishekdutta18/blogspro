import { runTextAI } from "./ai/text-engine.js";
import { runCodeAI } from "./ai/code-engine.js";
import { runImageAI } from "./ai/image-engine.js";

const failedProviders = new Set();
const cache = new Map();

let running = false;


/**
 * Main AI entry point
 */
export async function callAI(prompt, type = "text") {

  if (!prompt) {
    throw new Error("Prompt required");
  }

  // prevent duplicate simultaneous calls
  if (running) {
    console.warn("[ai-core] AI already running");
  }

  // cache check
  const key = type + ":" + prompt;

  if (cache.has(key)) {
    return cache.get(key);
  }

  running = true;

  try {

    let result;

    if (type === "text") {
      result = await runTextAI(prompt);
    }

    else if (type === "code") {
      result = await runCodeAI(prompt);
    }

    else if (type === "image") {
      result = await runImageAI(prompt);
    }

    else {
      throw new Error("Unknown AI type");
    }

    cache.set(key, result);

    return result;

  }

  catch (err) {

    console.error("[ai-core] AI failed:", err);

    throw err;

  }

  finally {

    running = false;

  }

}



/**
 * Mark provider failure (rate limit or error)
 */
export function markFailed(provider) {

  failedProviders.add(provider);

  console.warn("[ai-core] provider marked as failed:", provider);

}



/**
 * Check if provider failed recently
 */
export function isProviderFailed(provider) {

  return failedProviders.has(provider);

}



/**
 * Reset failed providers
 */
export function resetFailures() {

  failedProviders.clear();

}



/**
 * Utility to detect rate limits
 */
export function isRateLimitError(err) {

  if (!err) return false;

  const msg = String(err).toLowerCase();

  return (
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("quota")
  );

}
