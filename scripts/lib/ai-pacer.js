/**
 * Tokens-per-minute pacing for pipeline AI calls. Groq's free tier allows 8,000 tokens per minute per org, and
 * the fleet's first choice for every role is Groq: calls sent back to back get a 429 and spill over to fallback
 * providers whose replies are capped or malformed more often (the first live daily run lost its view section that
 * way). This wrapper keeps a 60-second window of estimated tokens and waits before a call that would overflow it.
 * Estimates are 4 characters per token (see token-budget.js). AI_PACE_TPM sets the limit; 0 turns pacing off.
 */
import { estimateTokens } from './token-budget.js';

const WINDOW_MS = 60_000;
const SAFETY_MS = 250;
export const DEFAULT_TPM = 8_000;
const DEFAULT_REPLY_RESERVE = 1_500;

/**
 * Tokens-per-minute limit from AI_PACE_TPM: a non-negative integer, else the Groq free-tier default.
 * @param {Record<string, string | undefined>} env
 * @returns {number}
 */
export function paceFromEnv(env = process.env) {
  const n = Number(env.AI_PACE_TPM);
  return env.AI_PACE_TPM !== undefined && Number.isInteger(n) && n >= 0 ? n : DEFAULT_TPM;
}

/**
 * Wraps askAI so calls stay under `tokensPerMinute`. A call larger than the whole limit waits for an empty window.
 * Each call is charged at its start time (when the provider counts it): prompt plus reply, or the prompt alone
 * if the call fails.
 * @param {{ askAI: Function, tokensPerMinute: number, replyReserve?: number, now?: () => number,
 *   sleep?: (ms: number) => Promise<void> }} options
 * @returns {(prompt: unknown, options?: object) => Promise<string>}
 */
export function createPacedAskAI({
  askAI, tokensPerMinute, replyReserve = DEFAULT_REPLY_RESERVE, now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!tokensPerMinute) return askAI;
  let window = []; // { t, tokens }

  const prune = () => {
    const since = now() - WINDOW_MS;
    window = window.filter((e) => e.t > since);
  };
  const used = () => window.reduce((sum, e) => sum + e.tokens, 0);

  return async (prompt, options) => {
    const promptTokens = estimateTokens(prompt);
    const estimate = promptTokens + replyReserve;
    prune();
    while (window.length && used() + estimate > tokensPerMinute) {
      const waitMs = window[0].t + WINDOW_MS - now() + SAFETY_MS;
      console.log(`⏳ [Pace] Waiting ${Math.ceil(waitMs / 1000)} s to stay under ${tokensPerMinute} tokens/min`);
      await sleep(waitMs);
      prune();
    }
    const entry = { t: now(), tokens: promptTokens };
    window.push(entry);
    const reply = await askAI(prompt, options);
    entry.tokens += estimateTokens(reply);
    return reply;
  };
}
