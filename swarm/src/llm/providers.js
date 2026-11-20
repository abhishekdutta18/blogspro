/**
 * providers.js — the OpenAI-compatible chat providers the swarm can use, in default
 * fallback order. Two modes:
 *   proxy  (SWARM_PROXY_URL + SWARM_PROXY_TOKEN set): every call goes through the
 *          blogspro-ai-proxy worker, which holds the provider keys. Production mode.
 *   direct (otherwise): each provider is used when its own key env var is set. Local dev.
 * The model can be overridden per provider with SWARM_<NAME>_MODEL, and the order with
 * SWARM_PROVIDER_ORDER.
 */

// Models and order checked live through the proxy on 2026-11-15:
//   groq       OK  (Groq retired its Llama chat models; gpt-oss-120b is its large model)
//   openrouter OK
//   mistral    key and model allowed, but rate-limited (429) at the time
//   sambanova  402 payment method required; kept last until the account has billing
export const PROVIDER_CATALOG = Object.freeze([
  { name: 'groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', keyEnv: 'GROQ_API_KEY' },
  { name: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct', keyEnv: 'OPENROUTER_KEY' },
  { name: 'mistral', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-medium-latest', keyEnv: 'MISTRAL_API_KEY' },
  { name: 'sambanova', baseUrl: 'https://api.sambanova.ai/v1', model: 'Meta-Llama-3.3-70B-Instruct', keyEnv: 'SAMBANOVA_API_KEY' }
]);

const byName = name => PROVIDER_CATALOG.find(p => p.name === name);
const modelFor = (env, p) => env[`SWARM_${p.name.toUpperCase()}_MODEL`] || p.model;

/** https only, except plain http to localhost for running the worker locally. */
function proxyBase(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`SWARM_PROXY_URL is not a URL: "${raw}"`);
  }
  const isLocal = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocal) throw new Error('SWARM_PROXY_URL must use https.');
  return url.origin;
}

/**
 * Resolves the providers usable in this environment, in fallback order.
 * In proxy mode every catalog provider is listed: one without a key on the proxy answers
 * 401 and the fleet skips it for the run.
 * @param {Record<string, string|undefined>} env
 * @returns {{name: string, baseUrl: string, model: string, apiKey: string, viaProxy: boolean}[]}
 */
export function resolveProviders(env) {
  const order = env.SWARM_PROVIDER_ORDER
    ? env.SWARM_PROVIDER_ORDER.split(',').map(s => s.trim()).filter(Boolean)
    : PROVIDER_CATALOG.map(p => p.name);

  const unknown = order.filter(name => !byName(name));
  if (unknown.length) throw new Error(`SWARM_PROVIDER_ORDER names unknown providers: ${unknown.join(', ')}`);
  const chosen = order.map(byName);

  if (env.SWARM_PROXY_URL) {
    if (!env.SWARM_PROXY_TOKEN) throw new Error('SWARM_PROXY_URL is set but SWARM_PROXY_TOKEN is not.');
    const base = proxyBase(env.SWARM_PROXY_URL);
    return chosen.map(p => ({ name: p.name, baseUrl: `${base}/v1/${p.name}`, model: modelFor(env, p), apiKey: env.SWARM_PROXY_TOKEN, viaProxy: true }));
  }

  return chosen
    .filter(p => env[p.keyEnv])
    .map(p => ({ name: p.name, baseUrl: p.baseUrl, model: modelFor(env, p), apiKey: env[p.keyEnv], viaProxy: false }));
}
