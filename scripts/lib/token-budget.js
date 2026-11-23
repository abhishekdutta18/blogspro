/**
 * Token budget for pipeline runs. The AI fleet runs on free or small paid quotas (one Groq org shared by
 * three pool nodes, Workers AI's daily allowance, Sarvam credit), so a run that makes too many calls leaves
 * nothing for the next one. This module wraps `askAI` with two caps:
 *   - a per-run cap, so one daily or weekly run cannot spend the day's quota on its own;
 *   - a cap on all runs in the last 24 hours, read from a small ledger file the runs share. The window rolls
 *     (like Groq's limits) rather than resetting at midnight, so the 00:00 UTC daily run still counts the
 *     editions from the evening before.
 * A call is refused before it is sent when its estimate (prompt + a reply reserve) would pass either cap,
 * and the caller falls back to publishing without that section. Tokens are estimated at four characters
 * each because askAI returns text only; the estimate is for budgeting, not billing.
 * Runs are serialised by the pulse run lock, so the ledger has a single writer at a time.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHARS_PER_TOKEN = 4;
const DEFAULT_REPLY_RESERVE = 2_500;
const LEDGER_NAME = 'token-ledger.json';

/** Estimated tokens per run when no env override is set. About 6 calls (~6.5k each) plus one round of retries. */
export const DEFAULT_RUN_CAPS = Object.freeze({ hourly: 80_000, daily: 80_000, weekly: 100_000, monthly: 120_000 });
/** Estimated tokens all runs together may spend in any 24 hours: three editions, one daily, Sunday's weekly, slack. */
export const DEFAULT_DAY_CAP = 400_000;

export class BudgetExceededError extends Error {
  constructor(message) {
    super(`TOKEN_BUDGET_EXCEEDED: ${message}`);
    this.name = 'BudgetExceededError';
  }
}

/**
 * @param {unknown} value prompt or reply; non-strings are JSON-encoded
 * @returns {number} estimated tokens
 */
export function estimateTokens(value) {
  if (value == null) return 0;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Ledger path: TOKEN_LEDGER_FILE, else the systemd StateDirectory (/var/lib/blogspro-pulse), else ~/.blogspro.
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function ledgerFile(env = process.env) {
  if (env.TOKEN_LEDGER_FILE) return env.TOKEN_LEDGER_FILE;
  if (env.STATE_DIRECTORY) return path.join(env.STATE_DIRECTORY.split(':')[0], LEDGER_NAME);
  return path.join(os.homedir(), '.blogspro', LEDGER_NAME);
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

const validEntry = (e, since) =>
  e && Number.isFinite(e.t) && e.t > since && typeof e.freq === 'string' && Number.isFinite(e.tokens) && e.tokens >= 0;

/**
 * Spend in the 24 hours before `now` as `{ entries: [{ t (ms), freq, tokens }] }`; empty when the file is
 * missing, unreadable or in an older format. Older entries are dropped, so the file stays small.
 * @param {string} file
 * @param {Date} now
 */
export function readLedger(file, now = new Date()) {
  const since = now.getTime() - WINDOW_MS;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    return { entries: entries.filter((e) => validEntry(e, since)).map(({ t, freq, tokens }) => ({ t, freq, tokens })) };
  } catch {
    return { entries: [] };
  }
}

/** Writes via a temp file and rename so a crash cannot leave half a ledger. Returns false on failure. */
function writeLedger(file, ledger) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(ledger));
    fs.renameSync(tmp, file);
    return true;
  } catch (error) {
    console.warn(`⚠️ [Budget] Ledger not saved (${file}): ${error.message}`);
    return false;
  }
}

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Caps for a frequency: TOKEN_BUDGET_<FREQ>_RUN and TOKEN_BUDGET_DAY override the defaults.
 * @param {string} freq
 * @param {Record<string, string | undefined>} env
 * @returns {{ runCap: number, dayCap: number }}
 */
export function resolveCaps(freq, env = process.env) {
  const runDefault = DEFAULT_RUN_CAPS[freq] ?? DEFAULT_RUN_CAPS.daily;
  return {
    runCap: positiveInt(env[`TOKEN_BUDGET_${String(freq).toUpperCase()}_RUN`], runDefault),
    dayCap: positiveInt(env.TOKEN_BUDGET_DAY, DEFAULT_DAY_CAP),
  };
}

const sum = (ledger) => ledger.entries.reduce((total, e) => total + e.tokens, 0);

/**
 * Wraps askAI with the run and 24-hour caps. Returns `{ askAI, usage }`; `usage()` reports this run's spend,
 * the last 24 hours' total across runs, calls made and calls refused.
 * @param {{ askAI: (prompt: unknown, options?: object) => Promise<string>, freq: string, file: string,
 *   runCap: number, dayCap: number, replyReserve?: number, now?: () => Date }} options
 */
export function createBudgetedAskAI({ askAI, freq, file, runCap, dayCap, replyReserve = DEFAULT_REPLY_RESERVE, now = () => new Date() }) {
  let run = 0;
  let calls = 0;
  let refused = 0;
  let memory = null; // in-memory ledger when the file cannot be written

  const load = () => {
    const fromFile = readLedger(file, now());
    if (!memory) return fromFile;
    const since = now().getTime() - WINDOW_MS;
    const kept = { entries: memory.entries.filter((e) => e.t > since) };
    return sum(kept) > sum(fromFile) ? kept : fromFile;
  };

  const charge = (tokens) => {
    run += tokens;
    const next = { entries: [...load().entries, { t: now().getTime(), freq, tokens }] };
    memory = writeLedger(file, next) ? null : next;
  };

  const budgetedAskAI = async (prompt, options = {}) => {
    const promptTokens = estimateTokens(prompt);
    const estimate = promptTokens + replyReserve;
    const day = sum(load());
    if (run + estimate > runCap) {
      refused += 1;
      throw new BudgetExceededError(`${freq} run cap ${runCap} reached (spent ${run}, next call ~${estimate})`);
    }
    if (day + estimate > dayCap) {
      refused += 1;
      throw new BudgetExceededError(`day cap ${dayCap} reached (spent in the last 24 h ${day}, next call ~${estimate})`);
    }
    calls += 1;
    try {
      const reply = await askAI(prompt, options);
      charge(promptTokens + estimateTokens(reply));
      return reply;
    } catch (error) {
      charge(promptTokens);
      throw error;
    }
  };

  return {
    askAI: budgetedAskAI,
    usage: () => ({ run, day: sum(load()), calls, refused }),
  };
}
