/**
 * run-hourly.js — one hourly run: news → desks → editor → guard → store. Every step that
 * can fail stops the run before anything is written, so a bad hour leaves the previous
 * briefing on the site. Dependencies are passed in so tests can drive it without network.
 */
import { fetchHeadlines } from './news/fetch.js';
import { FEEDS } from './news/feeds.js';
import { HOURLY_DESKS } from './pipeline/desks.js';
import { runDesks } from './pipeline/analyst.js';
import { composeBriefing } from './pipeline/editor.js';
import { checkBriefing, HOURLY_RULES } from './pipeline/guard.js';
import { formatHeadlines } from './pipeline/prompts.js';
import { hourlySlot } from './pipeline/slot.js';

const NEWS_WINDOW_HOURS = 24;
const PER_FEED_LIMIT = 8;
const TOTAL_HEADLINES = 40;

export class RunAborted extends Error {
  /** @param {string} reason short machine-readable cause @param {string} message */
  constructor(reason, message) {
    super(message);
    this.name = 'RunAborted';
    this.reason = reason;
  }
}

/**
 * @param {{config: ReturnType<typeof import('./config.js').loadConfig>, fleet: {complete: Function},
 *          store: ReturnType<typeof import('./store/briefings.js').openBriefingStore> | null,
 *          now: number, log: import('./log.js').Logger, fetchImpl?: typeof fetch, feeds?: readonly object[]}} deps
 * @returns {Promise<object>} the briefing document (saved unless `store` is null)
 */
export async function runHourly({ config, fleet, store, now, log, fetchImpl = fetch, feeds = FEEDS }) {
  const slot = hourlySlot(now);
  log.info('run.start', { slot: slot.id, providers: config.providers.map(p => p.name) });

  const headlines = await fetchHeadlines({
    feeds, now, maxAgeHours: NEWS_WINDOW_HOURS, perFeedLimit: PER_FEED_LIMIT, totalLimit: TOTAL_HEADLINES, fetchImpl, log
  });
  if (headlines.length < config.minHeadlines) {
    throw new RunAborted('not_enough_news', `Only ${headlines.length} fresh headlines (need ${config.minHeadlines}).`);
  }
  const headlineBlock = formatHeadlines(headlines);

  const deskNotes = await runDesks({ fleet, desks: HOURLY_DESKS, headlineBlock, slotLabel: slot.label, log });
  const check = draft => checkBriefing(draft, headlines.length, HOURLY_RULES).problems;
  const { draft, provider, model } = await composeBriefing({ fleet, deskNotes, headlineBlock, slotLabel: slot.label, check, log });

  // The editor already retried against the same check; this is the final, authoritative gate.
  const { problems, citations } = checkBriefing(draft, headlines.length, HOURLY_RULES);
  if (problems.length) throw new RunAborted('guard_failed', `Briefing failed checks: ${problems.join('; ')}`);

  const briefing = {
    id: slot.id,
    frequency: 'hourly',
    slot: slot.label,
    title: draft.title,
    summary: draft.summary,
    sections: draft.sections,
    sources: citations.map(n => ({ n, title: headlines[n - 1].title, url: headlines[n - 1].url, source: headlines[n - 1].source })),
    desks: deskNotes.map(note => note.desk),
    model: `${provider}/${model}`,
    generatedAt: new Date(now).toISOString(),
    published: true
  };

  if (store) {
    store.save(briefing);
    const pruned = store.pruneHourly(config.hourlyRetention);
    log.info('run.saved', { slot: slot.id, sources: citations.length, pruned });
  }
  return briefing;
}
