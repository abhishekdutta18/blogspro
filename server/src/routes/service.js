/**
 * routes/service.js — /api/service/data/<collection>[/<id>] for the pipeline and the Cloudflare
 * workers, which used to talk to Firestore directly.
 *
 * Callers authenticate with `Authorization: Bearer <SERVICE_TOKEN>` instead of a session cookie.
 * Browsers never attach that header on their own, so these routes skip the cookie/Origin CSRF
 * check that guards the session-based /api/data routes. Account data stays out of reach: the
 * users collection lives in its own table and is refused here.
 *
 *   GET    /api/service/data/<col>?orderBy=<field [desc]>&limit=<n>&where=<field>:<value>
 *   GET    /api/service/data/<col>/<id>
 *   POST   /api/service/data/<col>           create with a generated id
 *   PUT    /api/service/data/<col>/<id>      merge, creating when missing (Firestore set+merge)
 *   DELETE /api/service/data/<col>/<id>
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpError, readJson, sendJson, clientIp } from '../http.js';
import { isValidCollection } from '../permissions.js';

const PREFIX = '/api/service/data/';
const MAX_ID_LENGTH = 200;
const REFUSED_COLLECTIONS = new Set(['users', 'sessions']);

const digest = value => createHash('sha256').update(String(value)).digest();

/** Constant-time comparison of the presented bearer token with the configured one. */
function isValidToken(header, expected) {
  const match = /^Bearer (.+)$/.exec(header || '');
  return Boolean(match) && timingSafeEqual(digest(match[1]), digest(expected));
}

function parsePath(pathname) {
  const [collection, id, extra] = pathname.slice(PREFIX.length).split('/').filter(Boolean).map(decodeURIComponent);
  if (!isValidCollection(collection) || REFUSED_COLLECTIONS.has(collection) || extra !== undefined) {
    throw new HttpError(404, 'Not found');
  }
  if (id !== undefined && (id.length > MAX_ID_LENGTH || id.includes('\0'))) throw new HttpError(400, 'Invalid id.');
  return { collection, id };
}

/**
 * where=status:active (repeatable) → every condition must hold. Values compare as strings,
 * so where=published:true matches the boolean true as well as the string "true".
 */
function whereFilter(params) {
  const conditions = params.getAll('where').map(clause => {
    const split = clause.indexOf(':');
    if (split < 1) throw new HttpError(400, 'where must look like field:value.');
    return [clause.slice(0, split), clause.slice(split + 1)];
  });
  return doc => conditions.every(([field, value]) => doc[field] !== undefined && String(doc[field]) === value);
}

async function serveCollection(ctx, collection, id) {
  const { method } = ctx.req;
  const { documents, res, url } = ctx;
  if (method === 'GET' && !id) {
    const options = { orderBy: url.searchParams.get('orderBy'), limit: url.searchParams.get('limit') };
    return sendJson(res, 200, documents.list(collection, { ...options, filter: whereFilter(url.searchParams) }));
  }
  if (method === 'GET') {
    const doc = documents.get(collection, id);
    if (!doc) throw new HttpError(404, 'Not found');
    return sendJson(res, 200, doc);
  }
  if (method === 'POST' && !id) return sendJson(res, 201, documents.create(collection, await readJson(ctx.req)));
  if ((method === 'PUT' || method === 'PATCH') && id) {
    return sendJson(res, 200, documents.upsert(collection, id, await readJson(ctx.req)));
  }
  if (method === 'DELETE' && id) {
    if (!documents.remove(collection, id)) throw new HttpError(404, 'Not found');
    return sendJson(res, 200, { success: true });
  }
  throw new HttpError(405, 'Method not allowed.');
}

/** @returns {Promise<boolean>} true when the request was handled */
export async function handleService(ctx) {
  if (!ctx.url.pathname.startsWith('/api/service/')) return false;
  // Unset token: the service API is off, and looks the same as any unknown path.
  if (!ctx.config.serviceToken) throw new HttpError(404, 'Not found');
  if (!isValidToken(ctx.req.headers.authorization, ctx.config.serviceToken)) {
    if (!ctx.limits.service.allow(clientIp(ctx.req))) throw new HttpError(429, 'Too many requests. Try again later.');
    throw new HttpError(401, 'Service token required.');
  }
  if (!ctx.url.pathname.startsWith(PREFIX)) throw new HttpError(404, 'Not found');
  const { collection, id } = parsePath(ctx.url.pathname);
  await serveCollection(ctx, collection, id);
  return true;
}
