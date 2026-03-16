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
    res = await fetch(WORKER_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prompt, tone, category, forceModel, maxTokens }),
    });
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
async function callGroq(prompt, maxTokens) {
  if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_KEY') {
    return { error: 'Groq key not configured.' };
  }
  let res, data;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY,
      },
      body: JSON.stringify({
        model:      'llama-3.3-70b-versatile',
        messages:   [{ role: 'user', content: prompt }],
        max_tokens: Math.min(maxTokens, 8000),
        temperature: 0.7,
      }),
    });
  } catch(e) {
    return { error: 'Groq network error: ' + e.message };
  }
  try { data = await res.json(); } catch(e) {
    return { error: 'Groq invalid response (HTTP ' + res.status + ')' };
  }
  if (data.error) {
    return { error: 'Groq: ' + (data.error.message || JSON.stringify(data.error)) };
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) return { error: 'Groq: no content returned.' };
  return { text, modelUsed: 'groq/llama-3.3-70b', fallbackUsed: true };
}

// ── Provider 3: Gemini ───────────────────────
async function callGemini(prompt, maxTokens) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_KEY') {
    return { error: 'Gemini key not configured.' };
  }
  let res, data;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
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
      }
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
  return { text, modelUsed: 'gemini-2.0-flash', fallbackUsed: true };
}

// ── Main callAI — tries providers in order ───
/**
 * callAI(prompt, silent, forceModel, maxTokens)
 * Returns: { text, modelUsed, fallbackUsed, attemptsDetail } | { error }
 *
 * Fallback chain:
 *   Cloudflare → (rate limit?) → Groq → (rate limit?) → Gemini → error
 */
export async function callAI(prompt, silent = false, forceModel = 'auto', maxTokens = 4000) {
  const tone     = document.getElementById('aiTone')?.value     || 'professional';
  const category = document.getElementById('postCategory')?.value || 'Fintech';

  // ── Step 1: Cloudflare Worker ────────────────
  const cfResult = await callCloudflare(prompt, tone, category, forceModel, maxTokens);
  if (!cfResult.error) return cfResult;

  // Only fall through if it's a rate-limit / quota error
  if (!isRateLimit(cfResult.error)) {
    // Non-rate-limit error (network down, config issue) — return immediately
    return cfResult;
  }

  if (!silent) showToast('Cloudflare quota reached — trying Groq…', 'info');
  console.warn('Cloudflare rate-limited, falling back to Groq:', cfResult.error);

  // ── Step 2: Groq ─────────────────────────────
  const groqResult = await callGroq(prompt, maxTokens);
  if (!groqResult.error) {
    if (!silent) showToast('Using Groq (fallback)', 'info');
    return groqResult;
  }

  if (!isRateLimit(groqResult.error) && !groqResult.error.includes('not configured')) {
    return groqResult;
  }

  if (!silent) showToast('Groq quota reached — trying Gemini…', 'info');
  console.warn('Groq failed, falling back to Gemini:', groqResult.error);

  // ── Step 3: Gemini ────────────────────────────
  const geminiResult = await callGemini(prompt, maxTokens);
  if (!geminiResult.error) {
    if (!silent) showToast('Using Gemini (fallback)', 'info');
    return geminiResult;
  }

  // All providers failed
  const allFailed = `All AI providers failed.\n• Cloudflare: ${cfResult.error}\n• Groq: ${groqResult.error}\n• Gemini: ${geminiResult.error}`;
  console.error(allFailed);
  return { error: 'All providers rate-limited or unavailable. Try again tomorrow.' };
}
