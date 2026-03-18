// services/ai-text-service.js
export async function generateText(prompt) {
  if (!prompt) throw new Error('prompt required');
  return { text: '', prompt };
}
