// mermaid.js — Rescue converter for the chart subset of Mermaid that older prompts asked
// models to write (`pie`, `xychart-beta`). No template ever rendered Mermaid, so these blocks
// shipped as raw code text. Anything else (flowcharts, sequence diagrams) returns null and is
// left untouched. Pure string parsing, bounded input.

const MAX_SOURCE_CHARS = 5_000;

/** Split a Mermaid list body `Q1, "Q 2", 3.5` into trimmed items (quotes respected). */
function splitList(body) {
  return [...body.matchAll(/"([^"]*)"|([^,]+)/g)].map(m => (m[1] ?? m[2]).trim()).filter(s => s.length > 0);
}

const unquote = s => s.trim().replace(/^"(.*)"$/, '$1');

/** `pie [showData] [title X]` followed by `"Label" : value` lines. */
function parsePie(lines) {
  const header = lines[0].replace(/^pie\s*(showData)?\s*/i, '');
  const titleLine = lines.find(l => /^title\s+/i.test(l));
  const title = unquote((titleLine ?? header).replace(/^title\s+/i, ''));
  const data = lines
    .map(l => l.match(/^"([^"]+)"\s*:\s*([-+]?[\d.]+)\s*$/))
    .filter(Boolean)
    .map(m => [m[1], Number(m[2])]);
  return data.length ? { type: 'pie', title, data } : null;
}

/** `xychart-beta [horizontal]` with title / x-axis [..] / y-axis "t" a --> b / bar [..] / line [..]. */
function parseXyChart(lines) {
  const horizontal = /horizontal/i.test(lines[0]);
  const field = name => lines.find(l => new RegExp(`^${name}\\b`, 'i').test(l));
  const title = unquote((field('title') ?? '').replace(/^title\s+/i, ''));
  const xAxis = (field('x-axis') ?? '').match(/\[(.*)\]/);
  const yAxis = (field('y-axis') ?? '').match(/^y-axis\s*(?:"([^"]*)")?\s*(?:([-\d.]+)\s*-->\s*([-\d.]+))?/i);
  const series = lines
    .map(l => l.match(/^(bar|line)\s*\[(.*)\]/i))
    .filter(Boolean)
    .map(m => ({ kind: m[1].toLowerCase(), values: splitList(m[2]).map(Number) }));
  if (series.length === 0) return null;
  const length = Math.max(...series.map(s => s.values.length));
  const categories = xAxis ? splitList(xAxis[1]) : Array.from({ length }, (_, i) => String(i + 1));
  const onlyLines = series.every(s => s.kind === 'line');
  return {
    type: onlyLines ? 'line' : horizontal ? 'bar' : 'column',
    title,
    yLabel: yAxis?.[1] ?? '',
    ...(yAxis?.[2] !== undefined ? { yMin: Number(yAxis[2]), yMax: Number(yAxis[3]) } : {}),
    data: [
      ['', ...series.map((_, i) => `Series ${i + 1}`)],
      ...categories.map((c, i) => [c, ...series.map(s => (Number.isFinite(s.values[i]) ? s.values[i] : null))]),
    ],
  };
}

/**
 * Convert a Mermaid chart source to an engine payload, or null if it is not a chart we support.
 * @param {string} source contents of a ```mermaid fence
 * @returns {object|null}
 */
export function mermaidToChart(source) {
  if (typeof source !== 'string' || source.length > MAX_SOURCE_CHARS) return null;
  const lines = source.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  if (lines.length === 0) return null;
  if (/^pie\b/i.test(lines[0])) return parsePie(lines);
  if (/^xychart(-beta)?\b/i.test(lines[0])) return parseXyChart(lines);
  return null;
}
