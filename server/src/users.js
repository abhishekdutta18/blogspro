/**
 * users.js — account storage and the rules for who becomes admin.
 */
import { randomUUID } from 'node:crypto';

export const ROLES = new Set(['reader', 'editor', 'coauthor', 'admin']);
export const REQUESTABLE_ROLES = new Set(['editor', 'coauthor']);
const MAX_NAME = 120;
const MAX_BIO = 1000;
const MAX_URL = 500;
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Fields the admin panel renders with innerHTML must never carry markup. */
const hasMarkup = value => /[<>]/.test(value);

/** @returns {string|null} problem with a profile text field, or null */
export function textProblem(label, value, max) {
  if (typeof value !== 'string') return `${label} must be text.`;
  if (value.length > max) return `${label} is too long.`;
  if (hasMarkup(value)) return `${label} can't contain < or >.`;
  return null;
}

export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_PATTERN.test(email);
}

/** Public shape used by the admin panel and /auth/me. Never includes the password hash. */
export function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    uid: row.id,
    email: row.email,
    name: row.name,
    bio: row.bio,
    photoURL: row.photo_url,
    role: row.role,
    requestedRole: row.requested_role,
    provider: row.provider,
    emailVerified: row.email_verified === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** @param {import('node:sqlite').DatabaseSync} db */
export function createUserRepository(db, { adminEmails }) {
  const admins = new Set(adminEmails);
  const byId = db.prepare('SELECT * FROM users WHERE id = ?');
  const byEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const all = db.prepare('SELECT * FROM users ORDER BY created_at DESC');
  const insert = db.prepare(`INSERT INTO users
    (id, email, name, password_hash, role, requested_role, provider, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const remove = db.prepare('DELETE FROM users WHERE id = ?');
  const nowIso = () => new Date().toISOString();

  /** The allow-list grants admin only to an address the identity provider verified. */
  const isVerifiedAdmin = (email, emailVerified) => emailVerified && admins.has(String(email).toLowerCase());

  function update(id, fields) {
    const columns = { name: 'name', bio: 'bio', photoURL: 'photo_url', role: 'role', requestedRole: 'requested_role',
      passwordHash: 'password_hash', emailVerified: 'email_verified', provider: 'provider' };
    const entries = Object.entries(fields).filter(([key]) => columns[key]);
    if (entries.length === 0) return byId.get(id);
    const assignments = entries.map(([key]) => `${columns[key]} = ?`).join(', ');
    const values = entries.map(([key, value]) => (key === 'emailVerified' ? (value ? 1 : 0) : value));
    db.prepare(`UPDATE users SET ${assignments}, updated_at = ? WHERE id = ?`).run(...values, nowIso(), id);
    return byId.get(id);
  }

  return {
    findById: id => byId.get(id) ?? null,
    findByEmail: email => byEmail.get(String(email).trim()) ?? null,
    list: () => all.all(),
    update,
    remove: id => remove.run(id).changes > 0,

    /** Password sign-up. Always a reader; a contributor role is stored as a request. */
    createPasswordUser({ email, name, passwordHash, requestedRole }) {
      const id = randomUUID();
      const time = nowIso();
      const request = REQUESTABLE_ROLES.has(requestedRole) ? requestedRole : null;
      insert.run(id, email.trim().toLowerCase(), name.trim(), passwordHash, 'reader', request, 'password', 0, time, time);
      return byId.get(id);
    },

    /**
     * Google/GitHub sign-in. Links to an existing account with the same email. If that account
     * was an unverified password sign-up, its password is cleared: whoever registered it may not
     * own the address (account pre-hijacking). Returns { user, wasUnverified }.
     */
    upsertVerifiedUser({ email, name, provider }) {
      const existing = byEmail.get(email);
      const role = isVerifiedAdmin(email, true) ? 'admin' : null;
      if (existing) {
        const wasUnverified = existing.email_verified !== 1;
        const fields = { emailVerified: true, ...(role ? { role } : {}) };
        if (wasUnverified) Object.assign(fields, { passwordHash: null, provider });
        if (!existing.name && name) fields.name = String(name).replace(/[<>]/g, '').slice(0, MAX_NAME);
        return { user: update(existing.id, fields), wasUnverified };
      }
      const id = randomUUID();
      const time = nowIso();
      const safeName = String(name || '').replace(/[<>]/g, '').slice(0, MAX_NAME);
      insert.run(id, email.toLowerCase(), safeName, null, role || 'reader', null, provider, 1, time, time);
      return { user: byId.get(id), wasUnverified: false };
    }
  };
}

export const LIMITS = Object.freeze({ MAX_NAME, MAX_BIO, MAX_URL });
