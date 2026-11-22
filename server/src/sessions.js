/**
 * sessions.js — server-side sessions. The browser holds a random token in an HttpOnly
 * cookie; the database stores only its SHA-256, so a database leak doesn't leak sessions.
 */
import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'bp_sid';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;

const hashToken = token => createHash('sha256').update(token).digest('hex');

/** @param {import('node:sqlite').DatabaseSync} db */
export function createSessionStore(db, now = () => Date.now()) {
  const insert = db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)');
  const find = db.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?');
  const remove = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const removeForUser = db.prepare('DELETE FROM sessions WHERE user_id = ?');
  const purge = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

  return {
    /** @returns {string} new session token */
    create(userId) {
      const token = randomBytes(TOKEN_BYTES).toString('base64url');
      const time = now();
      insert.run(hashToken(token), userId, time + SESSION_TTL_MS, time);
      return token;
    },
    /** @returns {string|null} user id for a live session */
    userIdFor(token) {
      if (!token) return null;
      return find.get(hashToken(token), now())?.user_id ?? null;
    },
    revoke(token) {
      if (token) remove.run(hashToken(token));
    },
    revokeAllForUser(userId) {
      removeForUser.run(userId);
    },
    purgeExpired() {
      purge.run(now());
    }
  };
}

/** @returns {string} Set-Cookie value */
export function sessionCookie(token, { secure }) {
  return `${SESSION_COOKIE}=${token}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}

/** @returns {string} Set-Cookie value that ends the session */
export function clearSessionCookie({ secure }) {
  return `${SESSION_COOKIE}=; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Path=/; Max-Age=0`;
}

/** @returns {string|null} */
export function readCookie(header, name) {
  const match = (header || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}
