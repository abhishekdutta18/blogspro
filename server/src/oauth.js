/**
 * oauth.js — server-side OAuth 2.0 authorization-code flow for the blogspro-auth worker.
 *
 * Flow: /auth/login/<provider> sets a short-lived state cookie and redirects to the
 * provider; /auth/callback/<provider> checks the state, exchanges the code with the
 * client secret (never exposed to the browser) and returns a verified identity.
 *
 * Pure helpers take `fetchImpl` so they can be unit-tested without network access.
 */

export const OAUTH_STATE_COOKIE = 'bp_oauth_state';
const STATE_TTL_SECONDS = 600;
const STATE_BYTES = 32;

export const PROVIDERS = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile'
  },
  github: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email'
  }
};

const GITHUB_API = 'https://api.github.com';
const GITHUB_USER_AGENT = 'blogspro-auth';

/** Error whose `reason` is safe to show the user via ?reason=. */
export class OAuthError extends Error {
  /** @param {string} reason short machine code, e.g. "state" or "no_email" */
  constructor(reason, detail = '') {
    super(detail || reason);
    this.reason = reason;
  }
}

/** @returns {boolean} */
export function isProvider(name) {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, name);
}

/** @returns {string} URL-safe random state value. */
export function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(STATE_BYTES));
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * SameSite=Lax so the cookie survives the top-level GET back from the provider.
 * @returns {string} Set-Cookie value binding the state to one provider.
 */
export function stateCookie(provider, state) {
  return `${OAUTH_STATE_COOKIE}=${provider}.${state}; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=${STATE_TTL_SECONDS}`;
}

/** @returns {string} Set-Cookie value that deletes the state cookie. */
export function clearStateCookie() {
  return `${OAUTH_STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=0`;
}

/**
 * Checks the callback's ?state against the cookie set at login start.
 * @param {string} cookieHeader raw Cookie header
 * @returns {boolean}
 */
export function isStateValid(cookieHeader, provider, returnedState) {
  if (!returnedState) return false;
  const match = (cookieHeader || '').match(new RegExp(`(?:^|;\\s*)${OAUTH_STATE_COOKIE}=([^;]+)`));
  if (!match) return false;
  const [cookieProvider, cookieState] = match[1].split('.');
  return cookieProvider === provider && cookieState === returnedState;
}

/**
 * @param {'google'|'github'} provider
 * @param {{clientId: string, redirectUri: string, state: string}} params
 * @returns {string}
 */
export function buildAuthorizeUrl(provider, { clientId, redirectUri, state }) {
  const config = PROVIDERS[provider];
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: config.scope,
    state
  });
  if (provider === 'google') {
    query.set('response_type', 'code');
    query.set('prompt', 'select_account');
  }
  return `${config.authorizeUrl}?${query}`;
}

async function postTokenRequest(provider, { code, clientId, clientSecret, redirectUri, fetchImpl }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri
  });
  if (provider === 'google') body.set('grant_type', 'authorization_code');

  const res = await fetchImpl(PROVIDERS[provider].tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body
  });
  const data = await res.json().catch(() => ({}));
  // GitHub answers 200 with { error } on a bad code, so check both.
  if (!res.ok || data.error) throw new OAuthError('exchange', data.error_description || data.error || `HTTP ${res.status}`);
  return data;
}

/**
 * Exchanges a Google authorization code for its ID token (verify it before trusting it).
 * @returns {Promise<string>}
 */
export async function exchangeGoogleCode(params) {
  const data = await postTokenRequest('google', params);
  if (!data.id_token) throw new OAuthError('exchange', 'Google returned no id_token');
  return data.id_token;
}

/**
 * Chooses the address to trust from GitHub's /user/emails: primary+verified first,
 * then any verified one. Unverified addresses are never used (admin roles key on email).
 * @param {Array<{email: string, primary: boolean, verified: boolean}>} emails
 * @returns {string|null}
 */
export function pickGithubEmail(emails) {
  if (!Array.isArray(emails)) return null;
  const verified = emails.filter(entry => entry?.verified && entry.email);
  const primary = verified.find(entry => entry.primary);
  return (primary || verified[0])?.email ?? null;
}

async function githubGet(path, accessToken, fetchImpl) {
  const res = await fetchImpl(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': GITHUB_USER_AGENT
    }
  });
  if (!res.ok) throw new OAuthError('provider', `GitHub ${path} HTTP ${res.status}`);
  return res.json();
}

/**
 * Exchanges a GitHub code and loads the user's identity.
 * @returns {Promise<{uid: string, email: string, name: string, verified: true}>}
 */
export async function fetchGithubIdentity(params) {
  const { access_token: accessToken } = await postTokenRequest('github', params);
  if (!accessToken) throw new OAuthError('exchange', 'GitHub returned no access_token');

  const user = await githubGet('/user', accessToken, params.fetchImpl);
  const emails = await githubGet('/user/emails', accessToken, params.fetchImpl);
  const email = pickGithubEmail(emails);
  if (!email) throw new OAuthError('no_email');

  return { uid: `github:${user.id}`, email: email.toLowerCase(), name: user.name || user.login, verified: true };
}

const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

/**
 * Reads the identity from an ID token received directly from Google's token endpoint.
 * OIDC Core 3.1.3.7 allows TLS to stand in for the signature check in that case; the
 * issuer, audience and expiry are still enforced here.
 * @returns {{uid: string, email: string, name: string, verified: boolean}}
 */
export function decodeGoogleIdToken(idToken, clientId, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payloadPart = String(idToken).split('.')[1];
  if (!payloadPart) throw new OAuthError('exchange', 'Malformed Google ID token');
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    throw new OAuthError('exchange', 'Unreadable Google ID token');
  }
  if (!GOOGLE_ISSUERS.has(claims.iss) || claims.aud !== clientId || !(claims.exp > nowSeconds) || !claims.sub) {
    throw new OAuthError('exchange', 'Google ID token failed issuer/audience/expiry checks');
  }
  if (!claims.email) throw new OAuthError('no_email');
  return {
    uid: `google:${claims.sub}`,
    email: String(claims.email).toLowerCase(),
    name: claims.name || '',
    verified: claims.email_verified === true
  };
}
