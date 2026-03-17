// ═══════════════════════════════════════════════
// js/firebase-init.js — delegate to firebase.js
// DO NOT reinitialise Firebase here — firebase.js
// already owns the single app instance.
// ═══════════════════════════════════════════════
export { auth, db, remoteConfig } from './firebase.js';
