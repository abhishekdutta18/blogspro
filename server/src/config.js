/**
 * config.js — reads the service configuration from the environment (/etc/blogspro-api.env
 * in production). OAuth providers are enabled only when both their id and secret are set.
 */

const DEFAULT_PORT = 8787;

function parseList(value) {
  return (value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
}

/**
 * A provider is usable with its own secret (direct flow) or, when the relay is configured,
 * with just its client id: the auth worker then holds the secret and does the code exchange.
 */
function providerConfig(id, secret, hasBridge) {
  if (!id) return null;
  if (secret) return Object.freeze({ clientId: id, clientSecret: secret, viaBridge: false });
  return hasBridge ? Object.freeze({ clientId: id, clientSecret: null, viaBridge: true }) : null;
}

function bridgeConfig(env) {
  const origin = env.OAUTH_BRIDGE_ORIGIN;
  const secret = env.OAUTH_BRIDGE_SECRET;
  return origin && secret ? Object.freeze({ origin: origin.replace(/\/+$/, ''), secret }) : null;
}

/**
 * @param {Record<string, string|undefined>} env
 * @returns {Readonly<{host: string, port: number, dbPath: string, siteOrigin: string,
 *   allowedOrigins: string[], adminEmails: string[], secureCookies: boolean,
 *   providers: {google: object|null, github: object|null}}>}
 */
export function loadConfig(env = process.env) {
  const siteOrigin = env.SITE_ORIGIN || 'https://blogspro.in';
  const oauthBridge = bridgeConfig(env);
  return Object.freeze({
    oauthBridge,
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || DEFAULT_PORT),
    dbPath: env.DB_PATH || '/var/lib/blogspro-api/blogspro.db',
    siteOrigin,
    allowedOrigins: [siteOrigin, ...parseList(env.EXTRA_ORIGINS)],
    adminEmails: parseList(env.ADMIN_EMAILS),
    // Only local tests over plain http turn this off.
    secureCookies: env.INSECURE_COOKIES !== '1',
    providers: Object.freeze({
      google: providerConfig(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, Boolean(oauthBridge)),
      github: providerConfig(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET, Boolean(oauthBridge))
    })
  });
}
