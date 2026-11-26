/**
 * Helpers for model replies that are asked to be JSON. Models often wrap JSON in prose or code fences,
 * so the first {...} block is extracted; every field is then coerced to a bounded plain string or list,
 * because these values end up in published pages. Length caps are safety limits, not editing: text over
 * a cap is cut at its last full sentence, never mid-word.
 */

const SENTENCE_END = /[.!?]["')\]]?$/;

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);

/**
 * The first JSON object in a model reply, or null when none parses. With `repair`, a reply a provider cut off
 * part-way (output caps are common on the free fallbacks) is cut back to its complete fields; see
 * repairTruncatedJson. Callers use repair only on their last attempt, so a broken reply still earns a retry.
 */
export function extractJson(reply, { repair = false } = {}) {
  const text = String(reply || '').replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1) return null;
  if (end > start) {
    try {
      const value = asObject(JSON.parse(text.slice(start, end + 1)));
      if (value) return value;
    } catch {
      // fall through to repair
    }
  }
  if (!repair) return null;
  const repaired = repairTruncatedJson(text.slice(start));
  if (repaired) console.warn('⚠️ [Edition] Reply JSON was cut off or malformed; kept its complete fields');
  return repaired;
}

const MAX_REPAIR_TRIES = 40;

/**
 * Cut points in `text` (which starts at '{') after each complete value, with the closers that would end the
 * document there. Scanning stops at the first incomplete token (an unterminated string or a literal at the end).
 */
function cutPoints(text) {
  const stack = []; // { type: 'obj' | 'arr', expectKey }
  const points = [];
  const closers = () => stack.map((f) => (f.type === 'obj' ? '}' : ']')).reverse().join('');
  const valueDone = (pos) => {
    if (stack.length) points.push({ pos, close: closers() });
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const top = stack[stack.length - 1];
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      if (j >= text.length) break; // unterminated string
      const isKey = top?.type === 'obj' && top.expectKey;
      if (isKey) top.expectKey = false;
      i = j + 1;
      if (!isKey) valueDone(i);
    } else if (ch === '{' || ch === '[') {
      stack.push({ type: ch === '{' ? 'obj' : 'arr', expectKey: ch === '{' });
      i += 1;
    } else if (ch === '}' || ch === ']') {
      // A closer for the wrong container (`"}]` where `"]}` was meant) ends the usable text; the cut points
      // already found close it correctly.
      if (!top || top.type !== (ch === '}' ? 'obj' : 'arr')) break;
      stack.pop();
      i += 1;
      if (!stack.length) {
        // Balanced, yet the caller is here because it did not parse: keep the earlier cuts as fallbacks.
        points.push({ pos: i, close: '' });
        return points;
      }
      valueDone(i);
    } else if (ch === ',') {
      if (top?.type === 'obj') top.expectKey = true;
      i += 1;
    } else if (/[\s:]/.test(ch)) {
      i += 1;
    } else {
      const literal = text.slice(i).match(/^[^,\]}\s]+/)[0];
      i += literal.length;
      if (i >= text.length) break; // literal may be cut short
      valueDone(i);
    }
  }
  return points;
}

/**
 * The object a truncated or malformed JSON reply was building, cut back to its last complete value and closed,
 * or null when nothing complete survives. A half-written string, a dangling key or a cut literal is dropped.
 * @param {string} text JSON text starting at its opening brace
 * @returns {object | null}
 */
export function repairTruncatedJson(text) {
  const source = String(text || '');
  const start = source.indexOf('{');
  if (start === -1) return null;
  const body = source.slice(start);
  const points = cutPoints(body).reverse().slice(0, MAX_REPAIR_TRIES);
  for (const { pos, close } of points) {
    try {
      const value = asObject(JSON.parse(body.slice(0, pos) + close));
      if (value && Object.keys(value).length) return value;
    } catch {
      // try an earlier cut
    }
  }
  return null;
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
  // Trailing brackets and commas are JSON debris from a malformed reply (`exposure.},{`); prose never ends with them.
  const text = value.replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim().replace(/[\s,[\]{}]+$/, '');
  return truncateAtSentence(text, max);
}

// A list item needs at least one letter or digit; "]", "],", '"}' and the like are JSON debris, not text.
const HAS_WORD = /[\p{L}\p{N}]/u;

/** Up to `limit` cleaned strings from an array, skipping empty items and punctuation-only debris. */
export function cleanList(value, { limit = 5, max = 1500 } = {}) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => cleanText(v, max)).filter((t) => HAS_WORD.test(t)).slice(0, limit);
}
