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
         s.includes('limit exceeded') || s.includes('429');
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
const GROQ_MODELS = [
  { id: 'moonshotai/kimi-k2-instruct',   name: 'Kimi K2'          },  // 1T MoE, top quality
  { id: 'openai/gpt-oss-120b',           name: 'GPT-OSS 120B'     },  // OpenAI open-weight
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout' },
  { id: 'qwen/qwen3-32b',                name: 'Qwen3 32B'        },
  { id: 'llama-3.3-70b-versatile',       name: 'Llama 3.3 70B'   },  // reliable fallback
  { id: 'mistral-sma-24b-instruct-2501', name: 'Mistral 24B'     },
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

async function callGroq(prompt, maxTokens) {
  if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_KEY') {
    return { error: 'Groq key not configured.' };
  }
  // Try each model in priority order
  for (const model of GROQ_MODELS) {
    const result = await callGroqModel(prompt, maxTokens, model);
    if (!result.error) return result;
    // Only fall through if it's a model-not-found or rate-limit error
    if (!result.error.includes('not found') && !isRateLimit(result.error)) {
      return result; // real error — stop trying
    }
    console.warn('Groq model ' + model.name + ' failed, trying next:', result.error);
  }
  return { error: 'All Groq models failed or rate-limited.' };
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
