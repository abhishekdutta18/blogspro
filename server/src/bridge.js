/**
 * bridge.js — signed, short-lived sign-in assertions passed from the Cloudflare auth
 * worker (which holds the OAuth client secrets and the registered callback URLs) to the
 * VPS API. Format: base64url(JSON claims) "." base64url(HMAC-SHA256).
 *
 * Web Crypto only, so the same file runs in Node 22 and in Cloudflare Workers.
 * The VPS additionally binds each assertion to the browser's OAuth state cookie.
 */

export const BRIDGE_TTL_SECONDS = 120;
const MIN_SECRET_LENGTH = 32;

const encoder = new TextEncoder();

function toB64url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromB64url(text) {
  return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
}

function hmacKey(secret, usage) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

/**
 * @param {{provider: string, email: string, name?: string, verified: boolean, state: string}} claims
 * @returns {Promise<string>}
 */
export async function signAssertion(claims, secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) throw new Error('Bridge secret is too short.');
  const body = toB64url(encoder.encode(JSON.stringify({ ...claims, exp: Math.floor(now / 1000) + BRIDGE_TTL_SECONDS })));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), encoder.encode(body));
  return `${body}.${toB64url(signature)}`;
}

/** @returns {Promise<object|null>} the claims, or null when forged, malformed or expired */
export async function verifyAssertion(token, secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) return null;
  const [body, signature, extra] = String(token || '').split('.');
  if (!body || !signature || extra !== undefined) return null;
  try {
    // crypto.subtle.verify compares in constant time.
    const isValid = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), fromB64url(signature), encoder.encode(body));
    if (!isValid) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    return claims && claims.exp > Math.floor(now / 1000) ? claims : null;
  } catch {
    return null;
  }
}
