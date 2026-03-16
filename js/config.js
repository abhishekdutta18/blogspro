// ═══════════════════════════════════════════════
// config.js — Barrel re-exporter
//
// All other modules import from here exactly as before.
// Internally, concerns are split into focused files:
//
//   firebase.js       → Firebase app, auth, db, remoteConfig
//   remote-config.js  → AI_KEYS + loadRemoteConfig
//   utils.js          → sanitize, slugify, showToast, etc.
//   constants.js      → CLOUDINARY_CLOUD_NAME, etc.
// ═══════════════════════════════════════════════

// Firebase instances
export { auth, db }                  from './firebase.js';

// AI keys + remote config loader
export { AI_KEYS, loadRemoteConfig } from './remote-config.js';

// Utility functions
export {
  cleanEditorHTML,
  sanitize,
  slugify,
  stripTags,
  showToast,
  setBtnLoading,
  parseAIJson,
}                                    from './utils.js';

// App constants
export {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_PRESET,
}                                    from './constants.js';
