import { runCodeAI } from "../ai/code-engine.js";

export async function generateCode(prompt) {

  if (!prompt) {
    throw new Error("Prompt is required");
  }

  return await runCodeAI(prompt);

}

export async function debugCode(code, error) {

  const prompt = `
Fix the following code.

Code:
${code}

Error:
${error}
`;

  return await runCodeAI(prompt);

}

export async function explainCode(code) {

  const prompt = `
Explain the following code clearly.

${code}
`;

  return await runCodeAI(prompt);

}
