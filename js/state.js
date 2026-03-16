// ═══════════════════════════════════════
// state.js — Global CMS state
// ═══════════════════════════════════════

export const state = {

  allPosts: JSON.parse(localStorage.getItem("blogspro_posts") || "[]"),

  currentPostId: null,

  subscribers: []

};
