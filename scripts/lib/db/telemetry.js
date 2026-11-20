/**
 * Fire-and-forget telemetry writer for `telemetry_events`.
 *
 * Telemetry is non-essential, so it must never hold up publishing. Under
 * Firestore, one SWARM_QA_COMPLETE write held a run for ~11 minutes. Here:
 *   - record() returns synchronously and never throws;
 *   - every write is abandoned after `timeoutMs` and counted as dropped;
 *   - once `maxInFlight` writes are pending, new events are dropped at once,
 *     so a stalled database cannot grow memory without bound;
 *   - failures are logged with logger.warn and otherwise swallowed on purpose.
 *
 * flush() waits for in-flight writes (each bounded by timeoutMs). Call it
 * just before the process exits so the last events get a chance to land.
 */

const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_MAX_IN_FLIGHT = 50;
const UNSERIALIZABLE = '{"unserializable":true}';

const INSERT_SQL = `
  insert into telemetry_events (event, occurred_at, frequency, job_id, status, message, details)
  values ($1, coalesce($2::timestamptz, now()), $3, $4, $5, $6, $7::jsonb)`;

/**
 * @typedef {object} TelemetryMetadata
 * @property {string} [frequency]  hourly | daily | weekly | monthly
 * @property {string} [jobId]
 * @property {string} [status]     info | success | warning | error
 * @property {string} [message]
 * @property {unknown} [details]   stored as jsonb
 * @property {string} [timestamp]  ISO time; defaults to now()
 */

function serializeDetails(details) {
  try {
    return JSON.stringify(details ?? {});
  } catch {
    return UNSERIALIZABLE;
  }
}

function validTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** @param {string} event @param {TelemetryMetadata} metadata */
function toParams(event, metadata) {
  return [
    event,
    validTimestamp(metadata.timestamp),
    metadata.frequency || 'unknown',
    metadata.jobId ?? null,
    metadata.status || 'info',
    metadata.message ?? null,
    serializeDetails(metadata.details),
  ];
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * @param {object} options
 * @param {{ query: (text: string, params?: unknown[]) => Promise<unknown> }} options.db  pg.Pool, pg.Client or PGlite
 * @param {{ warn: (message: string) => void }} [options.logger]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxInFlight]
 * @returns {{
 *   record: (event: string, metadata?: TelemetryMetadata) => void,
 *   flush: () => Promise<void>,
 *   stats: () => { written: number, dropped: number },
 * }}
 */
export function createTelemetryWriter({
  db,
  logger = console,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxInFlight = DEFAULT_MAX_IN_FLIGHT,
}) {
  const inFlight = new Set();
  const counts = { written: 0, dropped: 0 };

  function drop(event, reason) {
    counts.dropped += 1;
    logger.warn(`telemetry: dropped ${event}: ${reason}`);
  }

  function record(event, metadata = {}) {
    if (typeof event !== 'string' || event.length === 0) {
      logger.warn('telemetry: ignoring an event without a name');
      return;
    }
    if (inFlight.size >= maxInFlight) {
      drop(event, `${maxInFlight} writes already pending`);
      return;
    }
    // Promise.resolve().then() turns a synchronous throw from db.query into a rejection.
    const write = withTimeout(Promise.resolve().then(() => db.query(INSERT_SQL, toParams(event, metadata))), timeoutMs)
      .then(
        () => { counts.written += 1; },
        (error) => drop(event, error instanceof Error ? error.message : String(error)),
      )
      .finally(() => inFlight.delete(write));
    inFlight.add(write);
  }

  async function flush() {
    await Promise.all([...inFlight]);
  }

  function stats() {
    return { ...counts };
  }

  return { record, flush, stats };
}
