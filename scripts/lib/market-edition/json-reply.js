/**
 * Helpers for model replies that are asked to be JSON. Models often wrap JSON in prose or code fences,
 * so the first {...} block is extracted; every field is then coerced to a bounded plain string or list,
 * because these values end up in published pages.
 */

/** The first JSON object in a model reply, or null when none parses. */
export function extractJson(reply) {
  const text = String(reply || '').replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** A trimmed, whitespace-collapsed string of at most `max` characters ('' for non-strings). */
export function cleanText(value, max = 600) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Up to `limit` non-empty cleaned strings from an array. */
export function cleanList(value, { limit = 5, max = 300 } = {}) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => cleanText(v, max)).filter(Boolean).slice(0, limit);
}
