/**
 * editor.js — asks the fleet to merge desk notes into one briefing and parses the JSON
 * it returns. Models sometimes wrap JSON in fences or prose, so the parser is lenient
 * about the wrapper and strict about the shape. A reply that is unparseable or fails
 * `check` gets one retry, which shows the model its own reply and what was wrong with it.
 */
import { editorMessages, editorRetryMessages } from './prompts.js';
import { silentLogger } from '../log.js';

export class EditorOutputError extends Error {
  name = 'EditorOutputError';
}

const ATTEMPTS = 2;

/** Pulls the outermost {...} out of a completion and parses it, or returns null. */
export function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const isNonEmptyString = value => typeof value === 'string' && value.trim() !== '';

/** @returns {{title: string, summary: string, sections: {heading: string, body: string}[]} | null} */
export function toDraft(parsed) {
  if (!parsed || !isNonEmptyString(parsed.title) || !isNonEmptyString(parsed.summary) || !Array.isArray(parsed.sections)) return null;
  const sections = parsed.sections
    .filter(s => s && isNonEmptyString(s.heading) && isNonEmptyString(s.body))
    .map(s => ({ heading: s.heading.trim(), body: s.body.trim() }));
  return { title: parsed.title.trim(), summary: parsed.summary.trim(), sections };
}

const UNPARSEABLE = 'the reply was not a JSON object with title, summary and sections';

/**
 * Runs the editor until a draft parses and passes `check`, within ATTEMPTS calls.
 * If drafts parse but never pass, the last one is returned and the caller's guard decides;
 * only when nothing parses at all does it throw.
 * @param {{fleet: {complete: Function}, deskNotes: {desk: string, text: string}[], headlineBlock: string,
 *          slotLabel: string, check?: (draft: object) => string[], log?: import('../log.js').Logger}} options
 */
export async function composeBriefing({ fleet, deskNotes, headlineBlock, slotLabel, check = () => [], log = silentLogger }) {
  const original = editorMessages(deskNotes, headlineBlock, slotLabel);
  let messages = original;
  let lastParsed = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const result = await fleet.complete(messages, { maxTokens: 6000, temperature: 0.3 });
    const draft = toDraft(extractJson(result.text));
    const problems = draft ? check(draft) : [UNPARSEABLE];
    if (draft) lastParsed = { draft, provider: result.provider, model: result.model };
    if (problems.length === 0) return lastParsed;
    log.warn('editor.rejected', { attempt, provider: result.provider, problems });
    messages = editorRetryMessages(original, result.text, problems);
  }
  if (lastParsed) return lastParsed;
  throw new EditorOutputError(`Editor returned no usable JSON after ${ATTEMPTS} attempts.`);
}
