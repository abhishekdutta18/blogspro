import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDesks, NotEnoughSignalError } from '../src/pipeline/analyst.js';
import { composeBriefing, extractJson, toDraft, EditorOutputError } from '../src/pipeline/editor.js';
import { checkBriefing, citedIndices } from '../src/pipeline/guard.js';
import { hourlySlot } from '../src/pipeline/slot.js';
import { formatHeadlines } from '../src/pipeline/prompts.js';

const DESKS = [
  { id: 'a', name: 'Desk A', focus: 'a' },
  { id: 'b', name: 'Desk B', focus: 'b' },
  { id: 'c', name: 'Desk C', focus: 'c' }
];

/** A fleet stub that answers each call with the next scripted reply (string or Error). */
const scriptedFleet = replies => {
  const calls = [];
  return {
    calls,
    complete: async messages => {
      calls.push(messages);
      const reply = replies[calls.length - 1];
      if (reply instanceof Error) throw reply;
      return { text: reply, provider: 'p', model: 'm' };
    }
  };
};

const words = n => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const goodDraft = () => ({
  title: 'Rupee weakens as crude climbs',
  summary: 'Crude rose [1]. The RBI held [2].',
  sections: [
    { heading: 'Lead', body: `${words(200)} [1] [2]` },
    { heading: 'Rates', body: `${words(200)} [3]` },
    { heading: 'What to watch', body: `${words(250)} [4, 5]` }
  ]
});

test('runDesks drops failed and NO_SIGNAL desks and keeps the rest', async () => {
  const fleet = scriptedFleet(['note a', new Error('fleet down'), '  NO_SIGNAL ']);
  await assert.rejects(runDesks({ fleet, desks: DESKS, headlineBlock: '[1] x', slotLabel: 's' }), NotEnoughSignalError,
    'one usable desk is below the minimum of two');

  const fleet2 = scriptedFleet(['note a', 'note b', 'NO_SIGNAL']);
  const notes2 = await runDesks({ fleet: fleet2, desks: DESKS, headlineBlock: '[1] x', slotLabel: 's' });
  assert.deepEqual(notes2.map(n => n.desk), ['Desk A', 'Desk B']);
});

test('extractJson tolerates code fences and prose around the object', () => {
  assert.deepEqual(extractJson('Here you go:\n```json\n{"a": 1}\n```'), { a: 1 });
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson('{broken'), null);
});

test('toDraft rejects missing fields and drops empty sections', () => {
  assert.equal(toDraft({ title: 'x', sections: [] }), null);
  const draft = toDraft({ title: ' T ', summary: 'S', sections: [{ heading: 'H', body: 'B' }, { heading: '', body: 'x' }] });
  assert.deepEqual(draft, { title: 'T', summary: 'S', sections: [{ heading: 'H', body: 'B' }] });
});

test('composeBriefing re-asks once on unparseable output, then gives up', async () => {
  const ok = JSON.stringify(goodDraft());
  const fleet = scriptedFleet(['not json', ok]);
  const { draft } = await composeBriefing({ fleet, deskNotes: [{ desk: 'A', text: 'n' }], headlineBlock: '', slotLabel: 's' });
  assert.equal(draft.title, 'Rupee weakens as crude climbs');

  const failing = scriptedFleet(['nope', 'still nope']);
  await assert.rejects(composeBriefing({ fleet: failing, deskNotes: [], headlineBlock: '', slotLabel: 's' }), EditorOutputError);
});

test('composeBriefing retries a draft that fails the check, telling the model what was wrong', async () => {
  const short = JSON.stringify({ ...goodDraft(), sections: goodDraft().sections.slice(0, 1) });
  const fleet = scriptedFleet([short, JSON.stringify(goodDraft())]);
  const check = draft => (draft.sections.length < 3 ? ['1 sections (want 3-8)'] : []);
  const { draft } = await composeBriefing({ fleet, deskNotes: [{ desk: 'A', text: 'n' }], headlineBlock: '', slotLabel: 's', check });

  assert.equal(draft.sections.length, 3);
  const retry = fleet.calls[1];
  assert.equal(retry.length, fleet.calls[0].length + 2, 'retry carries the rejected reply and the feedback');
  assert.deepEqual(retry.at(-2), { role: 'assistant', content: short });
  assert.match(retry.at(-1).content, /1 sections \(want 3-8\)/);
});

test('composeBriefing returns the last parsed draft when every attempt fails the check', async () => {
  const fleet = scriptedFleet([JSON.stringify(goodDraft()), JSON.stringify(goodDraft())]);
  const { draft } = await composeBriefing({ fleet, deskNotes: [], headlineBlock: '', slotLabel: 's', check: () => ['too short'] });
  assert.equal(draft.title, 'Rupee weakens as crude climbs');
  assert.equal(fleet.calls.length, 2);
});

test('citedIndices reads single and grouped citations', () => {
  assert.deepEqual(citedIndices('a [3] b [1, 2] c [3]'), [1, 2, 3]);
});

test('checkBriefing passes a well-formed draft', () => {
  const { problems, citations } = checkBriefing(goodDraft(), 10);
  assert.deepEqual(problems, []);
  assert.deepEqual(citations, [1, 2, 3, 4, 5]);
});

test('checkBriefing flags the publication name, AI talk, bad citations and length', () => {
  const draft = goodDraft();
  const bad = {
    ...draft,
    summary: 'As an AI I note BlogsPro readers [42].',
    sections: draft.sections.slice(0, 2).map(s => ({ ...s, body: `${words(50)} [1]` }))
  };
  const { problems } = checkBriefing(bad, 10);
  const text = problems.join(' | ');
  for (const expected of ['names the publication', 'mentions being an AI', 'do not exist: 42', 'sections', 'words', 'distinct sources']) {
    assert.match(text, new RegExp(expected));
  }
});

test('hourlySlot uses IST, so 01:30 UTC is the 07:00 IST slot', () => {
  assert.deepEqual(hourlySlot(Date.parse('2026-11-15T01:30:00Z')), { id: 'H_2026-11-15_07', label: '07:00 IST, 15 Nov 2026', date: '2026-11-15', hour: 7 });
  assert.equal(hourlySlot(Date.parse('2026-11-14T18:45:00Z')).id, 'H_2026-11-15_00');
});

test('formatHeadlines numbers headlines from 1 with their source', () => {
  assert.equal(formatHeadlines([{ title: 'T', summary: '', source: 'Mint' }]), '[1] (Mint) T');
});
