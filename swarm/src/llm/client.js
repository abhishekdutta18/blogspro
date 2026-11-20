/**
 * client.js — a single chat-completions call to one OpenAI-compatible provider. It does
 * not retry; it classifies every failure so fleet.js can decide whether to move on.
 */

/** @typedef {'auth'|'billing'|'model_unavailable'|'rate_limit'|'server'|'timeout'|'network'|'bad_request'|'bad_response'} LlmErrorKind */

export class LlmError extends Error {
  /** @param {string} message @param {{provider: string, kind: LlmErrorKind, status?: number}} details */
  constructor(message, { provider, kind, status }) {
    super(message);
    this.name = 'LlmError';
    this.provider = provider;
    this.kind = kind;
    this.status = status;
  }
}

/** @param {number} status @returns {LlmErrorKind} */
function kindForStatus(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'billing'; // out of credits: will not recover within this run
  if (status === 404) return 'model_unavailable'; // retired or misspelled model: no pause will fix it
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'bad_request';
}

/**
 * @param {{name: string, baseUrl: string, model: string, apiKey: string}} provider
 * @param {{role: string, content: string}[]} messages
 * @param {{timeoutMs: number, maxTokens?: number, temperature?: number, fetchImpl?: typeof fetch}} options
 * @returns {Promise<{text: string, provider: string, model: string}>}
 */
export async function chat(provider, messages, { timeoutMs, maxTokens = 4096, temperature = 0.4, fetchImpl = fetch }) {
  const fail = (message, kind, status) => new LlmError(`${provider.name}: ${message}`, { provider: provider.name, kind, status });

  let response;
  try {
    response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({ model: provider.model, messages, max_tokens: maxTokens, temperature }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw fail(isTimeout ? `timed out after ${timeoutMs}ms` : `network error: ${error?.message}`, isTimeout ? 'timeout' : 'network');
  }

  if (!response.ok) {
    // Error bodies can echo request details; keep only a short prefix for the log.
    const body = (await response.text().catch(() => '')).slice(0, 200);
    throw fail(`HTTP ${response.status} ${body}`, kindForStatus(response.status), response.status);
  }

  const payload = await response.json().catch(() => null);
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || text.trim() === '') throw fail('empty or malformed completion', 'bad_response');
  return { text, provider: provider.name, model: provider.model };
}
