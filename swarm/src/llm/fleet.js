/**
 * fleet.js — tries providers in order until one answers. A provider that rejects its key
 * or is out of credits is skipped for the rest of the run. When every provider fails, the fleet pauses once
 * (65s by default, the institutional standard) and makes one more full round before giving up.
 */
import { chat } from './client.js';
import { silentLogger } from '../log.js';

export class FleetExhaustedError extends Error {
  /** @param {{provider: string, kind: string, message: string}[]} attempts */
  constructor(attempts) {
    const kinds = [...new Set(attempts.map(a => `${a.provider}:${a.kind}`))].join(', ');
    super(`All AI providers failed (${attempts.length} attempts: ${kinds}).`);
    this.name = 'FleetExhaustedError';
    this.attempts = attempts;
  }
}

const ROUNDS = 2;
/** Failures that no pause will fix: the provider is skipped for the rest of the run. */
const UNRECOVERABLE = new Set(['auth', 'billing', 'model_unavailable']);
const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @param {{providers: object[], timeoutMs: number, pauseMs: number, fetchImpl?: typeof fetch,
 *          sleep?: (ms: number) => Promise<void>, log?: import('../log.js').Logger}} options
 */
export function createFleet({ providers, timeoutMs, pauseMs, fetchImpl = fetch, sleep = defaultSleep, log = silentLogger }) {
  const rejectedKeys = new Set();

  async function tryRound(messages, callOptions, attempts) {
    for (const provider of providers) {
      if (rejectedKeys.has(provider.name)) continue;
      try {
        return await chat(provider, messages, { ...callOptions, timeoutMs, fetchImpl });
      } catch (error) {
        const kind = error?.kind || 'unknown';
        attempts.push({ provider: provider.name, kind, message: error?.message });
        log.warn('llm.provider_failed', { provider: provider.name, kind, status: error?.status });
        if (UNRECOVERABLE.has(kind)) rejectedKeys.add(provider.name);
      }
    }
    return null;
  }

  /**
   * @param {{role: string, content: string}[]} messages
   * @param {{maxTokens?: number, temperature?: number}} [callOptions]
   */
  async function complete(messages, callOptions = {}) {
    const attempts = [];
    for (let round = 1; round <= ROUNDS; round += 1) {
      const result = await tryRound(messages, callOptions, attempts);
      if (result) return result;
      const anyLeft = providers.some(p => !rejectedKeys.has(p.name));
      if (round === ROUNDS || !anyLeft) break;
      log.warn('llm.fleet_pause', { ms: pauseMs });
      await sleep(pauseMs);
    }
    throw new FleetExhaustedError(attempts);
  }

  return { complete };
}
