/**
 * blogspro-ai-proxy — holds the AI provider keys as Worker secrets and forwards
 * OpenAI-compatible chat calls for the swarm, so no provider key ever reaches the VPS.
 *
 *   POST /v1/{provider}/chat/completions   forwarded upstream with that provider's key
 *   GET  /v1/providers                     which providers have a key set (names only)
 *   GET  /v1/{provider}/models             model ids that provider offers this key
 *
 * Every route needs `Authorization: Bearer <SWARM_PROXY_TOKEN>`. If that secret is unset
 * the proxy refuses everything (fail closed). It never returns, logs or echoes a key.
 * Upstream status codes pass through unchanged, so the swarm's fallback rules still apply.
 */

export const PROVIDERS = Object.freeze({
  sambanova: { base: 'https://api.sambanova.ai/v1', keyName: 'SAMBANOVA_API_KEY' },
  groq: { base: 'https://api.groq.com/openai/v1', keyName: 'GROQ_API_KEY' },
  mistral: { base: 'https://api.mistral.ai/v1', keyName: 'MISTRAL_API_KEY' },
  openrouter: { base: 'https://openrouter.ai/api/v1', keyName: 'OPENROUTER_KEY' }
});

const MAX_BODY_BYTES = 256 * 1024;
const CHAT_PATH = /^\/v1\/([a-z]+)\/chat\/completions$/;
const MODELS_PATH = /^\/v1\/([a-z]+)\/models$/;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

/** Compares two strings in time that does not depend on where they differ. */
async function constantTimeEqual(a, b) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b))
  ]);
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** @returns {Promise<Response|null>} an error response, or null when the caller is authorised */
async function authorise(request, env) {
  if (!env.SWARM_PROXY_TOKEN) return json(503, { error: 'Proxy is not configured.' });
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !(await constantTimeEqual(token, env.SWARM_PROXY_TOKEN))) return json(401, { error: 'Unauthorized.' });
  return null;
}

async function readBody(request) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BODY_BYTES) return { error: json(413, { error: 'Request too large.' }) };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: json(413, { error: 'Request too large.' }) };
  try {
    const body = JSON.parse(text);
    if (!body || !Array.isArray(body.messages) || typeof body.model !== 'string') {
      return { error: json(400, { error: 'Expected a chat completion with model and messages.' }) };
    }
    // The swarm never streams; refusing it keeps responses small and simple to pass through.
    if (body.stream) return { error: json(400, { error: 'Streaming is not supported.' }) };
    return { text };
  } catch {
    return { error: json(400, { error: 'Body must be JSON.' }) };
  }
}

async function forwardChat(providerName, request, env) {
  const provider = PROVIDERS[providerName];
  if (!provider) return json(404, { error: 'Unknown provider.' });
  // 401, so the swarm's fleet skips this provider for the run instead of pausing and retrying.
  const key = env[provider.keyName];
  if (!key) return json(401, { error: `No key is set for ${providerName} on the proxy.` });

  const { text, error } = await readBody(request);
  if (error) return error;

  let upstream;
  try {
    upstream = await fetch(`${provider.base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: text
    });
  } catch {
    return json(502, { error: `Could not reach ${providerName}.` });
  }
  // Pass the status and body through; drop upstream headers (cookies, request ids, rate-limit internals).
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store' }
  });
}

/** Lists the model ids a provider offers this key, so model names can be checked instead of guessed. */
async function listModels(providerName, env) {
  const provider = PROVIDERS[providerName];
  if (!provider) return json(404, { error: 'Unknown provider.' });
  const key = env[provider.keyName];
  if (!key) return json(401, { error: `No key is set for ${providerName} on the proxy.` });
  let upstream;
  try {
    upstream = await fetch(`${provider.base}/models`, { headers: { Authorization: `Bearer ${key}` } });
  } catch {
    return json(502, { error: `Could not reach ${providerName}.` });
  }
  if (!upstream.ok) return json(upstream.status, { error: `${providerName} answered HTTP ${upstream.status}.` });
  const payload = await upstream.json().catch(() => null);
  const ids = (payload?.data || []).map(m => m?.id).filter(id => typeof id === 'string');
  return json(200, ids.sort());
}

export default {
  /** @param {Request} request @param {Record<string, string|undefined>} env */
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const denied = await authorise(request, env);
    if (denied) return denied;

    if (request.method === 'GET' && pathname === '/v1/providers') {
      return json(200, Object.entries(PROVIDERS).map(([name, p]) => ({ name, configured: Boolean(env[p.keyName]) })));
    }

    const models = pathname.match(MODELS_PATH);
    if (models) {
      if (request.method !== 'GET') return json(405, { error: 'Use GET.' });
      return listModels(models[1], env);
    }

    const chat = pathname.match(CHAT_PATH);
    if (chat) {
      if (request.method !== 'POST') return json(405, { error: 'Use POST.' });
      return forwardChat(chat[1], request, env);
    }
    return json(404, { error: 'Not found.' });
  }
};
