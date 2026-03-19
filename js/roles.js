// ═══════════════════════════════════════════════════════════════════
// js/roles.js — User role strings as frozen constants
//
// WHY: The string 'admin' is hardcoded across 20+ files today.
//      A typo like 'Admin' or 'admim' passes silently —
//      the user gets redirected to login with no explanation.
//      With ROLES.ADMIN, a typo is a ReferenceError at import time.
//
// USAGE:
//   import { ROLES } from './roles.js';
//   if (role !== ROLES.ADMIN) { signOut(); return; }
//
// VERIFIED against all role checks in auth.js, users.js,
// account.html, and dashboard.html.
// ═══════════════════════════════════════════════════════════════════

export const ROLES = Object.freeze({
  ADMIN:    'admin',     // full access — auth.js role check
  EDITOR:   'editor',   // write + publish
  COAUTHOR: 'coauthor', // write only
  READER:   'reader',   // read-only registered user
});

// ── Role display labels (used in users.js and account.html) ─────────
export const ROLE_LABELS = Object.freeze({
  [ROLES.ADMIN]:    'Admin',
  [ROLES.EDITOR]:   'Editor',
  [ROLES.COAUTHOR]: 'Co-Author',
  [ROLES.READER]:   'Reader',
});
