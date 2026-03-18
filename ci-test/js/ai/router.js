// ai/router.js
export function routePrompt(prompt, type) {
  if (!prompt) throw new Error('prompt required');
  return { prompt, type: type || 'text' };
}
