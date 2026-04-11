import { runImageAI } from "../ai/image-engine.js";

export async function generateImage(prompt) {

  if (!prompt) {
    throw new Error("Prompt is required");
  }

  return await runImageAI(prompt);

}
