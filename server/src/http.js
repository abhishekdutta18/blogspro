/**
 * http.js — small helpers over node:http: JSON responses, bounded JSON bodies,
 * redirects, CSRF origin checks, a fixed-window rate limiter and JSON-line logging.
 */

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class HttpError extends Error {
  /** @param {number} status @param {string} message safe to show the user */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function log(level, message, fields = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  (level === 'error' ? process.stderr : process.stdout).write(`${line}\n`);
}

export function sendJson(res, status, body, cookies = []) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(cookies.length ? { 'Set-Cookie': cookies } : {})
  });
  res.end(payload);
}

export function redirect(res, location, cookies = []) {
  res.writeHead(303, { Location: location, 'Cache-Control': 'no-store', ...(cookies.length ? { 'Set-Cookie': cookies } : {}) });
  res.end();
}

/** @returns {Promise<object>} parsed JSON object body */
export async function readJson(req) {
  const type = req.headers['content-type'] || '';
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Send JSON.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON.');
  }
}

/**
 * Cookie sessions need CSRF protection: state-changing requests must come from the site.
 * @returns {boolean}
 */
export function isTrustedOrigin(req, allowedOrigins) {
  if (SAFE_METHODS.has(req.method)) return true;
  return allowedOrigins.includes(req.headers.origin);
}

/** nginx sets X-Real-IP; the service only listens on loopback, so the header can be trusted. */
export function clientIp(req) {
  return req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
}

/** Fixed-window limiter: at most `max` hits per key per `windowMs`. */
export function createRateLimiter({ max, windowMs }, now = () => Date.now()) {
  const windows = new Map();
  return {
    /** @returns {boolean} true when the request may proceed */
    allow(key) {
      const time = now();
      const current = windows.get(key);
      if (!current || current.resetAt <= time) {
        windows.set(key, { count: 1, resetAt: time + windowMs });
        if (windows.size > 10_000) {
          for (const [k, w] of windows) if (w.resetAt <= time) windows.delete(k);
        }
        return true;
      }
      current.count += 1;
      return current.count <= max;
    }
  };
}
