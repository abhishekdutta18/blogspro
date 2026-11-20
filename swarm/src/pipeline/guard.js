/**
 * guard.js — the last check before anything is published. It returns a list of problems
 * rather than fixing them: a briefing that fails is not published, and the site keeps
 * showing the previous one.
 */

export const HOURLY_RULES = Object.freeze({
  minWords: 600,
  maxWords: 1600,
  minSections: 3,
  maxSections: 8,
  minCitations: 4,
  maxTitleLength: 140
});

const BANNED = Object.freeze([
  { pattern: /blogs\s*-?\s*pro/i, reason: 'names the publication' },
  { pattern: /\bas an ai\b|\blanguage model\b/i, reason: 'mentions being an AI' },
  { pattern: /NO_SIGNAL/, reason: 'contains a desk placeholder' }
]);

const wordCount = text => (text.match(/\S+/g) || []).length;

/** Distinct citation numbers like [3] or [3, 5] found in the text. */
export function citedIndices(text) {
  const found = new Set();
  for (const [, group] of text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    group.split(',').forEach(n => found.add(Number(n.trim())));
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * @param {{title: string, summary: string, sections: {heading: string, body: string}[]}} draft
 * @param {number} headlineCount
 * @param {typeof HOURLY_RULES} rules
 * @returns {{problems: string[], citations: number[]}}
 */
export function checkBriefing(draft, headlineCount, rules = HOURLY_RULES) {
  const problems = [];
  const bodyText = draft.sections.map(s => s.body).join('\n');
  const allText = [draft.title, draft.summary, ...draft.sections.flatMap(s => [s.heading, s.body])].join('\n');

  if (draft.title.length > rules.maxTitleLength) problems.push(`title is ${draft.title.length} chars (max ${rules.maxTitleLength})`);

  const sections = draft.sections.length;
  if (sections < rules.minSections || sections > rules.maxSections) {
    problems.push(`${sections} sections (want ${rules.minSections}-${rules.maxSections})`);
  }

  const words = wordCount(bodyText);
  if (words < rules.minWords || words > rules.maxWords) problems.push(`${words} words (want ${rules.minWords}-${rules.maxWords})`);

  for (const { pattern, reason } of BANNED) {
    if (pattern.test(allText)) problems.push(reason);
  }

  const citations = citedIndices(allText);
  const invalid = citations.filter(n => n < 1 || n > headlineCount);
  if (invalid.length) problems.push(`cites headlines that do not exist: ${invalid.join(', ')}`);
  const valid = citations.filter(n => n >= 1 && n <= headlineCount);
  if (valid.length < rules.minCitations) problems.push(`${valid.length} distinct sources cited (min ${rules.minCitations})`);

  return { problems, citations: valid };
}
