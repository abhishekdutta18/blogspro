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

/** Normalised overview, or null when unusable. */
export function parseOverview(reply) {
  const json = extractJson(reply);
  const title = cleanText(json?.title, 120);
  const india = cleanList(json?.india, { limit: 5 });
  if (!title || india.length === 0) return null;
  return {
    title,
    summary: cleanText(json.summary, 600),
    india,
    global: cleanList(json.global, { limit: 4 }),
    macro: cleanList(json.macro, { limit: 4 }),
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

async function callSection(name, { askAI, env }, text, parse) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const parsed = parse(await askAI(text, { role: 'generate', env }));
      if (parsed) return parsed;
      console.warn(`⚠️ [Edition] ${name} attempt ${attempt}: reply was not valid JSON for this section`);
    } catch (error) {
      console.warn(`⚠️ [Edition] ${name} attempt ${attempt} failed: ${error.message}`);
    }
  }
  return null;
}

/**
 * Writes the edition text in three calls, one at a time. Throws when the overview fails (no commentary);
 * missing news or view sections come back as null for the template's fallbacks.
 */
export async function writeEdition({ askAI, env, sectorNames = [], ...context }) {
  const io = { askAI, env };
  const overview = await callSection('Overview', io, overviewPrompt(context), parseOverview);
  if (!overview) throw new Error('overview section failed twice');
  const news = await callSection('News', io, newsPrompt(context), (r) => parseNews(r, context.headlines));
  const view = await callSection('View', io, viewPrompt(context), (r) => parseView(r, sectorNames));
  return { ...overview, news, view };
}
