/**
 * Briefing feed — turns /briefings/<frequency>/index.json (written by the generation pipeline on
 * every run) into display-ready items for the site. The index carries model output, so every
 * field is treated as untrusted: links must match the generator's file-name pattern, and text is
 * returned as plain strings for textContent, never as HTML.
 */

const EXCERPT_MAX = 240;
const FILE_NAME_PATTERN = /^swarm-(hourly|daily)-\d+\.html$/;
const IST_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "21 Nov 2026, 01:30 IST" for an epoch-millisecond timestamp. */
export function formatBriefingTime(timestamp) {
  return `${IST_FORMAT.format(new Date(timestamp)).replace(' at ', ', ')} IST`;
}

function trimExcerpt(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > EXCERPT_MAX ? `${clean.slice(0, EXCERPT_MAX).trimEnd()}…` : clean;
}

function toItem(entry, frequency) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.frequency && entry.frequency !== frequency) return null;
  const timestamp = Number(entry.timestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const fileName = String(entry.fileName || '');
  if (!FILE_NAME_PATTERN.test(fileName) || !fileName.startsWith(`swarm-${frequency}-`)) return null;
  return {
    href: `/briefings/${frequency}/${fileName}`,
    timestamp,
    time: formatBriefingTime(timestamp),
    excerpt: trimExcerpt(entry.excerpt),
  };
}

/** Newest-first briefing items for one frequency; [] for a missing or malformed index. */
export function parseBriefingIndex(index, { frequency = 'hourly', limit = Infinity } = {}) {
  if (!Array.isArray(index)) return [];
  return index
    .map((entry) => toItem(entry, frequency))
    .filter(Boolean)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}
