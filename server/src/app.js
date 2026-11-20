/**
 * app.js — builds the request handler: resolves the session, enforces the CSRF origin
 * check, dispatches to the auth and data routes, and turns errors into JSON.
 */
import { openDatabase } from './db.js';
import { createSessionStore, readCookie, SESSION_COOKIE } from './sessions.js';
import { createUserRepository } from './users.js';
import { createDocumentRepository } from './documents.js';
import { HttpError, sendJson, isTrustedOrigin, createRateLimiter, log } from './http.js';
import { handleAuth } from './routes/auth.js';
import { handleData } from './routes/data.js';
import { handleService } from './routes/service.js';

const MINUTE = 60_000;

/**
 * @param {ReturnType<import('./config.js').loadConfig>} config
 * @param {{fetchImpl?: typeof fetch}} [deps] injectable for tests
 */
export function createApp(config, { fetchImpl = (...args) => fetch(...args) } = {}) {
  const db = openDatabase(config.dbPath);
  const sessions = createSessionStore(db);
  const users = createUserRepository(db, { adminEmails: config.adminEmails });
  const documents = createDocumentRepository(db);
  const limits = {
    login: createRateLimiter({ max: 10, windowMs: 15 * MINUTE }),
    register: createRateLimiter({ max: 10, windowMs: 60 * MINUTE }),
    subscribe: createRateLimiter({ max: 20, windowMs: 60 * MINUTE }),
    // Counts only failed service-token attempts.
    service: createRateLimiter({ max: 20, windowMs: 15 * MINUTE })
  };

  async function handle(req, res) {
    const url = new URL(req.url, config.siteOrigin);
    try {
      if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true });
      // Bearer-token routes for the pipeline and workers: no cookies, so no CSRF origin check.
      if (await handleService({ req, res, url, config, documents, limits })) return;
      if (!isTrustedOrigin(req, config.allowedOrigins)) throw new HttpError(403, 'Cross-site request refused.');

      const userId = sessions.userIdFor(readCookie(req.headers.cookie, SESSION_COOKIE));
      const user = userId ? users.findById(userId) : null;
      const ctx = { req, res, url, config, user, users, sessions, documents, limits, fetchImpl };

      const handled = (await handleAuth(ctx)) || (await handleData(ctx));
      if (!handled) throw new HttpError(404, 'Not found');
    } catch (error) {
      if (res.headersSent) return res.end();
      if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message });
      log('error', 'Unhandled request error', { path: url.pathname, method: req.method, detail: error.stack });
      sendJson(res, 500, { error: 'Something went wrong.' });
    }
  }

  return { handle, db, users, sessions, documents };
}
