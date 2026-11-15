// payload.js — Trust boundary for raw chart payloads written by LLMs.
// Parses (never evals), repairs common JSON faults within strict size budgets,
// and coerces cell values to safe finite numbers. Every regex here runs only on
// length-capped input, so no payload can stall the pipeline (review H2/H3).

export const LIMITS = Object.freeze({
  MAX_RAW_CHARS: 20_000, // whole <chart-data> payload
  MAX_REPAIR_CHARS: 8_000, // regex repair only below this (quadratic worst case)
  MAX_NUMBER_CHARS: 32, // a numeric cell longer than this is not a number
  MAX_ABS_VALUE: 1e15, // beyond this, SVG coordinate math loses precision (review H4)
  MIN_ABS_VALUE: 1e-12, // below this, treat as zero (denormals break toFixed)
  MAX_CATEGORIES: 60,
  MAX_SERIES: 6, // equals the validated palette length — hues never cycle
  MAX_PIE_SLICES: 6, // beyond this, fold into "Other"
  MAX_GAUGES: 4,
  MAX_TEXT: 120,
});

/** Thrown for any payload that cannot be charted honestly. */
export class ChartSpecError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ChartSpecError';
  }
}

/** Last-resort repairs for the common LLM JSON faults. Only runs after a strict parse fails. */
function repairJson(text) {
  return text
    .replace(/'([^'\\\n]*(?:\\.[^'\\\n]*)*)'/g, (_, s) => JSON.stringify(s)) // 'str' -> "str"
    .replace(/([{,]\s*)([A-Za-z_][\w-]*)\s*:/g, '$1"$2":') // key: -> "key":
    .replace(/,\s*([}\]])/g, '$1'); // trailing commas
}

/**
 * Parse a raw payload string: strict JSON first, conservative repair second.
 * @param {unknown} raw
 * @returns {unknown}
 * @throws {ChartSpecError}
 */
export function parsePayload(raw) {
  if (typeof raw !== 'string') throw new ChartSpecError('payload must be a string');
  if (raw.length > LIMITS.MAX_RAW_CHARS) throw new ChartSpecError('payload too large');
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(text);
  } catch (strictError) {
    if (text.length > LIMITS.MAX_REPAIR_CHARS) throw new ChartSpecError('invalid JSON (too large to repair)');
    try {
      return JSON.parse(repairJson(text));
    } catch (err) {
      throw new ChartSpecError(`invalid JSON: ${err instanceof Error ? err.message : String(strictError)}`);
    }
  }
}

/** Clamp a parsed number into the safe plotting range; out-of-range -> null (a gap, not a lie). */
function safeNumber(n) {
  if (!Number.isFinite(n) || Math.abs(n) > LIMITS.MAX_ABS_VALUE) return null;
  return Math.abs(n) < LIMITS.MIN_ABS_VALUE ? 0 : n;
}

/**
 * Coerce numbers and numeric strings ("₹1,200", "14.2%") to safe finite numbers; anything else -> null.
 * @param {unknown} value
 * @returns {number|null}
 */
export function toNumber(value) {
  if (typeof value === 'number') return safeNumber(value);
  if (typeof value !== 'string' || value.length > LIMITS.MAX_NUMBER_CHARS * 2) return null;
  const cleaned = value.replace(/[,\s₹$€£%]/g, '');
  if (cleaned.length === 0 || cleaned.length > LIMITS.MAX_NUMBER_CHARS) return null;
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(cleaned)) return null;
  return safeNumber(Number(cleaned));
}

/** Trimmed, length-capped plain text. Escaping happens at render time. */
export function clip(value, max = LIMITS.MAX_TEXT) {
  return String(value ?? '').trim().slice(0, max);
}

/** Own-property lookup so payload keys like "__proto__" never resolve to inherited values (review M2). */
export function lookup(table, key) {
  const k = String(key ?? '').toLowerCase().trim();
  return Object.hasOwn(table, k) ? table[k] : undefined;
}
