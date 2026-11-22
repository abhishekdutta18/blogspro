/**
 * permissions.js — who may read and write which collection. Pure functions; see
 * docs/vps-api-design.md for the table they implement.
 */

export const STAFF_ROLES = new Set(['admin', 'editor', 'coauthor']);
/** Readable without signing in (posts are filtered to published by the route). */
export const PUBLIC_COLLECTIONS = new Set(['posts', 'site', 'settings', 'pulse_briefings', 'articles']);
const ADMIN_ONLY = new Set(['users', 'subscribers']);
const STAFF_WRITABLE = new Set(['posts']);
const COLLECTION_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export const isValidCollection = name => COLLECTION_PATTERN.test(name || '');
const isAdmin = user => user?.role === 'admin';
const isStaff = user => STAFF_ROLES.has(user?.role);

/** @param {{id: string, role: string}|null} user */
export function canRead(user, collection, docId) {
  if (!user) return false;
  if (collection === 'users' && docId === user.id) return true;
  if (ADMIN_ONLY.has(collection)) return isAdmin(user);
  return isStaff(user);
}

/** Writes include create, update and delete. */
export function canWrite(user, collection, docId) {
  if (!user) return false;
  if (collection === 'users' && docId === user.id) return true;
  if (STAFF_WRITABLE.has(collection)) return isStaff(user);
  return isAdmin(user);
}
