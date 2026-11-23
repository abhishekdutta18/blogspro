/**
 * JSON files the web server reads while they are being replaced (data/markets.json, data/policy.json):
 * writes go to a temp file that is renamed into place, so a reader never sees half a file.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Parsed JSON from `file`, or null when it is missing or damaged (the caller starts from nothing). */
export function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Writes `data` as JSON to `file` atomically, creating its directory. */
export function writeJsonAtomically(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(data));
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
