// ═══════════════════════════════════════
// state.js — Global CMS State
// ═══════════════════════════════════════

export const state = {

  // All blog posts
  allPosts: JSON.parse(localStorage.getItem("blogspro_posts") || "[]"),

  // Current editor post
  currentPostId: null,

  // Subscribers list
  subscribers: JSON.parse(localStorage.getItem("blogspro_subscribers") || "[]")

};


// Save posts helper
export function savePosts() {
  localStorage.setItem("blogspro_posts", JSON.stringify(state.allPosts));
}


// Save subscribers helper
export function saveSubscribers() {
  localStorage.setItem("blogspro_subscribers", JSON.stringify(state.subscribers));
}
