// ═══════════════════════════════════════════════
// ai-core.js — Single AI call gateway
// ALL AI features go through callAI(). 
// To change model/provider, edit only this file.
// ═══════════════════════════════════════════════
import { WORKER_URL } from './config.js';
import { showToast }  from './config.js';

/**
 * callAI(prompt, silent, forceModel, maxTokens)
 * Returns: { text, modelUsed, fallbackUsed, attemptsDetail } | { error }
 */
export async function callAI(prompt, silent = false, forceModel = 'auto', maxTokens = 4000) {
  const tone     = document.getElementById('aiTone')?.value     || 'professional';
  const category = document.getElementById('postCategory')?.value || 'Fintech';

  let res, data;
  try {
    res = await fetch(WORKER_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prompt, tone, category, forceModel, maxTokens }),
    });
  } catch(e) {
    return { error: 'Network error: ' + e.message };
  }

  try { data = await res.json(); }
  catch(e) { return { error: 'Invalid response (HTTP ' + res.status + ')' }; }

  if (data.error) {
    return {
      error: typeof data.error === 'object'
        ? (data.error.message || JSON.stringify(data.error))
        : String(data.error),
      attemptsDetail: data.attempts_detail || [],
    };
  }

  if (!data.text) return { error: 'No content returned.' };

  return {
    text:           data.text,
    modelUsed:      data.model_used      || 'unknown',
    fallbackUsed:   !!data.fallback_used,
    attemptsDetail: data.attempts_detail || [],
  };
}
