/**
 * Edition snapshots — the raw writer replies plus the data and parsed text a published edition was built from,
 * saved as one JSON file per edition id. They exist so a bad render can be diagnosed, or the page rebuilt,
 * without paying for the AI calls again. The directory is outside the web root on purpose: the runner rsyncs
 * the whole web root to the public server, and raw model output is not for publication.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SAFE_ID = /^[\w.-]+$/;

/** Where snapshots go: EDITION_SNAPSHOT_DIR, else ~/.blogspro/edition-snapshots. */
export function snapshotDir(env = process.env) {
  return env.EDITION_SNAPSHOT_DIR || path.join(os.homedir(), '.blogspro', 'edition-snapshots');
}

/**
 * Writes `<id>.json`; returns its path, or null when the id is unsafe or the write fails. Never throws: a
 * missing snapshot must not stop an edition from publishing.
 */
export function saveEditionSnapshot(snapshot, id, { dir = snapshotDir() } = {}) {
  if (!SAFE_ID.test(String(id)) || String(id).startsWith('.')) {
    console.warn(`⚠️ [Edition] Snapshot skipped: unsafe id "${id}"`);
    return null;
  }
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify(snapshot), { mode: 0o600 });
    return file;
  } catch (error) {
    console.warn(`⚠️ [Edition] Snapshot not saved: ${error.message}`);
    return null;
  }
}

/**
 * Saves the snapshot attached to a failed edition (EditionIncompleteError.snapshot) as
 * `failed-swarm-<freq>-<now>.json`, so the raw replies behind an unpublished edition can be read.
 * Returns the path, or null when the error carries no snapshot or the write fails. Never throws.
 * @param {unknown} error
 * @param {string} freq
 * @param {{ dir?: string, now?: number }} [options]
 * @returns {string | null}
 */
export function saveFailedEditionSnapshot(error, freq, { dir = snapshotDir(), now = Date.now() } = {}) {
  const snapshot = error && typeof error === 'object' ? error.snapshot : null;
  if (!snapshot) return null;
  return saveEditionSnapshot(snapshot, `failed-swarm-${freq}-${now}`, { dir });
}
