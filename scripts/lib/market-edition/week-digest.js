/**
 * Week digest for the weekly review: the titles and summaries of the editions published in the last seven days,
 * read from the edition snapshots (no AI calls, no network). It gives the weekly writer the week's narrative for
 * a few hundred tokens instead of re-researching every topic.
 */
import fs from 'node:fs';
import path from 'node:path';
import { snapshotDir } from './snapshot.js';
import { cleanText } from './json-reply.js';

const DAY_MS = 86_400_000;
const MAX_ITEMS = 21; // three editions a day for a week
const SUMMARY_MAX = 300;

/** Snapshot files modified in the window, oldest first; [] when the directory cannot be read. */
function recentFiles(dir, since) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  return names
    .map((name) => {
      const file = path.join(dir, name);
      try {
        return { file, mtime: fs.statSync(file).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((f) => f && f.mtime >= since)
    .sort((a, b) => a.mtime - b.mtime)
    .slice(-MAX_ITEMS);
}

/** One digest line for a snapshot with commentary, else null. */
function digestLine(file) {
  try {
    const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
    const title = cleanText(snap?.text?.title, 120);
    if (!title) return null;
    const summary = cleanText(snap.text.summary, SUMMARY_MAX);
    const label = `${cleanText(snap.timeLabel, 40)} (${cleanText(snap.edition, 20)})`;
    return `- ${label}: ${title.replace(/[.!?]?$/, '.')}${summary ? ` ${summary}` : ''}`;
  } catch {
    return null;
  }
}

/**
 * The week's editions as prompt lines, oldest first, or '' when there are none.
 * @param {{ dir?: string, now?: Date, days?: number }} options
 * @returns {string}
 */
export function recentEditionsText({ dir = snapshotDir(), now = new Date(), days = 7 } = {}) {
  const since = now.getTime() - days * DAY_MS;
  return recentFiles(dir, since).map((f) => digestLine(f.file)).filter(Boolean).join('\n');
}
