/**
 * log.js — one JSON object per line on stderr, which journald stores as-is and
 * `journalctl -o cat | jq` can filter. Every level goes to stderr so stdout stays free
 * for data (the --dry-run briefing). Never pass secrets in `fields`.
 */

const write = (stream, level, event, fields) => {
  stream.write(`${JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields })}\n`);
};

/** @typedef {{info: (event: string, fields?: object) => void, warn: (event: string, fields?: object) => void, error: (event: string, fields?: object) => void}} Logger */

/** @returns {Logger} */
export function createLogger({ stderr = process.stderr } = {}) {
  return {
    info: (event, fields = {}) => write(stderr, 'info', event, fields),
    warn: (event, fields = {}) => write(stderr, 'warn', event, fields),
    error: (event, fields = {}) => write(stderr, 'error', event, fields)
  };
}

/** A logger that drops everything; for tests. @type {Logger} */
export const silentLogger = Object.freeze({ info() {}, warn() {}, error() {} });
