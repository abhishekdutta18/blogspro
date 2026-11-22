/**
 * routes/data.js — /api/data/* (signed-in, permission-checked), /api/public/data/* (anyone)
 * and POST /api/subscribe. Users are served from the users table; everything else from documents.
 */
import { HttpError, readJson, sendJson, clientIp } from '../http.js';
import { canRead, canWrite, isValidCollection, PUBLIC_COLLECTIONS } from '../permissions.js';
import { toPublicUser, ROLES, REQUESTABLE_ROLES, isValidEmail } from '../users.js';
import { profileFields } from './auth.js';

const isPublished = doc => doc.published === true;
const listOptions = url => ({ orderBy: url.searchParams.get('orderBy'), limit: url.searchParams.get('limit') });

function parsePath(pathname, prefix) {
  const [collection, id, extra] = pathname.slice(prefix.length).split('/').filter(Boolean).map(decodeURIComponent);
  if (!isValidCollection(collection) || extra !== undefined) throw new HttpError(404, 'Not found');
  if (id !== undefined && (id.length > 200 || id.includes('\0'))) throw new HttpError(400, 'Invalid id.');
  return { collection, id };
}

async function publicData(ctx) {
  if (ctx.req.method !== 'GET') throw new HttpError(405, 'Read only.');
  const { collection, id } = parsePath(ctx.url.pathname, '/api/public/data/');
  if (!PUBLIC_COLLECTIONS.has(collection)) throw new HttpError(404, 'Not found');
  const onlyPublished = collection === 'posts' ? isPublished : () => true;
  if (id) {
    const doc = ctx.documents.get(collection, id);
    if (!doc || !onlyPublished(doc)) throw new HttpError(404, 'Not found');
    return sendJson(ctx.res, 200, doc);
  }
  sendJson(ctx.res, 200, ctx.documents.list(collection, { ...listOptions(ctx.url), filter: onlyPublished }));
}

/** Fields an admin may set on any account, or a user on their own. */
function userFields(ctx, targetId, body) {
  const isSelf = targetId === ctx.user.id;
  if (ctx.user.role !== 'admin' || isSelf) {
    // The account pages resend the current email and role with every save; only a change is refused.
    const { updatedAt: _ignored, email, role, ...rest } = body;
    if (email !== undefined && String(email).trim().toLowerCase() !== ctx.user.email) {
      throw new HttpError(400, "Email can't be changed here.");
    }
    if (role !== undefined && role !== ctx.user.role) throw new HttpError(400, "You can't change your own role.");
    return profileFields(rest);
  }
  const fields = profileFields(Object.fromEntries(Object.entries(body).filter(([k]) => ['name', 'bio', 'photoURL'].includes(k))));
  if ('role' in body) {
    if (!ROLES.has(body.role)) throw new HttpError(400, 'Unknown role.');
    fields.role = body.role;
  }
  if ('requestedRole' in body) fields.requestedRole = REQUESTABLE_ROLES.has(body.requestedRole) ? body.requestedRole : null;
  return fields;
}

async function usersCollection(ctx, id) {
  const { method } = ctx.req;
  if (method === 'GET') {
    if (!id) return sendJson(ctx.res, 200, ctx.users.list().map(toPublicUser));
    const user = ctx.users.findById(id);
    if (!user) throw new HttpError(404, 'Not found');
    return sendJson(ctx.res, 200, toPublicUser(user));
  }
  if (!id) throw new HttpError(405, 'Accounts are created through /auth/register.');
  if (!ctx.users.findById(id)) throw new HttpError(404, 'Not found');
  if (method === 'PUT' || method === 'POST' || method === 'PATCH') {
    const fields = userFields(ctx, id, await readJson(ctx.req));
    return sendJson(ctx.res, 200, toPublicUser(ctx.users.update(id, fields)));
  }
  if (method === 'DELETE') {
    ctx.users.remove(id);
    return sendJson(ctx.res, 200, { success: true });
  }
  throw new HttpError(405, 'Method not allowed.');
}

async function privateData(ctx) {
  if (!ctx.user) throw new HttpError(401, 'Sign in required.');
  const { method } = ctx.req;
  const { collection, id } = parsePath(ctx.url.pathname, '/api/data/');
  const isWrite = method !== 'GET';

  // POST /api/data/<col>/<action> is a pipeline action (swarm, newsletter); not on the VPS yet.
  if (method === 'POST' && id) throw new HttpError(501, `"${id}" on ${collection} has not moved to the VPS yet.`);
  const allowed = isWrite ? canWrite(ctx.user, collection, id) : canRead(ctx.user, collection, id);
  if (!allowed) throw new HttpError(ctx.user ? 403 : 401, 'Forbidden');

  if (collection === 'users') return usersCollection(ctx, id);
  if (method === 'GET') {
    if (!id) return sendJson(ctx.res, 200, ctx.documents.list(collection, listOptions(ctx.url)));
    const doc = ctx.documents.get(collection, id);
    if (!doc) throw new HttpError(404, 'Not found');
    return sendJson(ctx.res, 200, doc);
  }
  if (method === 'POST') return sendJson(ctx.res, 201, ctx.documents.create(collection, await readJson(ctx.req)));
  if ((method === 'PUT' || method === 'PATCH') && id) {
    return sendJson(ctx.res, 200, ctx.documents.upsert(collection, id, await readJson(ctx.req)));
  }
  if (method === 'DELETE' && id) {
    if (!ctx.documents.remove(collection, id)) throw new HttpError(404, 'Not found');
    return sendJson(ctx.res, 200, { success: true });
  }
  throw new HttpError(405, 'Method not allowed.');
}

async function subscribe(ctx) {
  if (ctx.req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  if (!ctx.limits.subscribe.allow(clientIp(ctx.req))) throw new HttpError(429, 'Too many requests. Try again later.');
  const body = await readJson(ctx.req);
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!isValidEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
  const alreadySubscribed = Boolean(ctx.documents.get('subscribers', email));
  if (!alreadySubscribed) {
    ctx.documents.create('subscribers', { email, source: String(body.source || 'website').slice(0, 100), status: 'active' }, email);
  }
  sendJson(ctx.res, 200, { ok: true, alreadySubscribed });
}

/** @returns {Promise<boolean>} true when the request was handled */
export async function handleData(ctx) {
  const path = ctx.url.pathname;
  if (path === '/api/subscribe') return subscribe(ctx).then(() => true);
  if (path.startsWith('/api/public/data/')) return publicData(ctx).then(() => true);
  if (path.startsWith('/api/data/')) return privateData(ctx).then(() => true);
  if (path.startsWith('/api/testbench')) throw new HttpError(501, 'The test bench has not moved to the VPS yet.');
  return false;
}
