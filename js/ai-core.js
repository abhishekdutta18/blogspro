import { runTextAI } from "./ai/text-engine.js";
import { runCodeAI } from "./ai/code-engine.js";
import { runImageAI } from "./ai/image-engine.js";

const cache = new Map();

const CACHE_TTL = 10 * 60 * 1000;


export async function callAI(prompt, type = "text") {

  const key = type + ":" + prompt;

  const cached = cache.get(key);

  if (cached && Date.now() - cached.time < CACHE_TTL) {

    return cached.value;

  }

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

  cache.set(key, {
    value: result,
    time: Date.now()
  });

  return result;

}
