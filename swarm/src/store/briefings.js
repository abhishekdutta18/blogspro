/**
 * briefings.js — writes briefings into the API's SQLite `documents` table, the same rows
 * server/src/documents.js reads, so they appear at /api/public/data/pulse_briefings.
 * The swarm is deployed apart from the API, so it cannot import the server's module;
 * test/store.test.mjs reads these rows back through the server's repository to keep the
 * two in step.
 */
import { DatabaseSync } from 'node:sqlite';

export const COLLECTION = 'pulse_briefings';
const BUSY_TIMEOUT_MS = 5000;

// Must match server/src/db.js. CREATE ... IF NOT EXISTS is a no-op when the API made it first.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS documents (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (collection, id)
  );
`;

/** @param {string} dbPath file path, or ':memory:' in tests */
export function openBriefingStore(dbPath) {
  const db = new DatabaseSync(dbPath);
  // Wait for the API's write lock instead of failing with SQLITE_BUSY.
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};`);
  if (dbPath !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  const findCreated = db.prepare('SELECT created_at FROM documents WHERE collection = ? AND id = ?');
  const upsert = db.prepare(`
    INSERT INTO documents (collection, id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `);
  const prune = db.prepare(`
    DELETE FROM documents
    WHERE collection = ? AND id LIKE 'H\\_%' ESCAPE '\\'
      AND id NOT IN (
        SELECT id FROM documents WHERE collection = ? AND id LIKE 'H\\_%' ESCAPE '\\' ORDER BY id DESC LIMIT ?
      )
  `);

  return {
    /**
     * Inserts or replaces one briefing. A re-run of the same slot keeps the original createdAt.
     * @param {{id: string} & Record<string, unknown>} briefing
     */
    save(briefing) {
      const { id, ...fields } = briefing;
      const now = new Date().toISOString();
      const createdAt = findCreated.get(COLLECTION, id)?.created_at || now;
      upsert.run(COLLECTION, id, JSON.stringify({ ...fields, createdAt }), createdAt, now);
    },

    /** Deletes all but the newest `keep` hourly briefings (ids sort by time). @returns {number} rows deleted */
    pruneHourly(keep) {
      return Number(prune.run(COLLECTION, COLLECTION, keep).changes);
    },

    close: () => db.close()
  };
}
