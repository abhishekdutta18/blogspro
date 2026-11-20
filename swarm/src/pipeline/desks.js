/**
 * desks.js — the analyst desks that run in parallel for an hourly briefing.
 */

export const HOURLY_DESKS = Object.freeze([
  { id: 'policy', name: 'Macro & Policy', focus: 'central banks (RBI, Fed, ECB, BoJ), inflation, growth data, fiscal and regulatory moves (SEBI, government).' },
  { id: 'india_equities', name: 'Indian Equities', focus: 'Nifty, Sensex, sector rotation, flows (FII/DII), earnings and large-cap moves.' },
  { id: 'rates_fx', name: 'Rates & FX', focus: 'bond yields, the rupee, the dollar, liquidity and credit conditions.' },
  { id: 'global_risk', name: 'Global Risk & Commodities', focus: 'US and Asian markets, crude, gold, crypto, geopolitics and risk sentiment.' }
]);

/** Below this many usable desk notes the editor has too little to write from. */
export const MIN_DESK_NOTES = 2;
