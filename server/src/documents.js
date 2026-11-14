/**
 * documents.js — Firestore-like collections stored as JSON rows, so the admin panel's
 * generic collection API and a one-time Firestore import keep the same shape.
 */
import { randomUUID } from 'node:crypto';

const MAX_LIST = 500;
const RESERVED_FIELDS = new Set(['_id', 'id']);

const stripReserved = data => Object.fromEntries(Object.entries(data).filter(([key]) => !RESERVED_FIELDS.has(key)));

function toDoc(row) {
  return { ...JSON.parse(row.data), _id: row.id, id: row.id };
}

/** "field desc" → comparator; missing values sort last. */
function comparatorFor(orderBy) {
  const [field, direction] = String(orderBy || '').split(' ');
  if (!field) return null;
  const sign = direction === 'desc' ? -1 : 1;
  return (a, b) => {
    const left = a[field];
    const right = b[field];
    if (left === right) return 0;
    if (left === undefined || left === null) return 1;
    if (right === undefined || right === null) return -1;
    return left < right ? -sign : sign;
  };
}

/** @param {import('node:sqlite').DatabaseSync} db */
export function createDocumentRepository(db) {
  const get = db.prepare('SELECT * FROM documents WHERE collection = ? AND id = ?');
  const list = db.prepare('SELECT * FROM documents WHERE collection = ?');
  const insert = db.prepare('INSERT INTO documents (collection, id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
  const replace = db.prepare('UPDATE documents SET data = ?, updated_at = ? WHERE collection = ? AND id = ?');
  const remove = db.prepare('DELETE FROM documents WHERE collection = ? AND id = ?');
  const nowIso = () => new Date().toISOString();

  return {
    get(collection, id) {
      const row = get.get(collection, id);
      return row ? toDoc(row) : null;
    },

    /** @param {{orderBy?: string, limit?: string|number, filter?: (doc: object) => boolean}} options */
    list(collection, { orderBy, limit, filter } = {}) {
      const docs = list.all(collection).map(toDoc).filter(filter || (() => true));
      const compare = comparatorFor(orderBy);
      const sorted = compare ? [...docs].sort(compare) : docs;
      const cap = Math.min(Number(limit) > 0 ? Number(limit) : MAX_LIST, MAX_LIST);
      return sorted.slice(0, cap);
    },

    create(collection, data, id = randomUUID()) {
      const time = nowIso();
      insert.run(collection, id, JSON.stringify({ createdAt: time, ...stripReserved(data) }), time, time);
      return this.get(collection, id);
    },

    /** Merge update; creates the document when missing (Firestore set-with-merge semantics). */
    upsert(collection, id, data) {
      const existing = get.get(collection, id);
      if (!existing) return this.create(collection, data, id);
      const merged = { ...JSON.parse(existing.data), ...stripReserved(data) };
      replace.run(JSON.stringify(merged), nowIso(), collection, id);
      return this.get(collection, id);
    },

    remove: (collection, id) => remove.run(collection, id).changes > 0
  };
}
