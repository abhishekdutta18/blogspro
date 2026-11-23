/**
 * Edition writer — turns the data, headlines and view-board consensus into a ~3,500-word edition.
 * Free-tier models cap a reply at ~4k output tokens, so the edition is written in three calls, each
 * about 1,100–1,300 words: (1) overview — title, summary and the market description by region;
 * (2) news — an analysis of each chosen story; (3) view — thesis, sector calls, risks, what to watch.
 * The overview is required; if the news or view call fails, those sections fall back to headlines
 * and the board's stance. The model never supplies the figures shown in tables or charts.
 */

import { cleanList, cleanText, extractJson } from './json-reply.js';

const STORY_LIMIT = 8;
export const SECTOR_CALLS = Object.freeze(['overweight', 'neutral', 'underweight']);

const SHARED_RULES = [
  'You write for Indian investors. Voice: direct, data-driven, sceptical, no hype, no filler.',
  'Never mention the publication name. Never invent figures: every number you write must appear in MARKET DATA.',
  'Each quote is marked "live" or "closed, <day> session". Describe closed markets in the past tense for that ' +
    'session ("the S&P 500 fell 3.70% on Friday"); only "live" markets may be described as trading now.',
  'USD/INR falling means the rupee strengthened against the dollar; rising means it weakened.',
  'Write complete paragraphs of plain text. No markdown, no bullet characters, no headings inside strings.',
];

/** Numbered headline list for prompts, with the feed summary when there is one. */
export function headlinesToText(headlines, { withSummary = false } = {}) {
  return headlines
    .map((h, i) => `[${i + 1}] ${h.title} (${h.source})${withSummary && h.summary ? `\n    ${h.summary}` : ''}`)
    .join('\n');
}

function boardToText(board) {
  if (!board?.consensus) return 'No analyst board view is available; form the view from the data.';
  const takes = board.takes.map((t) => `- ${t.persona}: ${t.stance} (conviction ${t.conviction}/5). ${t.points.join(' ')}`);
  return `House stance: ${board.consensus.stance} (board ${board.consensus.agreement}).\n${takes.join('\n')}`;
}

function prompt(context, task, shape) {
  return [
    ...SHARED_RULES,
    `Edition: ${context.edition.label}, ${context.dateLabel}. ${context.edition.focus}`,
    `MARKET DATA:\n${context.marketText}`,
    ...task,
    'Reply with JSON only, no prose around it, in exactly this shape:',
    JSON.stringify(shape),
  ].join('\n\n');
}

export function overviewPrompt(context) {
  return prompt(context, [
    `HEADLINES:\n${headlinesToText(context.headlines, { withSummary: true }) || 'None available.'}`,
    'Write the market description for this edition, about 1,300 words in total. Each paragraph 100-140 words.',
  ], {
    title: 'specific headline for this edition, under 90 characters',
    summary: '2-3 sentences: the most important takeaway',
    india: ['4 paragraphs: Indian indices, breadth across the NSE sectors, volatility, what drove the move'],
    global: ['3 paragraphs: US, Europe and Asia, and what they mean for India'],
    macro: ['3 paragraphs: rupee, US yields, oil, gold and crypto, and their transmission to Indian assets'],
  });
}

export function newsPrompt(context) {
  return prompt(context, [
    `HEADLINES (numbered):\n${headlinesToText(context.headlines, { withSummary: true }) || 'None available.'}`,
    `Pick the ${STORY_LIMIT - 2}-${STORY_LIMIT} most market-relevant stories. For each, write one analysis of 150-180 words: ` +
      'what happened, why it matters for markets, which sectors or assets it affects, and what would change the picture. ' +
      'Use only facts in the headline and its summary; say so when the detail is not yet known.',
  ], { stories: [{ id: 'headline number', analysis: '150-180 words' }] });
}

export function viewPrompt(context) {
  return prompt(context, [
    `ANALYST BOARD:\n${boardToText(context.board)}`,
    `HEADLINES:\n${headlinesToText(context.headlines) || 'None available.'}`,
    'Write the house view, about 1,100 words in total. Keep the house stance given by the board.',
    `Sector calls must use sector names from the "NSE sectors" data and one of ${JSON.stringify(SECTOR_CALLS)}.`,
  ], {
    thesis: ['4 paragraphs of 110-140 words explaining the house stance and the evidence for it'],
    sectors: [{ name: 'NSE sector name', call: 'overweight | neutral | underweight', reason: '40-60 words' }],
    risks: ['3 paragraphs of 70-90 words: what would prove the view wrong'],
    watch: ['5 specific things to watch next, one sentence each'],
  });
}

const OVERVIEW_SECTIONS = Object.freeze(['india', 'global', 'macro']);
const SECTION_LIMITS = Object.freeze({ india: 5, global: 4, macro: 4 });
// A section key the model wrote as a list item instead of as a JSON key. Bare: 'macro=[' or '"global": ['.
// With text: 'macro: ["The rupee firmed…' (the key must be followed by a bracket or quote, so a sentence
// such as "Global: US stocks fell" is left alone as prose).
const BARE_KEY = /^\s*["']?(india|global|macro)["']?\s*[:=]\s*[[{(]?\s*$/i;
const KEY_WITH_TEXT = /^\s*["']?(india|global|macro)["']?\s*[:=]\s*(?:[[{(]\s*["']?|["'])(.+)$/i;
const TRAILING_JSON = /["'\]})\s,]+$/;

/** The section an item names and any text that came with it, or null for an ordinary paragraph. */
function readMarker(item) {
  if (typeof item !== 'string') return null;
  const bare = item.match(BARE_KEY);
  if (bare) return { section: bare[1].toLowerCase(), text: '' };
  const joined = item.match(KEY_WITH_TEXT);
  return joined ? { section: joined[1].toLowerCase(), text: joined[2].replace(TRAILING_JSON, '') } : null;
}

/**
 * The overview's section lists with misfiled paragraphs put back. An item that names a section ("macro=[")
 * starts that section: it and the items after it move there, after that section's own paragraphs. The key
 * itself is dropped so it can never be published. `moved` counts the paragraphs that changed section.
 */
export function regroupSections(json) {
  const own = Object.fromEntries(OVERVIEW_SECTIONS.map((k) => [k, []]));
  const shifted = Object.fromEntries(OVERVIEW_SECTIONS.map((k) => [k, []]));
  let moved = 0;
  for (const key of OVERVIEW_SECTIONS) {
    let target = key;
    for (const item of Array.isArray(json?.[key]) ? json[key] : []) {
      const marker = readMarker(item);
      if (marker) target = marker.section;
      const text = marker ? marker.text : item;
      if (marker && !text) continue;
      if (target === key) own[key].push(text);
      else { shifted[target].push(text); moved += 1; }
    }
  }
  const sections = Object.fromEntries(OVERVIEW_SECTIONS.map((k) => [k, [...own[k], ...shifted[k]]]));
  return { sections, moved };
}

/** A section's cleaned paragraphs, logging any cut by its cap so a long or misfiled reply is visible. */
function sectionList(sections, key) {
  const limit = SECTION_LIMITS[key];
  const all = cleanList(sections[key], { limit: Number.MAX_SAFE_INTEGER });
  if (all.length > limit) console.warn(`⚠️ [Edition] Overview ${key}: dropped ${all.length - limit} paragraph(s) over the cap of ${limit}`);
  return all.slice(0, limit);
}

/** Normalised overview, or null when unusable. */
export function parseOverview(reply) {
  const json = extractJson(reply);
  const { sections, moved } = regroupSections(json);
  const title = cleanText(json?.title, 120);
  if (moved > 0) console.warn(`⚠️ [Edition] Overview: moved ${moved} misfiled paragraph(s) back to their section`);
  const india = sectionList(sections, 'india');
  if (!title || india.length === 0) return null;
  return {
    title,
    summary: cleanText(json.summary, 600),
    india,
    global: sectionList(sections, 'global'),
    macro: sectionList(sections, 'macro'),
  };
}

/** Chosen stories mapped to real headlines (bad or duplicate ids dropped), or null when none survive. */
export function parseNews(reply, headlines) {
  const json = extractJson(reply);
  const seen = new Set();
  const stories = (Array.isArray(json?.stories) ? json.stories : [])
    .map((s) => ({ index: Number.parseInt(s?.id, 10) - 1, analysis: cleanText(s?.analysis, 1800) }))
    .filter((s) => s.analysis && headlines[s.index] && !seen.has(s.index) && seen.add(s.index))
    .slice(0, STORY_LIMIT)
    .map((s) => ({ ...headlines[s.index], analysis: s.analysis }));
  return stories.length ? stories : null;
}

/** Normalised view; sector calls limited to known sectors and calls. Null when there is no thesis. */
export function parseView(reply, sectorNames) {
  const json = extractJson(reply);
  const thesis = cleanList(json?.thesis, { limit: 5 });
  if (thesis.length === 0) return null;
  const known = new Map(sectorNames.map((n) => [n.toLowerCase(), n]));
  const seen = new Set();
  const sectors = (Array.isArray(json.sectors) ? json.sectors : [])
    .map((s) => ({
      name: known.get(String(s?.name || '').toLowerCase().trim()),
      call: String(s?.call || '').toLowerCase().trim(),
      reason: cleanText(s?.reason, 600),
    }))
    .filter((s) => s.name && SECTOR_CALLS.includes(s.call) && !seen.has(s.name) && seen.add(s.name));
  return {
    thesis,
    sectors,
    risks: cleanList(json.risks, { limit: 4 }),
    watch: cleanList(json.watch, { limit: 6, max: 400 }),
  };
}

const MAX_ATTEMPTS = 2;

/**
 * One section, retried once. Returns the parsed section (or null) and every attempt's raw reply or error,
 * so a bad render can be diagnosed — or rebuilt — without paying for the calls again.
 */
async function callSection(name, { askAI, env }, text, parse) {
  const attempts = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const section = name.toLowerCase();
    try {
      const reply = await askAI(text, { role: 'generate', env, responseFormat: 'json' });
      attempts.push({ section, attempt, reply: String(reply ?? '') });
      const parsed = parse(reply);
      if (parsed) return { parsed, attempts };
      console.warn(`⚠️ [Edition] ${name} attempt ${attempt}: reply was not valid JSON for this section`);
    } catch (error) {
      attempts.push({ section, attempt, error: error.message });
      console.warn(`⚠️ [Edition] ${name} attempt ${attempt} failed: ${error.message}`);
      // A budget refusal will refuse again; retrying only adds log noise.
      if (error?.name === 'BudgetExceededError') break;
    }
  }
  return { parsed: null, attempts };
}

/**
 * Writes the edition text in three calls, one at a time. Returns `{ text, replies }`: `text` is null when the
 * overview fails (no commentary); missing news or view sections are null for the template's fallbacks.
 * `replies` lists every raw reply or error in call order.
 */
export async function writeEdition({ askAI, env, sectorNames = [], ...context }) {
  const io = { askAI, env };
  const overview = await callSection('Overview', io, overviewPrompt(context), parseOverview);
  if (!overview.parsed) {
    console.warn('⚠️ [Edition] Overview section failed twice; publishing without commentary');
    return { text: null, replies: overview.attempts };
  }
  const news = await callSection('News', io, newsPrompt(context), (r) => parseNews(r, context.headlines));
  const view = await callSection('View', io, viewPrompt(context), (r) => parseView(r, sectorNames));
  return {
    text: { ...overview.parsed, news: news.parsed, view: view.parsed },
    replies: [...overview.attempts, ...news.attempts, ...view.attempts],
  };
}
