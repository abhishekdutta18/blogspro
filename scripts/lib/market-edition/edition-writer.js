/**
 * Edition writer — one model call that turns the data, headlines and view-board consensus into the edition's
 * text: title, summary, market description, a take on each chosen story, the house view and what to watch.
 * The model never supplies the market numbers shown in tables; it is told to cite only the data it is given.
 */

import { cleanList, cleanText, extractJson } from './json-reply.js';

const MAX_STORIES = 6;

/** Numbered headline list for prompts ("[3] Title (Source)"). */
export function headlinesToText(headlines) {
  return headlines.map((h, i) => `[${i + 1}] ${h.title} (${h.source})`).join('\n');
}

function boardToText(board) {
  if (!board?.consensus) return 'No analyst board view is available; form the view from the data.';
  const takes = board.takes.map((t) => `- ${t.persona}: ${t.stance} (conviction ${t.conviction}/5). ${t.points.join(' ')}`);
  return `House stance: ${board.consensus.stance} (board ${board.consensus.agreement}).\n${takes.join('\n')}`;
}

export function writerPrompt({ edition, dateLabel, marketText, headlines, board }) {
  return [
    'You write a market briefing for Indian investors. Voice: direct, data-driven, sceptical, no hype.',
    'Never mention the publication name. Never invent figures: every number you write must appear in MARKET DATA.',
    `Edition: ${edition.label}, ${dateLabel}. ${edition.focus}`,
    `MARKET DATA:\n${marketText}`,
    `HEADLINES (numbered):\n${headlinesToText(headlines) || 'None available.'}`,
    `ANALYST BOARD:\n${boardToText(board)}`,
    'Reply with JSON only, no prose around it:',
    JSON.stringify({
      title: 'specific headline for this edition, under 90 characters',
      summary: '2 sentences: the single most important takeaway',
      market: ['3 short paragraphs describing what markets did and why, citing MARKET DATA'],
      news: [{ id: 'headline number', take: 'one or two sentences on why it matters for markets' }],
      view: ['3-4 points explaining the house stance; keep the stance given by the board'],
      watch: ['3-4 specific things to watch next'],
    }),
    `Pick the ${MAX_STORIES} most market-relevant headlines for "news". Use their numbers as "id".`,
  ].join('\n\n');
}

/** Normalised edition text from a writer reply, or null when the reply is unusable. */
export function parseWriterReply(reply, headlines) {
  const json = extractJson(reply);
  const title = cleanText(json?.title, 120);
  const market = cleanList(json?.market, { limit: 4, max: 900 });
  if (!title || market.length === 0) return null;
  const seen = new Set();
  const news = (Array.isArray(json.news) ? json.news : [])
    .map((n) => ({ index: Number.parseInt(n?.id, 10) - 1, take: cleanText(n?.take, 400) }))
    .filter((n) => Number.isInteger(n.index) && headlines[n.index] && !seen.has(n.index) && seen.add(n.index))
    .slice(0, MAX_STORIES)
    .map((n) => ({ ...headlines[n.index], take: n.take }));
  return {
    title,
    summary: cleanText(json.summary, 400),
    market,
    news,
    view: cleanList(json.view, { limit: 4, max: 400 }),
    watch: cleanList(json.watch, { limit: 5, max: 240 }),
  };
}

/** Writes the edition text, retrying once on an unusable reply. Throws when both attempts fail. */
export async function writeEdition({ askAI, env, ...context }) {
  const prompt = writerPrompt(context);
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const parsed = parseWriterReply(await askAI(prompt, { role: 'generate', env }), context.headlines);
      if (parsed) return parsed;
      lastError = new Error('writer reply was not valid edition JSON');
    } catch (error) {
      lastError = error;
    }
    console.warn(`⚠️ [Edition] Writer attempt ${attempt} failed: ${lastError.message}`);
  }
  throw lastError;
}
