// ═══════════════════════════════════════════════
// ai-memory.js — AI Memory + Learning System (Proxy-based)
// Features: #18, #19, #28
// Stores successful AI prompt patterns in Firestore via Secure Proxy
// ═══════════════════════════════════════════════
import { api } from './services/api.js';

const MEMORY_COLLECTION = 'ai_memory';
const SUCCESS_THRESHOLD = 70;

const recentSaves = new Set();

// ── Save a pattern after each scored AI call ──────────────
export async function savePattern(prompt, result, score) {
  const snippet = (prompt || "").substring(0, 200).trim();
  if (!snippet) return;
  
  // V16.5: Deduplication Suppression (Cynical Mode)
  if (recentSaves.has(snippet)) {
    return;
  }
  
  try {
    await api.data.create(MEMORY_COLLECTION, {
      promptSnippet: snippet,
      success:       score > SUCCESS_THRESHOLD,
      score,
      provider:      result.provider || 'unknown',
      createdAt:     new Date().toISOString()
    });
    recentSaves.add(snippet);
    if (recentSaves.size > 100) recentSaves.clear(); // Safe-purge
  } catch (err) {
    console.warn('[ai-memory] savePattern failed:', err.message);
  }
}

// ── Get recent successful prompt patterns ─────────────────
export async function getSuccessPatterns(lmt = 5) {
  try {
    const patterns = await api.data.get(MEMORY_COLLECTION, null, {
      where: 'success == true',
      orderBy: 'createdAt desc',
      limit: lmt
    });
    return (patterns || []).map(d => d.promptSnippet);
  } catch (err) {
    console.warn('[ai-memory] getSuccessPatterns failed:', err.message);
    return [];
  }
}

// ── Enhance a prompt with past successful patterns ────────
export async function enhancePrompt(prompt) {
  const patterns = await getSuccessPatterns(3);
  if (!patterns.length) return prompt;
  return `Successful patterns from past:\n${patterns.join('\n')}\n\nTask:\n${prompt}`;
}
