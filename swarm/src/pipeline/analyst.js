/**
 * analyst.js — runs every desk in parallel through the fleet. A desk that fails or
 * reports NO_SIGNAL is left out; the run fails only if too few desks have something to say.
 */
import { deskMessages } from './prompts.js';
import { MIN_DESK_NOTES } from './desks.js';
import { silentLogger } from '../log.js';

export class NotEnoughSignalError extends Error {
  name = 'NotEnoughSignalError';
}

const NO_SIGNAL = /^\s*NO_SIGNAL\s*$/;

/**
 * @param {{fleet: {complete: Function}, desks: readonly {id: string, name: string, focus: string}[],
 *          headlineBlock: string, slotLabel: string, log?: import('../log.js').Logger}} options
 * @returns {Promise<{desk: string, text: string, provider: string, model: string}[]>}
 */
export async function runDesks({ fleet, desks, headlineBlock, slotLabel, log = silentLogger }) {
  const settled = await Promise.allSettled(
    desks.map(desk => fleet.complete(deskMessages(desk, headlineBlock, slotLabel), { maxTokens: 2048 }))
  );

  const notes = settled.flatMap((result, index) => {
    const desk = desks[index];
    if (result.status === 'rejected') {
      log.warn('desk.failed', { desk: desk.id, reason: result.reason?.message });
      return [];
    }
    if (NO_SIGNAL.test(result.value.text)) {
      log.info('desk.no_signal', { desk: desk.id });
      return [];
    }
    log.info('desk.ok', { desk: desk.id, provider: result.value.provider });
    return [{ desk: desk.name, text: result.value.text.trim(), provider: result.value.provider, model: result.value.model }];
  });

  if (notes.length < MIN_DESK_NOTES) {
    throw new NotEnoughSignalError(`Only ${notes.length} desk(s) produced notes; need ${MIN_DESK_NOTES}.`);
  }
  return notes;
}
