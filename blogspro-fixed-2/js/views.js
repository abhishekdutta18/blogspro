// ═══════════════════════════════════════════════
// views.js — View counter utilities
// Increment: called from post.html on every load
// Read: used in admin table + index.html cards
// ═══════════════════════════════════════════════
import { db }          from './config.js';
import { doc, updateDoc, increment }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Increment the view counter for a post.
 * Call once per page load from post.html.
 * Uses sessionStorage to avoid counting refreshes.
 */
export async function trackView(postId) {
  if (!postId) return;
  const key = `bp_viewed_${postId}`;
  // Only count once per browser session per post
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  try {
    await updateDoc(doc(db, 'posts', postId), {
      views: increment(1)
    });
  } catch(e) {
    // Non-fatal — view count fails silently
    console.warn('View track failed:', e.message);
  }
}

/**
 * Format a view count for display.
 * 1200 → "1.2k"  |  999 → "999"  |  undefined → "0"
 */
export function formatViews(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}
