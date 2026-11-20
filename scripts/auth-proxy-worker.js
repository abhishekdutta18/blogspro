/**
 * auth-proxy-worker.js — OAuth relay for the BlogsPro VPS API.
 *
 * Sign-in starts and ends on the VPS (https://blogspro.in/auth/login/<provider>). The provider
 * apps have this worker's callback URL registered, so the provider returns here; the worker
 * exchanges the code with the client secret, signs the identity the provider vouched for, and
 * sends the browser to /auth/bridge, where the VPS checks it against its own state cookie.
 *
 * Settings: GOOGLE_CLIENT_ID/SECRET, GITHUB_CLIENT_ID/SECRET, OAUTH_BRIDGE_SECRET.
 * Sessions, accounts and data live on the VPS; this worker stores nothing.
 */
import { OAuthError, isProvider, clearStateCookie, exchangeGoogleCode, fetchGithubIdentity } from "../server/src/oauth.js";
import { signAssertion } from "../server/src/bridge.js";

const SITE_ORIGIN = "https://blogspro.in";
// Where relayed sign-ins are finished: the VPS API checks the assertion against its state cookie.
const BRIDGE_TARGET = `${SITE_ORIGIN}/auth/bridge`;
const LOGIN_PAGE = `${SITE_ORIGIN}/login.html`;
const MAX_STATE_LENGTH = 128;

function fromB64url(str) {
  return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
}

let googleKeysCache = null;
async function getGooglePublicKeys() {
  if (googleKeysCache) return googleKeysCache;
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!res.ok) throw new Error("failed to fetch google keys");
  googleKeysCache = await res.json();
  return googleKeysCache;
}

async function verifyGoogleIdToken(token, clientId) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [hB64, pB64, sB64] = parts;
    const header = JSON.parse(fromB64url(hB64));
    const payload = JSON.parse(fromB64url(pB64));

    // 1. Basic Claims
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") return null;
    if (payload.aud !== clientId) return null;

    // 2. RSA Signature Check
    const keys = await getGooglePublicKeys();
    const keyData = keys.keys.find(k => k.kid === header.kid);
    if (!keyData) return null;

    const key = await crypto.subtle.importKey(
      "jwk", keyData,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false, ["verify"]
    );
    const sigBytes = Uint8Array.from(fromB64url(sB64), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key, sigBytes, new TextEncoder().encode(`${hB64}.${pB64}`)
    );
    
    if (!valid) return null;
    return {
      uid: payload.sub,
      email: payload.email,
      verified: payload.email_verified,
      name: payload.name,
      picture: payload.picture
    };
  } catch (e) {
    return null;
  }
}

function redirectWithCookies(location, cookies) {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  cookies.forEach(cookie => headers.append("Set-Cookie", cookie));
  return new Response(null, { status: 303, headers });
}

function oauthErrorRedirect(reason) {
  return redirectWithCookies(`${LOGIN_PAGE}?error=oauth&reason=${encodeURIComponent(reason)}`, [clearStateCookie()]);
}

/**
 * Relay mode: the login was started on the VPS, which holds the state cookie. This worker
 * only owns the registered callback URL and the client secret, so it exchanges the code,
 * signs who the provider vouched for (plus the returned state), and sends the browser on.
 */
async function relayToVps(provider, params, { clientId, clientSecret, redirectUri, googleId }, bridgeSecret) {
  const code = params.get("code");
  const state = params.get("state") || "";
  if (!code || !state || state.length > MAX_STATE_LENGTH) return oauthErrorRedirect("exchange");
  try {
    // Wrapped: Workers throws "Illegal invocation" when fetch is called as a method of another object.
    const exchange = { code, clientId, clientSecret, redirectUri, fetchImpl: (...args) => fetch(...args) };
    const identity = provider === "google"
      ? await verifyGoogleIdToken(await exchangeGoogleCode(exchange), googleId)
      : await fetchGithubIdentity(exchange);
    if (!identity?.email) return oauthErrorRedirect("exchange");
    const assertion = await signAssertion({
      provider, email: identity.email, name: identity.name || "", verified: identity.verified === true, state
    }, bridgeSecret);
    return redirectWithCookies(`${BRIDGE_TARGET}?a=${encodeURIComponent(assertion)}`, []);
  } catch (e) {
    console.error(`OAuth ${provider} relay failed:`, e?.message);
    return oauthErrorRedirect(e instanceof OAuthError ? e.reason : "provider");
  }
}

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function providerCredentials(provider, env) {
  return provider === "google"
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
    : { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return json({ ok: true, ts: Date.now() }, 200);

    const oauthRoute = url.pathname.match(/^\/auth\/(login|callback)\/([a-z]+)$/);
    if (!oauthRoute || req.method !== "GET" || !isProvider(oauthRoute[2])) return json({ error: "Not found" }, 404);
    const [, step, provider] = oauthRoute;

    // The VPS holds the state cookie, so every login starts there. Fixed target: no open redirect.
    if (step === "login") {
      return new Response(null, { status: 302, headers: { Location: `${SITE_ORIGIN}/auth/login/${provider}`, "Cache-Control": "no-store" } });
    }

    if (url.searchParams.get("error")) return oauthErrorRedirect("denied");
    if (!url.searchParams.get("code")) return oauthErrorRedirect("exchange");

    const { clientId, clientSecret } = providerCredentials(provider, env);
    if (!env.OAUTH_BRIDGE_SECRET || !clientId || !clientSecret) {
      console.error(`OAuth relay for ${provider} is missing its client credentials or OAUTH_BRIDGE_SECRET.`);
      return json({ error: "Sign-in is not configured." }, 503);
    }
    const redirectUri = `${url.origin}/auth/callback/${provider}`;
    return relayToVps(provider, url.searchParams, { clientId, clientSecret, redirectUri, googleId: env.GOOGLE_CLIENT_ID }, env.OAUTH_BRIDGE_SECRET);
  },
};
