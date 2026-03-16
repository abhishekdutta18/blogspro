// ═══════════════════════════════════════════════
// ai-core.js — AI call gateway with fallback chain
//
// Priority order:
//   1. Cloudflare Worker (your primary — full model routing)
//   2. Groq             (free, 1000 req/day, same Llama models)
//   3. Gemini           (Google free tier, 1000 req/day)
//
// To enable fallbacks:
//   1. Get a free Groq key at console.groq.com (no card needed)
//   2. Get a free Gemini key at aistudio.google.com (no card n// ═══════════════════════════════════════════════
// ai-core.js — AI call gateway with fallback chain
//
// Priority order:
//   1. Cloudflare Worker (your primary — full model routing)
//   2. Groq             (free, 1000 req/day, same Llama models)
//   3. Gemini           (Google free tier, 1000 req/day)
//
// To enable fallbacks:
//   1. Get a free Groq key at console.groq.com (no card needed)
//   2. Get a free Gemini key at aistudio.google.com (no card needed)
//   3. Set them in config.js:
//        export const GROQ_API_KEY   = "gsk_...";
//        export const GEMINI_API_KEY = "AIza...";
//   Cloudflare is always tried first. Fallbacks only activate on
//   rate-limit or error — they never run if Cloudflare succeeds.
// ═══════════════════════════════════════════════

import { WORKER_URL, GROQ_API_KEY, GEMINI_API_KEY } from './config.js';
import { showToast } from './config.js';

// ── Fetch with timeout ───────────────────────
// Prevents silent hangs when a provider takes too long
async function fetchWithTimeout(url, options, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch(e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('Request timed out after ' + (timeoutMs/1000) + 's');
    throw e;
  }
}

// ── Rate-limit detection ──────────────────────
function isRateLimit(errorStr) {
  if (!errorStr) return false;
  const s = errorStr.toLowerCase();
  return s.includes('rate limit') || s.includes('credits') ||
         s.includes('quota') || s.includes('too many') ||
         s.includes('limit exceeded') || s.includes('429') ||
         s.includes('tokens per minute') || s.includes('tpm') ||
         s.includes('please try again') || s.includes('upgrade');
}

// ── Provider 1: Cloudflare Worker ────────────
async function callCloudflare(prompt, tone, category, forceModel, maxTokens) {
  let res, data;
  try {
    res = await fetchWithTimeout(WORKER_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prompt, tone, category, forceModel, maxTokens }),
    }, 20000); // 20s timeout — Cloudflare Workers must respond within this
  } catch(e) {
    return { error: 'CF network error: ' + e.message };
  }
  try { data = await res.json(); } catch(e) {
    return { error: 'CF invalid response (HTTP ' + res.status + ')' };
  }
  if (data.error) {
    return {
      error: typeof data.error === 'object'
        ? (data.error.message || JSON.stringify(data.error))
        : String(data.error),
      attemptsDetail: data.attempts_detail || [],
    };
  }
  if (!data.text) return { error: 'CF: no content returned.' };
  return {
    text:           data.text,
    modelUsed:      data.model_used || 'cloudflare',
    fallbackUsed:   false,
    attemptsDetail: data.attempts_detail || [],
  };
}

// ── Provider 2: Groq ─────────────────────────
// Groq model priority list — best quality first
// Falls through to next model if one fails or rate-limits
// Groq model priority — ordered by TPM limit (high → low) for parallel safety
// Free tier TPM limits (approx): Llama3.3=12k, Llama4=8k, Qwen3=6k, Kimi=10k
// ── Round-robin model pool for article sections ─
// All text-generating models, cycled across sections so no single model
// bears the full TPM load. Best quality models given more slots.
export const ARTICLE_MODEL_POOL = [
  'llama-3.3-70b-versatile',                      // Groq: Llama 3.3 70B
  'llama-4-maverick-17b-128e-instruct', // Groq: Llama 4 Maverick
  'llama-3.3-70b-versatile',                      // Llama 3.3 again (double weight — most reliable)
  'llama-4-scout-17b-16e-instruct',    // Groq: Llama 4 Scout
  'qwen/qwen3-32b',                               // Groq: Qwen3
  'llama-4-maverick-17b-128e-instruct', // Maverick again
  'moonshotai/kimi-k2-instruct',                  // Groq: Kimi K2 (quality boost)
  'llama-3.3-70b-versatile',                      // Llama 3.3 again
  'mistral-small-24b-instruct-2501',              // Groq: Mistral
  'gemini',                                       // Gemini (special: routes to callGemini)
];

let _poolIndex = 0;
export function getNextPoolModel() {
  const model = ARTICLE_MODEL_POOL[_poolIndex % ARTICLE_MODEL_POOL.length];
  _poolIndex++;
  return model;
}
export function resetModelPool() { _poolIndex = 0; }

const GROQ_MODELS = [
  { id: 'llama-3.3-70b-versatile',                   name: 'Llama 3.3 70B'  },  // highest TPM, most reliable
  { id: 'llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick' }, // good quality + high TPM
  { id: 'llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout'  },
  { id: 'qwen/qwen3-32b',                            name: 'Qwen3 32B'      },
  { id: 'moonshotai/kimi-k2-instruct',               name: 'Kimi K2'        },  // best quality but low TPM — use as last resort
  { id: 'mistral-small-24b-instruct-2501',           name: 'Mistral 24B'    },
];

async function callGroqModel(prompt, maxTokens, model) {
  let res, data;
  try {
    res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY,
      },
      body: JSON.stringify({
        model:       model.id,
        messages:    [{ role: 'user', content: prompt }],
        max_tokens:  Math.min(maxTokens, 8000),
        temperature: 0.7,
      }),
    }, 30000); // 30s timeout for Groq
  } catch(e) { return { error: 'Groq network error: ' + e.message }; }
  try { data = await res.json(); } catch(e) {
    return { error: 'Groq invalid response (HTTP ' + res.status + ')' };
  }
  if (data.error) {
    return { error: 'Groq ' + model.name + ': ' + (data.error.message || JSON.stringify(data.error)) };
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) return { error: 'Groq ' + model.name + ': no content.' };
  return { text, modelUsed: 'groq/' + model.name, fallbackUsed: true };
}

// Track which individual Groq models are TPM-limited this session
const _groqModelFailed = {};

async function callGroq(prompt, maxTokens) {
  if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_KEY') {
    return { error: 'Groq key not configured.' };
  }
  // Try each model in priority order, skipping known-failed ones
  for (const model of GROQ_MODELS) {
    if (_groqModelFailed[model.id]) continue; // skip this session
    const result = await callGroqModel(prompt, maxTokens, model);
    if (!result.error) return result;
    if (isRateLimit(result.error)) {
      _groqModelFailed[model.id] = true; // mark only this model as failed
      console.warn('[ai-core] Groq model ' + model.name + ' TPM-limited, trying next');
      continue;
    }
    if (result.error.includes('not found') || result.error.includes('404')) {
      _groqModelFailed[model.id] = true;
      continue;
    }
    return result; // other error — stop
  }
  return { error: 'All Groq models rate-limited.' };
}

// ── Provider 3: Gemini ───────────────────────
async function callGemini(prompt, maxTokens) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_KEY') {
    return { error: 'Gemini key not configured.' };
  }
  let res, data;
  try {
    res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: Math.min(maxTokens, 8192),
            temperature: 0.7,
          },
        }),
      },
      30000 // 30s timeout for Gemini
    );
  } catch(e) {
    return { error: 'Gemini network error: ' + e.message };
  }
  try { data = await res.json(); } catch(e) {
    return { error: 'Gemini invalid response (HTTP ' + res.status + ')' };
  }
  if (data.error) {
    return { error: 'Gemini: ' + (data.error.message || JSON.stringify(data.error)) };
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return { error: 'Gemini: no content returned.' };
  return { text, modelUsed: 'gemini-2.5-flash', fallbackUsed: true };
}

// ── Call with a specific model from the pool ─
// Handles 'gemini' as a special route, otherwise forces that Groq model
export async function callAIWithModel(prompt, poolModel, maxTokens = 4000) {
  if (poolModel === 'gemini') {
    return await callGemini(prompt, maxTokens);
  }
  // Force a specific Groq model directly
  if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_KEY') {
    return callAI(prompt, true, 'auto', maxTokens);
  }
  const model = { id: poolModel, name: poolModel.split('/').pop() };
  const result = await callGroqModel(prompt, maxTokens, model);
  if (result.error && isRateLimit(result.error)) {
    // This model is rate-limited — fall back to normal callAI chain
    _groqModelFailed[poolModel] = true;
    return callAI(prompt, true, 'auto', maxTokens);
  }
  return result;
}

// ── Session-level provider health tracking ───
// Once a provider rate-limits, skip it for the rest of the session
// This avoids wasting 2-3 seconds on a known-failed provider
const _providerFailed = { cloudflare: false, groq: false, gemini: false };

function markFailed(provider) {
  _providerFailed[provider] = true;
  console.warn(`[ai-core] ${provider} marked as rate-limited for this session`);
}

// ── Main callAI — tries providers in order ───
/**
 * callAI(prompt, silent, forceModel, maxTokens)
 * Returns: { text, modelUsed, fallbackUsed, attemptsDetail } | { error }
 *
 * Fallback chain (skips known-failed providers instantly):
 *   Cloudflare → Groq (multi-model) → Gemini → error
 */
export async function callAI(prompt, silent = false, forceModel = 'auto', maxTokens = 4000) {
  const tone     = document.getElementById('aiTone')?.value     || 'professional';
  const category = document.getElementById('postCategory')?.value || 'Fintech';

  // ── Step 1: Cloudflare Worker ────────────────
  if (!_providerFailed.cloudflare) {
    const cfResult = await callCloudflare(prompt, tone, category, forceModel, maxTokens);
    if (!cfResult.error) return cfResult;

    // Fall through to Groq on ANY Cloudflare error (rate limit, network, 5xx, timeout, etc.)
    markFailed('cloudflare');
    if (!silent) {
      const msg = isRateLimit(cfResult.error)
        ? 'Cloudflare quota reached — switching to Groq…'
        : 'Cloudflare unavailable — switching to Groq…';
      showToast(msg, 'info');
    }
    console.warn('[ai-core] Cloudflare failed, falling back to Groq. Error:', cfResult.error);
  }

  // ── Step 2: Groq (tries multiple models) ─────
  if (!_providerFailed.groq) {
    const groqResult = await callGroq(prompt, maxTokens);
    if (!groqResult.error) {
      if (!silent && _providerFailed.cloudflare) showToast('Using Groq ✓', 'info');
      return groqResult;
    }

    // Fall through to Gemini on ANY Groq error (rate limit, bad key, model error, etc.)
    markFailed('groq');
    if (!silent) {
      const msg = isRateLimit(groqResult.error)
        ? 'Groq quota reached — switching to Gemini…'
        : 'Groq unavailable — switching to Gemini…';
      showToast(msg, 'info');
    }
    console.warn('[ai-core] Groq failed, falling back to Gemini. Error:', groqResult.error);
  }

  // ── Step 3: Gemini ────────────────────────────
  if (!_providerFailed.gemini) {
    const geminiResult = await callGemini(prompt, maxTokens);
    if (!geminiResult.error) {
      if (!silent) showToast('Using Gemini ✓', 'info');
      return geminiResult;
    }
    // Mark Gemini as failed regardless of error type
    markFailed('gemini');
    console.warn('[ai-core] Gemini failed. Error:', geminiResult.error);
  }

  return { error: 'All AI providers rate-limited. Reset at midnight UTC or add credits.' };
}eeded)
//   3. Set them in config.js:
//        export const GROQ_API_KEY   = "gsk_...";
//        export const GEMINI_API_KEY = "AIza...";
//   Cloudflare is always tried first. Fallbacks only activate on
//   rate-limit or error — they never run if Cloudflare succeeds.
// ═══════════════════════════════════════════════

import { WORKER_URL, GROQ_API_KEY, GEMINI_API_KEY } from './config.js';
import { showToast } from './config.js';

// ── Fetch with timeout ───────────────────────
// Prevents silent hangs when a provider takes too long
async function fetchWithTimeout(url, options, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch(e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('Request timed out after ' + (timeoutMs/1000) + 's');
    throw e;
  }
}

// ── Rate-limit detection ──────────────────────
function isRateLimit(errorStr) {
  if (!errorStr) return false;
  const s = errorStr.toLowerCase();
  return s.includes('rate limit') || s.includes('credits') ||
         s.includes('quota') || s.includes('too many') ||
         s.includes('limit exceeded') || s.includes('429') ||
         s.includes('tokens per minute') || s.includes('tpm') ||
         s.includes('please try again') || s.includes('upgrade');
}

// ── Provider 1: Cloudflare Worker ────────────
async function callCloudflare(prompt, tone, category, forceModel, maxTokens) {
  let res, data;
  try {
    res = await fetchWithTimeout(WORKER_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prompt, tone, category, forceModel, maxTokens }),
    }, 20000); // 20s timeout — Cloudflare Workers must respond within this
  } catch(e) {
    return { error: 'CF network error: ' + e.message };
  }
  try { data = await res.json(); } catch(e) {
    return { error: 'CF invalid response (HTTP ' + res.status + ')' };
  }
  if (data.error) {
    return {
      error: typeof data.error === 'object'
        ? (data.error.message || JSON.stringify(data.error))
        : String(data.error),
      attemptsDetail: data.attempts_detail || [],
    };
  }
  if (!data.text) return { error: 'CF: no content returned.' };
  return {
    text:           data.text,
    modelUsed:      data.model_used || 'cloudflare',
    fallbackUsed:   false,
    attemptsDetail: data.attempts_detail || [],
  };
}

// ── Provider 2: Groq ─────────────────────────
// Groq model priority list — best quality first
// Falls through to next model if one fails or rate-limits
// Groq model priority — ordered by TPM limit (high → low) for parallel safety
// Free tier TPM limits (approx): Llama3.3=12k, Llama4=8k, Qwen3=6k, Kimi=10k
// ── Round-robin model pool for article sections ─
// All text-generating models, cycled across sections so no single model
// bears the full TPM load. Best quality models given more slots.
export const ARTICLE_MODEL_POOL = [
  'llama-3.3-70b-versatile',                      // Groq: Llama 3.3 70B
  'llama-4-maverick-17b-128e-instruct', // Groq: Llama 4 Maverick
  'llama-3.3-70b-versatile',                      // Llama 3.3 again (double weight — most reliable)
  'llama-4-scout-17b-16e-instruct',    // Groq: Llama 4 Scout
  'qwen/qwen3-32b',                               // Groq: Qwen3
  'llama-4-maverick-17b-128e-instruct', // Maverick again
  'moonshotai/kimi-k2-instruct',                  // Groq: Kimi K2 (quality boost)
  'llama-3.3-70b-versatile',                      // Llama 3.3 again
  'mistral-small-24b-instruct-2501',              // Groq: Mistral
  'gemini',                                       // Gemini (special: routes to callGemini)
];

let _poolIndex = 0;
export function getNextPoolModel() {
  const model = ARTICLE_MODEL_POOL[_poolIndex % ARTICLE_MODEL_POOL.length];
  _poolIndex++;
  return model;
}
export function resetModelPool() { _poolIndex = 0; }

const GROQ_MODELS = [
  { id: 'llama-3.3-70b-versatile',                   name: 'Llama 3.3 70B'  },  // highest TPM, most reliable
  { id: 'llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick' }, // good quality + high TPM
  { id: 'llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout'  },
  { id: 'qwen/qwen3-32b',                            name: 'Qwen3 32B'      },
  { id: 'moonshotai/kimi-k2-instruct',               name: 'Kimi K2'        },  // best quality but low TPM — use as last resort
  { id: 'mistral-small-24b-instruct-2501',           name: 'Mistral 24B'    },
];

async function callGroqModel(prompt, maxTokens, model) {
  let res, data;
  try {
    res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY,
      },
      body: JSON.stringify({
        model:       model.id,
        messages:    [{ role: 'user', content: prompt }],
        max_tokens:  Math.min(maxTokens, 8000),
        temperature: 0.7,
      }),
    }, 30000); // 30s timeout for Groq
  } catch(e) { return { error: 'Groq network error: ' + e.message }; }
  try { data = await res.json(); } catch(e) {
    return { error: 'Groq invalid response (HTTP ' + res.status + ')' };
  }
  if (data.error) {
    return { error: 'Groq ' + model.name + ': ' + (data.error.message || JSON.stringify(data.error)) };
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) return { error: 'Groq ' + model.name + ': no content.' };
  return { text, modelUsed: 'groq/' + model.name, fallbackUsed: true };
}

// Track which individual Groq models are TPM-limited this session
const _groqModelFailed = {};

async function callGroq(prompt, maxTokens) {
  if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_KEY') {
    return { error: 'Groq key not configured.' };
  }
  // Try each model in priority order, skipping known-failed ones
  for (const model of GROQ_MODELS) {
    if (_groqModelFailed[model.id]) continue; // skip this session
    const result = await callGroqModel(prompt, maxTokens, model);
    if (!result.error) return result;
    if (isRateLimit(result.error)) {
      _groqModelFailed[model.id] = true; // mark only this model as failed
      console.warn('[ai-core] Groq model ' + model.name + ' TPM-limited, trying next');
      continue;
    }
    if (result.error.includes('not found') || result.error.includes('404')) {
      _groqModelFailed[model.id] = true;
      continue;
    }
    return result; // other error — stop
  }
  return { error: 'All Groq models rate-limited.' };
}

// ── Provider 3: Gemini ───────────────────────
async function callGemini(prompt, maxTokens) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_KEY') {
    return { error: 'Gemini key not configured.' };
  }
  let res, data;
  try {
    res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: Math.min(maxTokens, 8192),
            temperature: 0.7,
          },
        }),
      },
      30000 // 30s timeout for Gemini
    );
  } catch(e) {
    return { error: 'Gemini network error: ' + e.message };
  }
  try { data = await res.json(); } catch(e) {
    return { error: 'Gemini invalid response (HTTP ' + res.status + ')' };
  }
  if (data.error) {
    return { error: 'Gemini: ' + (data.error.message || JSON.stringify(data.error)) };
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return { error: 'Gemini: no content returned.' };
  return { text, modelUsed: 'gemini-2.5-flash', fallbackUsed: true };
}

// ── Call with a specific model from the pool ─
// Handles 'gemini' as a special route, otherwise forces that Groq model
export async function callAIWithModel(prompt, poolModel, maxTokens = 4000) {
  if (poolModel === 'gemini') {
    return await callGemini(prompt, maxTokens);
  }
  // Force a specific Groq model directly
  if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_KEY') {
    return callAI(prompt, true, 'auto', maxTokens);
  }
  const model = { id: poolModel, name: poolModel.split('/').pop() };
  const result = await callGroqModel(prompt, maxTokens, model);
  if (result.error && isRateLimit(result.error)) {
    // This model is rate-limited — fall back to normal callAI chain
    _groqModelFailed[poolModel] = true;
    return callAI(prompt, true, 'auto', maxTokens);
  }
  return result;
}

// ── Session-level provider health tracking ───
// Once a provider rate-limits, skip it for the rest of the session
// This avoids wasting 2-3 seconds on a known-failed provider
const _providerFailed = { cloudflare: false, groq: false, gemini: false };

function markFailed(provider) {
  _providerFailed[provider] = true;
  console.warn(`[ai-core] ${provider} marked as rate-limited for this session`);
}

// ── Main callAI — tries providers in order ───
/**
 * callAI(prompt, silent, forceModel, maxTokens)
 * Returns: { text, modelUsed, fallbackUsed, attemptsDetail } | { error }
 *
 * Fallback chain (skips known-failed providers instantly):
 *   Cloudflare → Groq (multi-model) → Gemini → error
 */
export async function callAI(prompt, silent = false, forceModel = 'auto', maxTokens = 4000) {
  const tone     = document.getElementById('aiTone')?.value     || 'professional';
  const category = document.getElementById('postCategory')?.value || 'Fintech';

  // ── Step 1: Cloudflare Worker ────────────────
  if (!_providerFailed.cloudflare) {
    const cfResult = await callCloudflare(prompt, tone, category, forceModel, maxTokens);
    if (!cfResult.error) return cfResult;

    if (isRateLimit(cfResult.error)) {
      markFailed('cloudflare');
      if (!silent) showToast('Cloudflare quota reached — switching to Groq…', 'info');
    } else {
      // Non-rate-limit error — return immediately, don't fall through
      return cfResult;
    }
  }

  // ── Step 2: Groq (tries multiple models) ─────
  if (!_providerFailed.groq) {
    const groqResult = await callGroq(prompt, maxTokens);
    if (!groqResult.error) {
      if (!silent && _providerFailed.cloudflare) showToast('Using Groq ✓', 'info');
      return groqResult;
    }

    if (isRateLimit(groqResult.error) || groqResult.error.includes('not configured')) {
      markFailed('groq');
      if (!silent) showToast('Groq quota reached — switching to Gemini…', 'info');
    } else {
      return groqResult;
    }
  }

  // ── Step 3: Gemini ────────────────────────────
  if (!_providerFailed.gemini) {
    const geminiResult = await callGemini(prompt, maxTokens);
    if (!geminiResult.error) {
      if (!silent) showToast('Using Gemini ✓', 'info');
      return geminiResult;
    }
    if (isRateLimit(geminiResult.error)) {
      markFailed('gemini');
    } else {
      return geminiResult;
    }
  }

  return { error: 'All AI providers rate-limited. Reset at midnight UTC or add credits.' };
}
