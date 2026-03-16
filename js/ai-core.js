// ═══════════════════════════════════════════════
// ai-core.js — AI call gateway with fallback chain
//
// Priority order:
//   1. Cloudflare Worker (your primary — full model routing)
//   2. Groq             (free, 1000 req/day)
//   3. Gemini           (Google free tier, 1000 req/day)
//
// To enable fallbacks:
//   1. Get a free Groq key at console.groq.com (no card needed)
//   2. Get a free Gemini key at aistudio.google.com (no card needed)
//   3. Set them in config.js:
//        export const GROQ_API_KEY   = "gsk_...";
//        export const GEMINI_API_KEY = "AIza...";
// ═══════════════════════════════════════════════

import { WORKER_URL, GROQ_API_KEY, GEMINI_API_KEY } from './config.js';
import { showToast } from './config.js';

// ── Fetch with timeout ───────────────────────
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

// ── Rate-limit / daily-limit detection ───────
function isRateLimit(errorStr) {
  if (!errorStr) return false;
  const s = errorStr.toLowerCase();
  return s.includes('rate limit') || s.includes('credits') ||
         s.includes('quota') || s.includes('too many') ||
         s.includes('limit exceeded') || s.includes('429') ||
         s.includes('tokens per minute') || s.includes('tpm') ||
         s.includes('please try again') || s.includes('upgrade') ||
         s.includes('per-day') || s.includes('per day') ||
         s.includes('daily') || s.includes('free model');
}

function isDailyLimit(errorStr) {
  if (!errorStr) return false;
  const s = errorStr.toLowerCase();
  return s.includes('per-day') || s.includes('per day') ||
         s.includes('daily') || s.includes('free model') ||
         s.includes('free-models');
}

// ── Provider 1: Cloudflare Worker ────────────
async function callCloudflare(prompt, tone, category, forceModel, maxTokens) {
  let res, data;
  try {
    res = await fetchWithTimeout(WORKER_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prompt, tone, category, forceModel, maxTokens }),
    }, 20000);
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
// Only verified working models on Groq free tier (confirmed 2026)
// Removed: llama-4-maverick, llama-4-scout, qwen3-32b, kimi-k2, mistral-saba (all 404/unavailable)

export const ARTICLE_MODEL_POOL = [
  'llama-3.3-70b-versatile',          // Best quality, highest TPM
  'deepseek-r1-distill-llama-70b',    // Strong reasoning model
  'llama-3.3-70b-versatile',          // Double weight — most reliable anchor
  'llama3-70b-8192',                  // Llama 3 70B (stable fallback)
  'mixtral-8x7b-32768',               // Mixtral — long context
  'llama-3.3-70b-versatile',          // Triple weight
  'gemma2-9b-it',                     // Google Gemma 2
  'gemini',                           // Gemini (special: routes to callGemini)
];

let _poolIndex = 0;
export function getNextPoolModel() {
  const model = ARTICLE_MODEL_POOL[_poolIndex % ARTICLE_MODEL_POOL.length];
  _poolIndex++;
  return model;
}
export function resetModelPool() { _poolIndex = 0; }

// Verified Groq free-tier models only
const GROQ_MODELS = [
  { id: 'llama-3.3-70b-versatile',         name: 'Llama 3.3 70B'        },  // best quality + highest TPM
  { id: 'deepseek-r1-distill-llama-70b',   name: 'DeepSeek R1 70B'      },  // strong reasoning
  { id: 'llama3-70b-8192',                 name: 'Llama 3 70B'          },  // stable fallback
  { id: 'mixtral-8x7b-32768',              name: 'Mixtral 8x7B'         },  // long context
  { id: 'llama-3.1-8b-instant',            name: 'Llama 3.1 8B Instant' },  // fastest, lowest TPM usage
  { id: 'gemma2-9b-it',                    name: 'Gemma 2 9B'           },  // Google model via Groq
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
    }, 30000);
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

// Track which individual Groq models are failed this session
const _groqModelFailed = {};

async function callGroq(prompt, maxTokens) {
  if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_KEY') {
    return { error: 'Groq key not configured.' };
  }
  for (const model of GROQ_MODELS) {
    if (_groqModelFailed[model.id]) continue;
    const result = await callGroqModel(prompt, maxTokens, model);
    if (!result.error) return result;

    // Account-level daily limit — no point trying other models, bail immediately
    if (isDailyLimit(result.error)) {
      console.warn('[ai-core] Groq daily free-model limit hit — skipping to Gemini');
      return { error: result.error };
    }
    // TPM / per-model rate limit — try the next model
    if (isRateLimit(result.error)) {
      _groqModelFailed[model.id] = true;
      console.warn('[ai-core] Groq model ' + model.name + ' TPM-limited, trying next');
      continue;
    }
    // Model not found / no access — skip silently
    if (result.error.includes('not found') || result.error.includes('404') ||
        result.error.includes('does not exist') || result.error.includes('no access')) {
      _groqModelFailed[model.id] = true;
      console.warn('[ai-core] Groq model ' + model.name + ' unavailable, skipping');
      continue;
    }
    return result; // other unexpected error — stop and report
  }
  return { error: 'All Groq models exhausted.' };
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
      30000
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
export async function callAIWithModel(prompt, poolModel, maxTokens = 4000) {
  if (poolModel === 'gemini') {
    return await callGemini(prompt, maxTokens);
  }
  if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_KEY') {
    return callAI(prompt, true, 'auto', maxTokens);
  }
  const model = { id: poolModel, name: poolModel.split('/').pop() };
  const result = await callGroqModel(prompt, maxTokens, model);
  if (result.error) {
    // Mark model as failed and fall back to full callAI chain
    _groqModelFailed[poolModel] = true;
    return callAI(prompt, true, 'auto', maxTokens);
  }
  return result;
}

// ── Session-level provider health tracking ───
const _providerFailed = { cloudflare: false, groq: false, gemini: false };

function markFailed(provider) {
  _providerFailed[provider] = true;
  console.warn('[ai-core] ' + provider + ' marked as failed for this session');
}

// ── Main callAI — tries providers in order ───
/**
 * callAI(prompt, silent, forceModel, maxTokens)
 * Returns: { text, modelUsed, fallbackUsed, attemptsDetail } | { error }
 *
 * Fallback chain: Cloudflare -> Groq (multi-model) -> Gemini -> error
 */
export async function callAI(prompt, silent = false, forceModel = 'auto', maxTokens = 4000) {
  const tone     = document.getElementById('aiTone')?.value     || 'professional';
  const category = document.getElementById('postCategory')?.value || 'Fintech';

  // ── Step 1: Cloudflare Worker ────────────────
  if (!_providerFailed.cloudflare) {
    const cfResult = await callCloudflare(prompt, tone, category, forceModel, maxTokens);
    if (!cfResult.error) return cfResult;

    markFailed('cloudflare');
    if (!silent) {
      const msg = isRateLimit(cfResult.error)
        ? 'Cloudflare quota reached, switching to Groq...'
        : 'Cloudflare unavailable, switching to Groq...';
      showToast(msg, 'info');
    }
    console.warn('[ai-core] Cloudflare failed, falling back to Groq. Error:', cfResult.error);
  }

  // ── Step 2: Groq (tries multiple models) ─────
  if (!_providerFailed.groq) {
    const groqResult = await callGroq(prompt, maxTokens);
    if (!groqResult.error) {
      if (!silent) showToast('Using Groq', 'info');
      return groqResult;
    }

    markFailed('groq');
    if (!silent) {
      const msg = isDailyLimit(groqResult.error)
        ? 'Groq daily limit reached, switching to Gemini...'
        : 'Groq unavailable, switching to Gemini...';
      showToast(msg, 'info');
    }
    console.warn('[ai-core] Groq failed, falling back to Gemini. Error:', groqResult.error);
  }

  // ── Step 3: Gemini ────────────────────────────
  if (!_providerFailed.gemini) {
    const geminiResult = await callGemini(prompt, maxTokens);
    if (!geminiResult.error) {
      if (!silent) showToast('Using Gemini', 'info');
      return geminiResult;
    }
    markFailed('gemini');
    console.warn('[ai-core] Gemini failed. Error:', geminiResult.error);
  }

  return { error: 'All AI providers failed. Check your API keys or try again later.' };
}
