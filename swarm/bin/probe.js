#!/usr/bin/env node
/**
 * probe.js — checks AI providers one at a time with one tiny chat call each, so a key
 * can be verified right after it is pasted into the env file.
 *   node --env-file=../.env bin/probe.js            all providers in the catalog
 *   node --env-file=../.env bin/probe.js groq        just one
 * Prints one line per provider. Keys are never printed. Exit 0 if every probed provider works.
 */
import { PROVIDER_CATALOG, resolveProviders } from '../src/llm/providers.js';
import { chat } from '../src/llm/client.js';

const TIMEOUT_MS = 30_000;
// Reasoning models (gpt-oss) spend tokens thinking before they answer; 16 is not enough.
const MAX_TOKENS = 256;
const MESSAGES = [{ role: 'user', content: 'Reply with the single word OK.' }];

const HINTS = {
  auth: 'key rejected: create a new key and replace it in the env file',
  billing: 'key works but the account has no credits: add billing or credits',
  model_unavailable: 'key works but this model does not exist for it: set SWARM_<NAME>_MODEL',
  rate_limit: 'key works but is rate-limited right now: try again in a minute',
  bad_request: 'request refused: the model name may be wrong (set SWARM_<NAME>_MODEL)',
  timeout: 'no answer in time: provider may be down',
  network: 'could not reach the provider',
  server: 'provider-side error: try again later',
  bad_response: 'answered, but with no text'
};

async function probe(name, env) {
  const catalog = PROVIDER_CATALOG.find(p => p.name === name);
  if (!catalog) return { name, ok: false, line: `unknown provider (known: ${PROVIDER_CATALOG.map(p => p.name).join(', ')})` };
  const provider = resolveProviders({ ...env, SWARM_PROVIDER_ORDER: name })[0];
  if (!provider) return { name, ok: false, line: `${catalog.keyEnv} is not set` };

  const via = provider.viaProxy ? ' via proxy' : '';
  const started = Date.now();
  try {
    const result = await chat(provider, MESSAGES, { timeoutMs: TIMEOUT_MS, maxTokens: MAX_TOKENS, temperature: 0 });
    return { name, ok: true, line: `OK  ${provider.model}${via}  ${Date.now() - started}ms  replied "${result.text.trim().slice(0, 20)}"` };
  } catch (error) {
    const status = error.status ? `HTTP ${error.status} ` : '';
    // Behind the proxy a 401 can mean a wrong swarm token or no key on the proxy; its message says which.
    const proxyText = error.message.slice(error.message.indexOf(':') + 2).replace(/^HTTP \d+ /, '').slice(0, 140);
    const detail = provider.viaProxy ? proxyText : HINTS[error.kind] || error.message;
    return { name, ok: false, line: `FAIL ${provider.model}${via}  ${status}${error.kind}: ${detail}` };
  }
}

/** Env vars that hold the same value: almost always one key pasted into two slots. */
function sharedKeys(env) {
  const byValue = new Map();
  for (const keyEnv of [...PROVIDER_CATALOG.map(p => p.keyEnv), 'CEREBRAS_API_KEY']) {
    const value = env[keyEnv];
    if (value) byValue.set(value, [...(byValue.get(value) || []), keyEnv]);
  }
  return [...byValue.values()].filter(group => group.length > 1);
}

// Behind the proxy the local provider keys are not used, so a duplicate there does not matter.
for (const group of process.env.SWARM_PROXY_URL ? [] : sharedKeys(process.env)) {
  process.stdout.write(`WARNING     ${group.join(' and ')} hold the same key; each provider needs its own\n`);
}

const requested = process.argv.slice(2);
const names = requested.length ? requested : PROVIDER_CATALOG.map(p => p.name);
let allOk = true;
for (const name of names) {
  const { ok, line } = await probe(name, process.env);
  allOk &&= ok;
  process.stdout.write(`${name.padEnd(11)} ${line}\n`);
}
process.exitCode = allOk ? 0 : 1;
