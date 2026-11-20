/**
 * prompts.js — the house persona and the prompt builders for desk analysts and the
 * editor. Headlines are numbered [1]..[n] so every claim can cite its source and the
 * guard can check that the citations are real.
 */

export const PERSONA = [
  'You are a senior markets strategist writing an institutional intelligence briefing.',
  'Voice: truth-first, data-driven, sceptical of consensus, cold and precise. No hype, no filler, no emojis.',
  'Ground every factual claim in the numbered headlines you are given and cite them inline like [3].',
  'Never invent numbers, quotes or events. If the headlines do not support a claim, do not make it.',
  'Do not give personalised investment advice or buy/sell/target-price recommendations; treat broker stock tips as noise.',
  'Never name the publication you are writing for, and never mention being an AI.'
].join(' ');

/** @param {{title: string, summary: string, source: string}[]} headlines */
export function formatHeadlines(headlines) {
  return headlines
    .map((h, i) => `[${i + 1}] (${h.source}) ${h.title}${h.summary ? ` — ${h.summary}` : ''}`)
    .join('\n');
}

/** @param {{name: string, focus: string}} desk @param {string} headlineBlock @param {string} slotLabel */
export function deskMessages(desk, headlineBlock, slotLabel) {
  return [
    { role: 'system', content: PERSONA },
    {
      role: 'user',
      content: [
        `Briefing slot: ${slotLabel}.`,
        `You are the ${desk.name} desk. Focus: ${desk.focus}`,
        'From the headlines below, write 120-200 words of analysis for your desk only: what moved, why it matters,',
        'and what to watch next. Cite headlines inline as [n]. If nothing relevant to your desk appears, reply with exactly: NO_SIGNAL',
        '',
        'Headlines:',
        headlineBlock
      ].join('\n')
    }
  ];
}

/** Body length the editor is asked for; the guard accepts a wider band (see HOURLY_RULES). */
export const EDITOR_TARGET_WORDS = '800-1100';

/**
 * @param {{desk: string, text: string}[]} deskNotes
 * @param {string} headlineBlock
 * @param {string} slotLabel
 */
export function editorMessages(deskNotes, headlineBlock, slotLabel) {
  const notes = deskNotes.map(note => `### ${note.desk}\n${note.text}`).join('\n\n');
  return [
    { role: 'system', content: PERSONA },
    {
      role: 'user',
      content: [
        `Briefing slot: ${slotLabel}.`,
        `Merge the desk notes into one hourly briefing of ${EDITOR_TARGET_WORDS} words. Remove overlap, keep the citations [n],`,
        'lead with the single most consequential development, and end with a short "What to watch" section.',
        'Return ONLY a JSON object, no code fences, with this shape:',
        '{"title": string (max 110 chars), "summary": string (2 sentences), "sections": [{"heading": string, "body": markdown string}]}',
        'Use 4-6 sections.',
        '',
        'Desk notes:',
        notes,
        '',
        'Headlines (for citation numbers):',
        headlineBlock
      ].join('\n')
    }
  ];
}

/**
 * The editor conversation extended with its rejected reply and what was wrong with it, so
 * the model revises its own draft instead of starting over blind.
 * @param {{role: string, content: string}[]} messages the original editor messages
 * @param {string} rejectedText the reply that failed
 * @param {string[]} problems why it failed, in the guard's words
 */
export function editorRetryMessages(messages, rejectedText, problems) {
  return [
    ...messages,
    { role: 'assistant', content: rejectedText },
    {
      role: 'user',
      content: [
        `That briefing was rejected: ${problems.join('; ')}.`,
        `Rewrite it so every problem is fixed. The section bodies together must total ${EDITOR_TARGET_WORDS} words.`,
        'Keep the same citation numbers and cite only headlines from the list. Return ONLY the JSON object.'
      ].join('\n')
    }
  ];
}
