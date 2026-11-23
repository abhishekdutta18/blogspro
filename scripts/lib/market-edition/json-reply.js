/**
 * Helpers for model replies that are asked to be JSON. Models often wrap JSON in prose or code fences,
 * so the first {...} block is extracted; every field is then coerced to a bounded plain string or list,
 * because these values end up in published pages. Length caps are safety limits, not editing: text over
 * a cap is cut at its last full sentence, never mid-word.
 */

const SENTENCE_END = /[.!?]["')\]]?$/;

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

/**
 * `text` limited to `max` characters: whole sentences when one ends in the back half of the limit,
 * otherwise whole words followed by an ellipsis.
 */
export function truncateAtSentence(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  if (SENTENCE_END.test(cut)) return cut;
  const lastEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  if (lastEnd >= max / 2) return cut.slice(0, lastEnd + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max).replace(/[\s,;:–-]+$/, '')}…`;
}

/** A whitespace-collapsed, markdown-free string of at most `max` characters ('' for non-strings). */
export function cleanText(value, max = 1500) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim();
  return truncateAtSentence(text, max);
}

// A list item needs at least one letter or digit; "]", "],", '"}' and the like are JSON debris, not text.
const HAS_WORD = /[\p{L}\p{N}]/u;

/** Up to `limit` cleaned strings from an array, skipping empty items and punctuation-only debris. */
export function cleanList(value, { limit = 5, max = 1500 } = {}) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => cleanText(v, max)).filter((t) => HAS_WORD.test(t)).slice(0, limit);
}
