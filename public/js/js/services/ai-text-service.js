import { runTextAI } from "../ai/text-engine.js";

export async function generateText(prompt) {

  if (!prompt) {
    throw new Error("Prompt is required");
  }

  const result = await runTextAI(prompt);

  return result;

}
