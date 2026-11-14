/**
 * db.js — opens the SQLite database (node:sqlite, no native deps) and creates the schema.
 * Tables: users (accounts), sessions (hashed tokens), documents (Firestore-like collections).
 */
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    photo_url TEXT NOT NULL DEFAULT '',
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'reader',
    requested_role TEXT,
    provider TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS documents (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (collection, id)
  );
`;

/** @param {string} path file path, or ':memory:' for tests */
export function openDatabase(path) {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}
