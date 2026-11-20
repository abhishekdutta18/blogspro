/**
 * config.js — reads and validates the swarm's environment once, at startup, so a
 * misconfigured box fails before it fetches news or spends AI quota.
 */
import { resolveProviders, PROVIDER_CATALOG } from './llm/providers.js';

const DEFAULTS = Object.freeze({
  dbPath: '/var/lib/blogspro-api/blogspro.db',
  llmTimeoutMs: 90_000,
  fleetPauseMs: 65_000, // institutional standard: pause once after the whole fleet fails
  minHeadlines: 8,
  hourlyRetention: 168 // keep 7 days of hourly briefings
});

export class ConfigError extends Error {}

const positiveInt = (raw, fallback, name) => {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new ConfigError(`${name} must be a positive integer, got "${raw}".`);
  return value;
};

/**
 * @param {Record<string, string|undefined>} env usually process.env
 */
export function loadConfig(env) {
  let providers;
  try {
    providers = resolveProviders(env);
  } catch (error) {
    throw new ConfigError(error.message);
  }
  if (providers.length === 0) {
    const names = PROVIDER_CATALOG.map(p => p.keyEnv).join(', ');
    throw new ConfigError(`No AI provider is set up. Set SWARM_PROXY_URL and SWARM_PROXY_TOKEN, or at least one of: ${names}.`);
  }
  return {
    providers,
    dbPath: env.SWARM_DB_PATH || env.DB_PATH || DEFAULTS.dbPath,
    llmTimeoutMs: positiveInt(env.SWARM_LLM_TIMEOUT_MS, DEFAULTS.llmTimeoutMs, 'SWARM_LLM_TIMEOUT_MS'),
    fleetPauseMs: positiveInt(env.SWARM_FLEET_PAUSE_MS, DEFAULTS.fleetPauseMs, 'SWARM_FLEET_PAUSE_MS'),
    minHeadlines: positiveInt(env.SWARM_MIN_HEADLINES, DEFAULTS.minHeadlines, 'SWARM_MIN_HEADLINES'),
    hourlyRetention: positiveInt(env.SWARM_HOURLY_RETENTION, DEFAULTS.hourlyRetention, 'SWARM_HOURLY_RETENTION')
  };
}
