// ═══════════════════════════════════════════════════════════════════
// js/collections.js — Firestore collection names as frozen constants
//
// WHY: The string 'posts' appears in 7 separate JS files today.
//      A typo like 'post' fails silently at runtime with no error —
//      Firestore just returns empty results.
//      With COLL.POSTS, a typo fails at import time immediately.
//
// USAGE:
//   import { COLL } from './collections.js';
//   const snap = await getDocs(collection(db, COLL.POSTS));
//
// VERIFIED against all collection(db, ...) calls in the codebase.
// ═══════════════════════════════════════════════════════════════════

export const COLL = Object.freeze({
  POSTS:       'posts',        // main content collection
  SUBSCRIBERS: 'subscribers',  // newsletter subscriber emails
  USERS:       'users',        // user profiles + roles
  AI_MEMORY:   'ai_memory',   // successful AI prompt patterns (ai-memory.js)
});
