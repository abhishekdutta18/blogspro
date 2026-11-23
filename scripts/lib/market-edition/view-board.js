/**
 * View board — the MiroFish consensus idea applied to the edition's "our view": three analyst personas read
 * the same market data and headlines, each returns a stance with reasons, and the house view is the
 * conviction-weighted average of their stances. Disagreement is kept, not hidden: the page shows each take.
 * Three small calls per edition keep this inside free-tier AI quotas.
 */

import { cleanList, extractJson } from './json-reply.js';

export const STANCES = Object.freeze(['bearish', 'cautious', 'neutral', 'constructive', 'bullish']);

export const PERSONAS = Object.freeze([
  {
    id: 'momentum',
    name: 'Momentum strategist',
    brief: 'You trade price action and trend. Judge whether momentum and breadth support adding risk today.',
  },
  {
    id: 'risk',
    name: 'Risk manager',
    brief: 'You look for what can go wrong: volatility, stretched valuations, event risk, currency and oil shocks.',
  },
  {
    id: 'macro',
    name: 'Macro economist',
    brief: 'You read rates, the dollar, commodities, central-bank policy and fund flows, and what they mean for Indian equities.',
  },
]);

/** Prompt for one persona; the reply must be a small JSON object. */
export function personaPrompt(persona, { edition, marketText, headlinesText }) {
  return [
    `You are the ${persona.name} on an Indian markets research desk. ${persona.brief}`,
    `Edition: ${edition.label}. ${edition.focus}`,
    `MARKET DATA (the only figures you may cite):\n${marketText}`,
    `HEADLINES:\n${headlinesText || 'No headlines available.'}`,
    'Quotes are marked live or closed; a closed market is not trading now. USD/INR falling means a stronger rupee.',
    'Give your stance on Indian equities for the next session.',
    `Reply with JSON only: {"stance": one of ${JSON.stringify(STANCES)}, "conviction": 1-5, "points": [2-3 short reasons citing the data above]}`,
  ].join('\n\n');
}

/** A persona reply as { stance, conviction, points }, or null when the reply is unusable. */
export function parsePersonaReply(reply) {
  const json = extractJson(reply);
  const stance = String(json?.stance || '').toLowerCase().trim();
  if (!STANCES.includes(stance)) return null;
  const conviction = Math.min(5, Math.max(1, Math.round(Number(json.conviction)) || 3));
  return { stance, conviction, points: cleanList(json.points, { limit: 3, max: 240 }) };
}

/**
 * House view from persona takes: the conviction-weighted mean stance, and how split the board is
 * ('aligned' within one step, 'divided' when takes span three or more steps).
 */
export function buildConsensus(takes) {
  const valid = takes.filter(Boolean);
  if (valid.length === 0) return null;
  const score = (t) => STANCES.indexOf(t.stance);
  const weight = valid.reduce((sum, t) => sum + t.conviction, 0);
  const mean = valid.reduce((sum, t) => sum + score(t) * t.conviction, 0) / weight;
  const spread = Math.max(...valid.map(score)) - Math.min(...valid.map(score));
  return {
    stance: STANCES[Math.round(mean)],
    agreement: spread <= 1 ? 'aligned' : spread === 2 ? 'mixed' : 'divided',
    voters: valid.length,
  };
}

/** Runs each persona in turn (one call at a time, to stay under provider rate limits). */
export async function runViewBoard({ askAI, edition, marketText, headlinesText, env }) {
  const takes = [];
  for (const persona of PERSONAS) {
    try {
      const reply = await askAI(personaPrompt(persona, { edition, marketText, headlinesText }), { role: 'research', env, responseFormat: 'json' });
      const take = parsePersonaReply(reply);
      if (!take) throw new Error('reply had no valid stance');
      takes.push({ persona: persona.name, ...take });
    } catch (error) {
      console.warn(`⚠️ [Edition] ${persona.name} unavailable: ${error.message}`);
    }
  }
  return { takes, consensus: buildConsensus(takes) };
}
