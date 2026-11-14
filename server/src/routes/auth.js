/**
 * routes/auth.js — /auth/* : password and Google/GitHub sign-in, sessions, profile.
 * Error codes like INVALID_LOGIN_CREDENTIALS match the messages js/services/api.js maps.
 */
import { HttpError, readJson, sendJson, redirect, clientIp, log } from '../http.js';
import { hashPassword, verifyPassword, passwordProblem } from '../passwords.js';
import { sessionCookie, clearSessionCookie, SESSION_COOKIE, readCookie } from '../sessions.js';
import { toPublicUser, isValidEmail, textProblem, LIMITS } from '../users.js';
import {
  OAuthError, isProvider, randomState, stateCookie, clearStateCookie, isStateValid,
  buildAuthorizeUrl, exchangeGoogleCode, decodeGoogleIdToken, fetchGithubIdentity
} from '../oauth.js';
import { verifyAssertion } from '../bridge.js';

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==';

function startSession(ctx, user) {
  const token = ctx.sessions.create(user.id);
  return sessionCookie(token, { secure: ctx.config.secureCookies });
}

function requireUser(ctx) {
  if (!ctx.user) throw new HttpError(401, 'Sign in required.');
  return ctx.user;
}

async function register(ctx) {
  if (!ctx.limits.register.allow(clientIp(ctx.req))) throw new HttpError(429, 'TOO_MANY_ATTEMPTS_TRY_LATER');
  const body = await readJson(ctx.req);
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const problem = (!name && 'Name is required.') || textProblem('Name', name, LIMITS.MAX_NAME)
    || (!isValidEmail(email) && 'INVALID_EMAIL') || passwordProblem(body.password);
  if (problem) throw new HttpError(400, problem);
  if (ctx.users.findByEmail(email)) throw new HttpError(409, 'EMAIL_EXISTS');

  const user = ctx.users.createPasswordUser({
    email, name, passwordHash: await hashPassword(body.password), requestedRole: body.role ?? body.requestedRole
  });
  sendJson(ctx.res, 200, { success: true, role: user.role, user: toPublicUser(user) }, [startSession(ctx, user)]);
}

async function login(ctx) {
  const body = await readJson(ctx.req);
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email || typeof body.password !== 'string') throw new HttpError(400, 'Email and password required.');
  if (!ctx.limits.login.allow(`${clientIp(ctx.req)}|${email}`)) throw new HttpError(429, 'TOO_MANY_ATTEMPTS_TRY_LATER');

  const user = ctx.users.findByEmail(email);
  const isMatch = await verifyPassword(body.password, user?.password_hash || DUMMY_HASH);
  if (!user?.password_hash || !isMatch) throw new HttpError(401, 'INVALID_LOGIN_CREDENTIALS');
  sendJson(ctx.res, 200, { success: true, role: user.role, user: toPublicUser(user) }, [startSession(ctx, user)]);
}

function me(ctx) {
  if (!ctx.user) return sendJson(ctx.res, 200, { authenticated: false });
  // `profile` duplicates `user` for the admin pages, which read both.
  const user = toPublicUser(ctx.user);
  sendJson(ctx.res, 200, { authenticated: true, user, profile: user });
}

function logout(ctx) {
  ctx.sessions.revoke(readCookie(ctx.req.headers.cookie, SESSION_COOKIE));
  ctx.res.writeHead(204, { 'Set-Cookie': clearSessionCookie({ secure: ctx.config.secureCookies }), 'Cache-Control': 'no-store' });
  ctx.res.end();
}

async function changePassword(ctx) {
  const user = requireUser(ctx);
  const body = await readJson(ctx.req);
  const problem = passwordProblem(body.password);
  if (problem) throw new HttpError(400, problem);
  ctx.users.update(user.id, { passwordHash: await hashPassword(body.password) });
  // Other devices must sign in again with the new password.
  ctx.sessions.revokeAllForUser(user.id);
  sendJson(ctx.res, 200, { success: true }, [startSession(ctx, user)]);
}

async function updateProfile(ctx) {
  const user = requireUser(ctx);
  const body = await readJson(ctx.req);
  const fields = profileFields(body);
  sendJson(ctx.res, 200, { success: true, user: toPublicUser(ctx.users.update(user.id, fields)) });
}

/** Validated self-editable profile fields. Email and role are never self-editable. */
export function profileFields(body) {
  if ('email' in body || 'role' in body) throw new HttpError(400, "Email and role can't be changed here.");
  const fields = {};
  const checks = [['name', 'Name', LIMITS.MAX_NAME], ['bio', 'Bio', LIMITS.MAX_BIO], ['photoURL', 'Photo URL', LIMITS.MAX_URL]];
  for (const [key, label, max] of checks) {
    if (!(key in body)) continue;
    const value = String(body[key] ?? '').trim();
    const problem = textProblem(label, value, max);
    if (problem) throw new HttpError(400, problem);
    if (key === 'photoURL' && value && !/^https:\/\//.test(value)) throw new HttpError(400, 'Photo URL must start with https://');
    fields[key] = value;
  }
  return fields;
}

function oauthFail(ctx, reason) {
  redirect(ctx.res, `/login.html?error=oauth&reason=${encodeURIComponent(reason)}`, [clearStateCookie()]);
}

function oauthStart(ctx, provider) {
  const credentials = ctx.config.providers[provider];
  if (!credentials) return oauthFail(ctx, 'unavailable');
  const state = randomState();
  // Relay mode: the provider returns to the auth worker, whose callback URL is the one registered.
  const callbackOrigin = credentials.viaBridge ? ctx.config.oauthBridge.origin : ctx.config.siteOrigin;
  const redirectUri = `${callbackOrigin}/auth/callback/${provider}`;
  ctx.res.writeHead(302, {
    Location: buildAuthorizeUrl(provider, { clientId: credentials.clientId, redirectUri, state }),
    'Set-Cookie': stateCookie(provider, state),
    'Cache-Control': 'no-store'
  });
  ctx.res.end();
}

/** Signs in (or creates) the account for a provider-verified identity and opens a session. */
function finishSignIn(ctx, { email, name, provider }) {
  const { user, wasUnverified } = ctx.users.upsertVerifiedUser({ email, name, provider });
  // Sessions opened with the old, unproven password must not survive the takeover check.
  if (wasUnverified) ctx.sessions.revokeAllForUser(user.id);
  redirect(ctx.res, '/login.html', [startSession(ctx, user), clearStateCookie()]);
}

/**
 * GET /auth/bridge?a=… — the auth worker did the code exchange and signed the identity.
 * The assertion must carry the state this browser started with, so one captured from
 * another browser (or replayed after the state cookie is gone) is useless.
 */
async function oauthBridge(ctx) {
  const bridge = ctx.config.oauthBridge;
  if (!bridge) throw new HttpError(404, 'NOT_FOUND');
  const claims = await verifyAssertion(ctx.url.searchParams.get('a'), bridge.secret);
  if (!claims || !isProvider(claims.provider)) return oauthFail(ctx, 'exchange');
  if (!isStateValid(ctx.req.headers.cookie, claims.provider, claims.state)) return oauthFail(ctx, 'state');
  if (claims.verified !== true || !isValidEmail(claims.email)) return oauthFail(ctx, 'unverified');
  finishSignIn(ctx, { email: claims.email, name: claims.name, provider: claims.provider });
}

async function oauthCallback(ctx, provider) {
  const credentials = ctx.config.providers[provider];
  // In relay mode the provider never redirects here; the worker owns the callback.
  if (!credentials || credentials.viaBridge) return oauthFail(ctx, 'unavailable');
  const params = ctx.url.searchParams;
  if (params.get('error')) return oauthFail(ctx, 'denied');
  if (!isStateValid(ctx.req.headers.cookie, provider, params.get('state'))) return oauthFail(ctx, 'state');
  if (!params.get('code')) return oauthFail(ctx, 'exchange');

  try {
    const exchange = {
      code: params.get('code'), ...credentials,
      redirectUri: `${ctx.config.siteOrigin}/auth/callback/${provider}`,
      fetchImpl: ctx.fetchImpl
    };
    const identity = provider === 'google'
      ? decodeGoogleIdToken(await exchangeGoogleCode(exchange), credentials.clientId)
      : await fetchGithubIdentity(exchange);
    if (!identity.verified) return oauthFail(ctx, 'unverified');
    finishSignIn(ctx, { email: identity.email, name: identity.name, provider });
  } catch (error) {
    log('error', `OAuth ${provider} callback failed`, { detail: error.message });
    oauthFail(ctx, error instanceof OAuthError ? error.reason : 'provider');
  }
}

/** @returns {Promise<boolean>} true when the request was handled */
export async function handleAuth(ctx) {
  const { method } = ctx.req;
  const path = ctx.url.pathname;
  const oauth = path.match(/^\/auth\/(login|callback)\/([a-z]+)$/);
  if (oauth && method === 'GET' && isProvider(oauth[2])) {
    await (oauth[1] === 'login' ? oauthStart(ctx, oauth[2]) : oauthCallback(ctx, oauth[2]));
    return true;
  }
  const routes = {
    'GET /auth/bridge': oauthBridge,
    'POST /auth/register': register,
    'POST /auth/login': login,
    'GET /auth/me': me,
    'POST /auth/logout': logout,
    'POST /auth/password': changePassword,
    'PATCH /auth/profile': updateProfile
  };
  const handler = routes[`${method} ${path}`];
  if (!handler) return false;
  await handler(ctx);
  return true;
}
