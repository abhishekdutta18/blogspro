import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHourly, RunAborted } from '../src/run-hourly.js';
import { openBriefingStore } from '../src/store/briefings.js';
import { silentLogger } from '../src/log.js';

const NOW = Date.parse('2026-11-15T01:30:00Z');
const FEED = [{ id: 'f', name: 'Feed', url: 'https://feed.test/rss', defaultTz: '+0000' }];
const config = { providers: [{ name: 'p' }], minHeadlines: 3, hourlyRetention: 168 };

const rssWith = count => `<rss><channel>${Array.from({ length: count }, (_, i) =>
  `<item><title>Story ${i}</title><link>https://feed.test/${i}</link><pubDate>Sun, 15 Nov 2026 01:0${i % 10}:00 GMT</pubDate></item>`).join('')}</channel></rss>`;
const feedFetch = count => async () => new Response(rssWith(count), { status: 200 });

const words = n => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const editorJson = extra => JSON.stringify({
  title: 'Crude climbs, rupee slips',
  summary: 'Two sentences [1]. More [2].',
  sections: [
    { heading: 'Lead', body: `${words(250)} [1] [2]` },
    { heading: 'Rates', body: `${words(250)} [3]` },
    { heading: 'What to watch', body: `${words(250)} [4] ${extra}` }
  ]
});

/** Desk calls get notes; the editor call (the one carrying "Desk notes:") gets the JSON. */
const fleetReplying = editorReply => ({
  complete: async messages => {
    const isEditor = messages[1].content.includes('Desk notes:');
    return { text: isEditor ? editorReply : 'desk note [1]', provider: 'groq', model: 'openai/gpt-oss-120b' };
  }
});

test('a good hour is saved with only the cited headlines as sources', async () => {
  const store = openBriefingStore(':memory:');
  const briefing = await runHourly({ config, fleet: fleetReplying(editorJson('')), store, now: NOW, log: silentLogger, fetchImpl: feedFetch(6), feeds: FEED });
  assert.equal(briefing.id, 'H_2026-11-15_07');
  assert.deepEqual(briefing.sources.map(s => s.n), [1, 2, 3, 4]);
  assert.equal(briefing.sources[0].url.startsWith('https://feed.test/'), true);
  assert.equal(briefing.model, 'groq/openai/gpt-oss-120b');
  assert.equal(briefing.desks.length, 4);
  store.close();
});

test('a too-short briefing is retried with the guard problems and saved once it passes', async () => {
  const short = JSON.stringify({ title: 'Short', summary: 'S [1].', sections: [{ heading: 'A', body: 'tiny [1] [2] [3] [4]' }, { heading: 'B', body: 'x' }, { heading: 'C', body: 'y' }] });
  const editorReplies = [short, editorJson('')];
  const editorCalls = [];
  const fleet = {
    complete: async messages => {
      const isEditor = messages[1].content.includes('Desk notes:');
      if (!isEditor) return { text: 'desk note [1]', provider: 'groq', model: 'm' };
      editorCalls.push(messages);
      return { text: editorReplies[editorCalls.length - 1], provider: 'openrouter', model: 'm' };
    }
  };
  const briefing = await runHourly({ config, fleet, store: null, now: NOW, log: silentLogger, fetchImpl: feedFetch(6), feeds: FEED });
  assert.equal(briefing.title, 'Crude climbs, rupee slips');
  assert.equal(editorCalls.length, 2);
  assert.match(editorCalls[1].at(-1).content, /words \(want 600-1600\)/);
});

test('too few fresh headlines aborts before any AI call', async () => {
  let aiCalls = 0;
  const fleet = { complete: async () => { aiCalls += 1; return { text: '' }; } };
  await assert.rejects(
    runHourly({ config, fleet, store: null, now: NOW, log: silentLogger, fetchImpl: feedFetch(2), feeds: FEED }),
    error => error instanceof RunAborted && error.reason === 'not_enough_news'
  );
  assert.equal(aiCalls, 0);
});

test('a briefing that names the publication is not saved', async () => {
  const saved = [];
  const store = { save: doc => saved.push(doc), pruneHourly: () => 0 };
  await assert.rejects(
    runHourly({ config, fleet: fleetReplying(editorJson('BlogsPro view')), store, now: NOW, log: silentLogger, fetchImpl: feedFetch(6), feeds: FEED }),
    error => error.reason === 'guard_failed' && /names the publication/.test(error.message)
  );
  assert.deepEqual(saved, []);
});
