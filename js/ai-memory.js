// ═══════════════════════════════════════════════
// ai-memory.js — AI Memory + Learning System
// Features: #18, #19, #28
// Stores successful AI prompt patterns in Firestore
// so future calls get progressively better over time.
// ═══════════════════════════════════════════════
import { db } from './config.js';
import {
  collection, addDoc, getDocs,
  query, orderBy, limit, where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const MEMORY_COLLECTION = 'ai_memory';
const SUCCESS_THRESHOLD = 70;

// ── Save a pattern after each scored AI call ──────────────
// Call this after any AI action that returns a quality score.
// Example: savePattern(prompt, result, qualityScore)
export async function savePattern(prompt, result, score) {
  try {
    await addDoc(collection(db, MEMORY_COLLECTION), {
      promptSnippet: prompt.substring(0, 200),
      success:       score > SUCCESS_THRESHOLD,
      score,
      provider:      result.provider || 'unknown',
      createdAt:     new Date()
    });
  } catch (err) {
    // Fail silently — memory is optional, never block the main flow
    console.warn('[ai-memory] savePattern failed:', err.message);
  }
}

// ── Get recent successful prompt patterns ─────────────────
// Returns an array of prompt snippets from past successful calls.
// Used to prepend context to new prompts.
export async function getSuccessPatterns(lmt = 5) {
  try {
    const snap = await getDocs(query(
      collection(db, MEMORY_COLLECTION),
      where('success', '==', true),
      orderBy('createdAt', 'desc'),
      limit(lmt)
    ));
    return snap.docs.map(d => d.data().promptSnippet);
  } catch (err) {
    console.warn('[ai-memory] getSuccessPatterns failed:', err.message);
    return [];
  }
}

// ── Enhance a prompt with past successful patterns ────────
// Drop-in replacement — pass your prompt in, get enhanced prompt back.
// Falls back to the original prompt if memory is empty or fails.
export async function enhancePrompt(prompt) {
  const patterns = await getSuccessPatterns(3);
  if (!patterns.length) return prompt;
  return `Successful patterns from past:\n${patterns.join('\n')}\n\nTask:\n${prompt}`;
}
