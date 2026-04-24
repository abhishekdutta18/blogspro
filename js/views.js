// ═══════════════════════════════════════════════
// views.js — View counter utilities (Proxy-based)
// Increment: called from post.html on every load
// Read: used in admin table + index.html cards
// ═══════════════════════════════════════════════
import { api } from './services/api.js';

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
    // Fetch current post via proxy
    const post = await api.data.get('posts', postId);
    if (!post) return;

    // Standard increment (Note: Not atomic, but sufficient for views)
    const newViews = (post.views || 0) + 1;
    await api.data.update('posts', postId, { views: newViews });
  } catch(e) {
    // Non-fatal — view count fails silently
    console.warn('View track failed:', e.message);
  }
}

/**
 * Format a view count for display.
 * 1200 → "1.2k" | 999 → "999" | undefined → "0"
 */
export function formatViews(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}
