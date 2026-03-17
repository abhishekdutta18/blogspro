// ═══════════════════════════════════════════════
// firebase-init.js — Re-exports Firebase instances
// Bug fix: auth was never in config.js — must come from firebase.js directly.
// db is now re-exported from config.js (which itself re-exports from firebase.js).
// ═══════════════════════════════════════════════
export { auth }    from './js/firebase.js';
export { db }      from './js/config.js';
