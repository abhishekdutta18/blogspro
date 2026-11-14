/**
 * passwords.js — scrypt password hashing. Stored format: scrypt$N$r$p$salt$key (base64).
 */
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const COST = { N: 16384, r: 8, p: 1 };
const MAX_MEMORY = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 256;

/** @returns {string|null} a user-facing problem with the password, or null when acceptable */
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) return 'Password is too long.';
  return null;
}

/** @returns {Promise<string>} */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_LENGTH, { ...COST, maxmem: MAX_MEMORY });
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), key.toString('base64')].join('$');
}

/** @returns {Promise<boolean>} false for any malformed or non-matching hash */
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [scheme, n, r, p, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: MAX_MEMORY
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
