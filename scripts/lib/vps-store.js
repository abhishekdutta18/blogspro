/**
 * vps-store.js — document storage for the pipeline and the Cloudflare workers, backed by the
 * BlogsPro API on the VPS (/api/service/data). It replaces the Firestore REST calls.
 *
 * Works anywhere `fetch` exists (Node 18+, Cloudflare Workers). Configuration comes from the
 * `env` object the callers already pass around, falling back to process.env in Node:
 *   BLOGSPRO_API_URL        default https://blogspro.in
 *   BLOGSPRO_SERVICE_TOKEN  the API's SERVICE_TOKEN; without it every call is skipped
 *
 * Failures never throw: reads return null / [], writes return null, and a warning is logged,
 * matching how the pipeline treated Firestore (persistence must not abort a generation run).
 */

const DEFAULT_API_URL = 'https://blogspro.in';
const REQUEST_TIMEOUT_MS = 15_000;

let warnedMissingToken = false;

/** @param {Record<string, any>|undefined} env */
function settings(env) {
  const nodeEnv = typeof process !== 'undefined' && process.env ? process.env : {};
  const pick = key => (env && env[key]) || nodeEnv[key] || '';
  return {
    baseUrl: String(pick('BLOGSPRO_API_URL') || DEFAULT_API_URL).replace(/\/+$/, ''),
    token: String(pick('BLOGSPRO_SERVICE_TOKEN')).trim()
  };
}

/** True when the store is configured; callers use it to skip work that only feeds the store. */
export function isStoreConfigured(env) {
  return Boolean(settings(env).token);
}

function documentUrl(baseUrl, collection, id, query) {
  const parts = [baseUrl, 'api/service/data', encodeURIComponent(collection)];
  if (id !== undefined && id !== null) parts.push(encodeURIComponent(String(id)));
  const search = query && query.toString();
  return parts.join('/') + (search ? `?${search}` : '');
}

/**
 * @returns {Promise<{ok: boolean, status: number, body: any}|null>} null when unconfigured or unreachable
 */
async function request(env, method, collection, id, { body, query } = {}) {
  const { baseUrl, token } = settings(env);
  if (!token) {
    if (!warnedMissingToken) console.warn('⚠️ [VpsStore] BLOGSPRO_SERVICE_TOKEN not set; document storage skipped.');
    warnedMissingToken = true;
    return null;
  }
  const headers = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  try {
    const res = await fetch(documentUrl(baseUrl, collection, id, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    if (!res.ok && res.status !== 404) {
      console.warn(`⚠️ [VpsStore] ${method} ${collection}${id ? `/${id}` : ''} failed: ${res.status} ${parsed?.error || ''}`);
    }
    return { ok: res.ok, status: res.status, body: parsed };
  } catch (error) {
    console.warn(`⚠️ [VpsStore] ${method} ${collection}${id ? `/${id}` : ''} unreachable: ${error.message}`);
    return null;
  }
}

/** @returns {Promise<object|null>} the document, or null when missing or unreachable */
export async function getDocument(collection, id, env) {
  const res = await request(env, 'GET', collection, id);
  return res?.ok ? res.body : null;
}

/**
 * @param {{where?: Record<string, string|number|boolean>, orderBy?: string, limit?: number}} [options]
 *   where: equality on top-level fields; orderBy: "field" or "field desc"
 * @returns {Promise<object[]>}
 */
export async function listDocuments(collection, { where = {}, orderBy, limit } = {}, env) {
  const query = new URLSearchParams();
  for (const [field, value] of Object.entries(where)) query.append('where', `${field}:${value}`);
  if (orderBy) query.set('orderBy', orderBy);
  if (limit) query.set('limit', String(limit));
  const res = await request(env, 'GET', collection, null, { query });
  return res?.ok && Array.isArray(res.body) ? res.body : [];
}

/**
 * Merge `data` into collection/id, creating it when missing (Firestore set-with-merge).
 * Without an id a new document is created with a generated id.
 * @returns {Promise<object|null>} the stored document
 */
export async function saveDocument(collection, data, env, id = data?.id ?? data?.docId) {
  const res = id === undefined || id === null || id === ''
    ? await request(env, 'POST', collection, null, { body: data })
    : await request(env, 'PUT', collection, id, { body: data });
  return res?.ok ? res.body : null;
}

/**
 * Reads a public collection (posts, site, articles, …) through /api/public/data. No token is
 * needed; posts come back filtered to published ones by the API.
 * @returns {Promise<object[]|null>} the documents, or null when the API could not be read
 */
export async function listPublicDocuments(collection, { orderBy, limit } = {}, env) {
  const { baseUrl } = settings(env);
  const query = new URLSearchParams();
  if (orderBy) query.set('orderBy', orderBy);
  if (limit) query.set('limit', String(limit));
  const search = query.toString();
  const url = `${baseUrl}/api/public/data/${encodeURIComponent(collection)}${search ? `?${search}` : ''}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) {
      console.warn(`⚠️ [VpsStore] GET public ${collection} failed: ${res.status}`);
      return null;
    }
    const body = await res.json();
    return Array.isArray(body) ? body : null;
  } catch (error) {
    console.warn(`⚠️ [VpsStore] GET public ${collection} unreachable: ${error.message}`);
    return null;
  }
}

/** @returns {Promise<boolean>} true when a document was deleted */
export async function deleteDocument(collection, id, env) {
  const res = await request(env, 'DELETE', collection, id);
  return Boolean(res?.ok);
}
