/**
 * config.js — reads the service configuration from the environment (/etc/blogspro-api.env
 * in production). OAuth providers are enabled only when both their id and secret are set.
 */

const DEFAULT_PORT = 8787;

function parseList(value) {
  return (value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
}

function providerConfig(id, secret) {
  return id && secret ? Object.freeze({ clientId: id, clientSecret: secret }) : null;
}

/**
 * @param {Record<string, string|undefined>} env
 * @returns {Readonly<{host: string, port: number, dbPath: string, siteOrigin: string,
 *   allowedOrigins: string[], adminEmails: string[], secureCookies: boolean,
 *   providers: {google: object|null, github: object|null}}>}
 */
export function loadConfig(env = process.env) {
  const siteOrigin = env.SITE_ORIGIN || 'https://blogspro.in';
  return Object.freeze({
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || DEFAULT_PORT),
    dbPath: env.DB_PATH || '/var/lib/blogspro-api/blogspro.db',
    siteOrigin,
    allowedOrigins: [siteOrigin, ...parseList(env.EXTRA_ORIGINS)],
    adminEmails: parseList(env.ADMIN_EMAILS),
    // Only local tests over plain http turn this off.
    secureCookies: env.INSECURE_COOKIES !== '1',
    providers: Object.freeze({
      google: providerConfig(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
      github: providerConfig(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET)
    })
  });
}
