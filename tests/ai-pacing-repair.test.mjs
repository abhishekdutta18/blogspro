/**
 * Tests for the two fixes after the first live daily run: repairing JSON replies a provider cut off mid-way
 * (keep the complete fields, drop the broken tail), and pacing calls to a tokens-per-minute limit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, repairTruncatedJson } from '../scripts/lib/market-edition/json-reply.js';
import { parseView } from '../scripts/lib/market-edition/edition-writer.js';
import { createPacedAskAI, paceFromEnv } from '../scripts/lib/ai-pacer.js';

test('repairTruncatedJson keeps complete fields of a reply cut off inside a later string', () => {
  // Shape of the live failure: the sector reason lost its closing quote and the reply was cut off.
  const cut = '{"thesis":["Stay cautious, banks led the fall."],"sectors":[{"name":"Financials","call":"underweight","reason":"Rate risk.},{"';
  assert.deepEqual(repairTruncatedJson(cut), {
    thesis: ['Stay cautious, banks led the fall.'],
    sectors: [{ name: 'Financials', call: 'underweight', reason: 'Rate risk.},{' }],
  });
  assert.equal(parseView(cut, ['Financials'], { lenient: true }).sectors[0].reason, 'Rate risk.', 'JSON debris is trimmed from the text');
});

test('repairTruncatedJson drops a dangling key and a half-written string', () => {
  assert.deepEqual(repairTruncatedJson('{"thesis":["One.","Two."],"a stray key that never ends'), { thesis: ['One.', 'Two.'] });
  assert.deepEqual(repairTruncatedJson('{"thesis":["One.","Tw'), { thesis: ['One.'] });
  assert.deepEqual(repairTruncatedJson('{"n":12,"s":"x\\"y","t":tr'), { n: 12, s: 'x"y' });
});

test('repairTruncatedJson returns null when nothing complete survives', () => {
  assert.equal(repairTruncatedJson('{"thesis":["half'), null);
  assert.equal(repairTruncatedJson('no json here'), null);
});

// Regression: the 25 Nov 2026 22:00 IST overview (swarm-hourly-1795624279623, attempt 2) was complete but ended
// `…sectors."}]` — the object closed before its last array. The repair saw the whole text as "closed" and threw
// away every earlier cut point, so the edition published with no commentary.
test('repairTruncatedJson keeps a reply whose closing brackets are in the wrong order', () => {
  const para = (n) => `Paragraph ${n} on the session, with figures like 25,819.25 (+1.85%).`;
  const reply = `{"title":"Nifty Hits Record High as Global AI Selloff Deepens","summary":"Divergence.","india":["${para(1)}","${para(2)}"],"global":["${para(3)}"],"macro":["${para(4)}","${para(5)}"}]`;
  assert.throws(() => JSON.parse(reply));
  assert.deepEqual(repairTruncatedJson(reply), {
    title: 'Nifty Hits Record High as Global AI Selloff Deepens',
    summary: 'Divergence.',
    india: [para(1), para(2)],
    global: [para(3)],
    macro: [para(4), para(5)],
  });
  assert.equal(extractJson(reply, { repair: true }).macro.length, 2);
});

test('repairTruncatedJson still tries earlier cuts when a document closes but does not parse', () => {
  // Balanced brackets, but an invalid escape inside the last string: the whole text cannot parse.
  assert.deepEqual(repairTruncatedJson('{"a":["ok"],"b":"bad \\x escape"}'), { a: ['ok'] });
});

test('extractJson repairs only when asked, so a first broken reply still earns a retry', () => {
  assert.deepEqual(extractJson('```json\n{"a":[1,2]}\n```'), { a: [1, 2] });
  assert.equal(extractJson('Here you go: {"a":[1,2],"b":"cut'), null);
  assert.deepEqual(extractJson('Here you go: {"a":[1,2],"b":"cut', { repair: true }), { a: [1, 2] });
});

test('parseView recovers the thesis from the live daily run\'s truncated view reply', () => {
  const reply = '{"thesis":["The house stance is cautious and the board is aligned behind that posture.","Bank Nifty fell 3.17%."],"The model began a key it never finished';
  assert.equal(parseView(reply, ['Financials']), null, 'strict on early attempts');
  const view = parseView(reply, ['Financials'], { lenient: true });
  assert.deepEqual(view.thesis, ['The house stance is cautious and the board is aligned behind that posture.', 'Bank Nifty fell 3.17%.']);
  assert.deepEqual(view.sectors, []);
});

function clock(start = 0) {
  let t = start;
  const sleeps = [];
  return { now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; }, advance: (ms) => { t += ms; }, sleeps };
}

test('paced askAI waits when the next call would pass the per-minute limit', async () => {
  const c = clock();
  const askAI = async () => 'r'.repeat(4000); // ~1,000 reply tokens
  const paced = createPacedAskAI({ askAI, tokensPerMinute: 8000, replyReserve: 2000, now: c.now, sleep: c.sleep });
  await paced('p'.repeat(16000)); // ~4,000 prompt + 1,000 reply = 5,000 in the window
  assert.deepEqual(c.sleeps, []);
  await paced('p'.repeat(8000)); // estimate 2,000 + 2,000 = 4,000; 5,000 + 4,000 > 8,000, so wait for the first to age out
  assert.equal(c.sleeps.length, 1);
  assert.ok(c.sleeps[0] >= 60_000 && c.sleeps[0] <= 61_000);
});

test('paced askAI does not wait once the window has room, and never deadlocks on one oversized call', async () => {
  const c = clock();
  const paced = createPacedAskAI({ askAI: async () => 'ok', tokensPerMinute: 8000, replyReserve: 0, now: c.now, sleep: c.sleep });
  await paced('p'.repeat(12000));
  c.advance(61_000);
  await paced('p'.repeat(12000));
  assert.deepEqual(c.sleeps, []);
  await paced('p'.repeat(100_000)); // 25k alone exceeds the limit: wait for an empty window, then send
  assert.equal(c.sleeps.length, 1);
});

test('a failed call still occupies the window with its prompt', async () => {
  const c = clock();
  const paced = createPacedAskAI({ askAI: async () => { throw new Error('429'); }, tokensPerMinute: 8000, replyReserve: 0, now: c.now, sleep: c.sleep });
  await assert.rejects(paced('p'.repeat(28000)), /429/);
  await assert.rejects(paced('p'.repeat(8000)), /429/);
  assert.equal(c.sleeps.length, 1, '7,000 + 2,000 > 8,000');
});

test('paceFromEnv defaults to Groq free tier and AI_PACE_TPM=0 turns pacing off', () => {
  assert.equal(paceFromEnv({}), 8000);
  assert.equal(paceFromEnv({ AI_PACE_TPM: '30000' }), 30000);
  assert.equal(paceFromEnv({ AI_PACE_TPM: '0' }), 0);
  assert.equal(paceFromEnv({ AI_PACE_TPM: 'fast' }), 8000);
});

test('the writer retries a cut-off section and repairs only the last attempt', async () => {
  const { writeEdition } = await import('../scripts/lib/market-edition/edition-writer.js');
  const replies = {
    overview: ['{"title":"Thin","summary":"s","india":["only one"],"global":["g"],"macro":["m"],"india2":"cut',
      JSON.stringify({ title: 'Full', summary: 's', india: ['a', 'b', 'c', 'd'], global: ['g'], macro: ['m'] })],
    news: ['{"stories":[{"id":"1","analysis":"x"', '{"stories":[{"id":"1","analysis":"Kept."}],"more":"cu'],
    view: ['{"thesis":["T1."],"sec', '{"thesis":["T1.","T2."],"sectors":[{"name":"Auto","call":"over'],
  };
  const askAI = async (prompt) => {
    const key = prompt.includes('market description') ? 'overview' : prompt.includes('market-relevant') ? 'news' : 'view';
    return replies[key].shift();
  };
  const context = {
    edition: { label: 'Close', focus: 'f' }, dateLabel: 'd', marketText: 'm',
    headlines: [{ title: 'H', source: 'S', url: 'u' }], board: null,
  };
  const { text } = await writeEdition({ askAI, env: {}, sectorNames: ['Auto'], ...context });
  assert.equal(text.title, 'Full', 'a thin repaired first attempt is not accepted');
  assert.deepEqual(text.india, ['a', 'b', 'c', 'd']);
  assert.equal(text.news[0].analysis, 'Kept.');
  assert.deepEqual(text.view.thesis, ['T1.', 'T2.']);
});

test('paced askAI reserves the caller\'s expected reply size instead of the default', async () => {
  // Edition sections reply with ~2,000 tokens; a 1,500 reserve let a second call through into Groq's 429.
  const c = clock();
  const paced = createPacedAskAI({ askAI: async () => 'r'.repeat(16000), tokensPerMinute: 8000, replyReserve: 1500, now: c.now, sleep: c.sleep });
  await paced('p'.repeat(4000)); // 1,000 prompt + 4,000 reply = 5,000 in the window
  await paced('p'.repeat(1600)); // 400 + 1,500 default reserve = 6,900: fits
  assert.deepEqual(c.sleeps, []);
  c.advance(61_000);
  await paced('p'.repeat(4000));
  await paced('p'.repeat(1600), { outputTokens: 3000 }); // 5,000 + 400 + 3,000 > 8,000: wait
  assert.equal(c.sleeps.length, 1);
});
