/**
 * Weekly review feed — turns /articles/weekly/index.json (rewritten by the generation pipeline on each weekly
 * run) into display-ready homepage items. The index carries model output, so every field is untrusted:
 *   - only entries the edition pipeline wrote (edition "weekly") are listed; the index also holds legacy
 *     mock runs whose titles are internal labels;
 *   - links must match the generator's file name, so nothing can point outside /articles/weekly/;
 *   - text comes back as plain, whitespace-collapsed, length-capped strings for textContent, never HTML.
 */

const TITLE_MAX = 140;
const EXCERPT_MAX = 240;
const FILE_NAME_PATTERN = /^swarm-weekly-\d+\.html$/;
const STANCES = new Set(['bearish', 'cautious', 'neutral', 'constructive', 'bullish']);
const IST_DATE = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

/** "24 Nov 2026": the IST calendar date of an epoch-millisecond timestamp. */
export function formatReviewDate(timestamp) {
  return IST_DATE.format(new Date(timestamp));
}

function trimText(text, max) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

function toItem(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  if (entry.edition !== 'weekly' || (entry.frequency && entry.frequency !== 'weekly')) return null;
  const timestamp = Number(entry.timestamp);
  if (typeof entry.timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return null;
  const fileName = String(entry.fileName ?? '');
  if (!FILE_NAME_PATTERN.test(fileName)) return null;
  const title = trimText(entry.title, TITLE_MAX);
  if (!title) return null;
  return {
    href: `/articles/weekly/${fileName}`,
    timestamp,
    date: formatReviewDate(timestamp),
    title,
    excerpt: trimText(entry.excerpt, EXCERPT_MAX),
    stance: STANCES.has(entry.stance) ? entry.stance : null,
  };
}

/**
 * Newest-first weekly review items, one per file; [] for a missing or malformed index.
 * @param {unknown} index parsed index.json
 * @param {{ limit?: number }} [options]
 * @returns {Array<{ href: string, timestamp: number, date: string, title: string, excerpt: string, stance: string | null }>}
 */
export function parseWeeklyIndex(index, { limit = Infinity } = {}) {
  if (!Array.isArray(index)) return [];
  const seen = new Set();
  return index
    .map(toItem)
    .filter((item) => item && !seen.has(item.href) && seen.add(item.href))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}
