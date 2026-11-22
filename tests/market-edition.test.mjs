/**
 * Market edition tests — edition timing, quote and RSS parsing, the view-board consensus, writer-reply
 * normalisation, HTML escaping, and one full edition run with fake fetch and fake AI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEdition } from '../scripts/lib/market-edition/editions.js';
import { parseChart, snapshotToText } from '../scripts/lib/market-edition/market-data.js';
import { parseRss, selectHeadlines } from '../scripts/lib/market-edition/news-feed.js';
import { buildConsensus, parsePersonaReply } from '../scripts/lib/market-edition/view-board.js';
import { parseWriterReply } from '../scripts/lib/market-edition/edition-writer.js';
import { renderEditionBody } from '../scripts/lib/market-edition/edition-template.js';
import { generateMarketEdition } from '../scripts/lib/market-edition/index.js';

const ist = (hh, mm = 0) => new Date(Date.UTC(2026, 10, 23, hh, mm) - 330 * 60 * 1000);

test('resolveEdition picks the nearest edition in IST', () => {
  assert.equal(resolveEdition(ist(8, 0)).id, 'morning');
  assert.equal(resolveEdition(ist(7, 40)).id, 'morning');
  assert.equal(resolveEdition(ist(16, 2)).id, 'close');
  assert.equal(resolveEdition(ist(22, 0)).id, 'evening');
  assert.equal(resolveEdition(ist(1, 30)).id, 'evening', 'wraps round midnight');
});

test('parseChart computes the day move from the previous close and rejects missing prices', () => {
  const q = parseChart({ chart: { result: [{ meta: { regularMarketPrice: 110, chartPreviousClose: 100, currency: 'INR', regularMarketTime: 1795168875 } }] } });
  assert.equal(q.change, 10);
  assert.equal(q.changePct, 10);
  assert.equal(q.asOf, 1795168875000);
  const noPrev = parseChart({ chart: { result: [{ meta: { regularMarketPrice: 5 } }] } });
  assert.equal(noPrev.changePct, null);
  assert.equal(parseChart({ chart: { result: [{ meta: {} }] } }), null);
  assert.equal(parseChart(null), null);
});

test('snapshotToText marks unavailable instruments instead of guessing', () => {
  const text = snapshotToText([{ title: 'India', quotes: [
    { name: 'Nifty 50', ok: true, price: 25800.6, currency: 'INR', changePct: 2.0145 },
    { name: 'Sensex', ok: false },
  ] }]);
  assert.match(text, /Nifty 50: 25800\.60 INR \(\+2\.01% on the day\)/);
  assert.match(text, /Sensex: unavailable/);
});

test('parseRss decodes entities and CDATA, keeps only http(s) links, splits Google News sources', () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[Sensex jumps 800 pts - what&#39;s driving it]]></title><link>https://et.example/a</link><pubDate>Sun, 22 Nov 2026 10:00:00 GMT</pubDate></item>
    <item><title>Rupee &amp; bonds rally on RBI signal today</title><link>javascript:alert(1)</link></item>
  </channel></rss>`;
  const [a, b] = parseRss(xml, 'Economic Times');
  assert.equal(a.title, "Sensex jumps 800 pts - what's driving it", 'non-aggregated titles keep their dash');
  assert.equal(a.source, 'Economic Times');
  assert.equal(a.link, 'https://et.example/a');
  assert.equal(b.title, 'Rupee & bonds rally on RBI signal today');
  assert.equal(b.link, null);
  const [g] = parseRss('<item><title>Nifty ends higher on bank rally - Reuters</title><link>https://n.example</link></item>', 'Reuters', { aggregated: true });
  assert.deepEqual([g.title, g.source], ['Nifty ends higher on bank rally', 'Reuters']);
});

test('selectHeadlines drops stale and duplicate stories, newest first', () => {
  const now = Date.UTC(2026, 10, 22, 12);
  const items = [
    { title: 'Nifty closes at record high on IT rally', publishedAt: now - 3600e3 },
    { title: 'Nifty closes at record high on IT rally!', publishedAt: now - 7200e3 },
    { title: 'Old story about crude oil prices falling', publishedAt: now - 30 * 3600e3 },
    { title: 'Rupee weakens past 93 against the dollar', publishedAt: now - 600e3 },
  ];
  assert.deepEqual(selectHeadlines(items, { now }).map((i) => i.title), [
    'Rupee weakens past 93 against the dollar',
    'Nifty closes at record high on IT rally',
  ]);
});

test('view board: persona replies are validated and the consensus is conviction-weighted', () => {
  assert.equal(parsePersonaReply('{"stance":"moonshot","conviction":5,"points":[]}'), null);
  const take = parsePersonaReply('Sure:\n```json\n{"stance":"Cautious","conviction":9,"points":["VIX up **10%**"]}\n```');
  assert.deepEqual(take, { stance: 'cautious', conviction: 5, points: ['VIX up 10%'] });
  const consensus = buildConsensus([
    { stance: 'bullish', conviction: 1, points: [] },
    { stance: 'cautious', conviction: 5, points: [] },
    { stance: 'neutral', conviction: 2, points: [] },
  ]);
  assert.equal(consensus.stance, 'neutral');
  assert.equal(consensus.agreement, 'divided');
  assert.equal(buildConsensus([null, null]), null);
});

test('parseWriterReply maps story ids to real headlines and drops bad or duplicate ids', () => {
  const headlines = [{ title: 'A story', source: 'ET', link: 'https://a' }, { title: 'B story', source: 'Mint', link: null }];
  const reply = JSON.stringify({
    title: '## Nifty slips', summary: 's', market: ['p1'],
    news: [{ id: '2', take: 'matters' }, { id: 2, take: 'dup' }, { id: 7, take: 'out of range' }],
    view: ['v1'], watch: ['w1'],
  });
  const text = parseWriterReply(reply, headlines);
  assert.equal(text.title, 'Nifty slips');
  assert.deepEqual(text.news, [{ title: 'B story', source: 'Mint', link: null, take: 'matters' }]);
  assert.equal(parseWriterReply('{"title":"x","market":[]}', headlines), null);
});

test('renderEditionBody escapes model and feed text', () => {
  const html = renderEditionBody({
    markets: [{ title: 'India', quotes: [{ name: '<b>Nifty</b>', ok: true, price: 1, change: 0.5, changePct: 50 }] }],
    headlines: [],
    text: {
      market: ['<script>alert(1)</script>'], view: [], watch: [],
      news: [{ title: '<img src=x onerror=alert(1)>', source: 'X', link: 'javascript:alert(1)', take: '"quoted"' }],
    },
    board: null,
  });
  assert.doesNotMatch(html, /<script>|<img|<b>|href="javascript/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /class="up">\+0\.50/);
});

function fakeFetch({ failAll = false } = {}) {
  return async (url) => {
    if (failAll) return { ok: false, status: 503 };
    if (url.includes('finance.yahoo.com')) {
      return { ok: true, json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 101, chartPreviousClose: 100, currency: 'INR' } }] } }) };
    }
    const pub = new Date().toUTCString();
    return { ok: true, text: async () => `<item><title>Markets rally as oil eases and rupee firms</title><link>https://n.example/1</link><pubDate>${pub}</pubDate></item>` };
  };
}

test('generateMarketEdition builds a full edition with 4 AI calls', async () => {
  const calls = [];
  const askAI = async (prompt, { role }) => {
    calls.push(role);
    if (role === 'research') return '{"stance":"constructive","conviction":3,"points":["Nifty +1.00%"]}';
    return JSON.stringify({ title: 'Nifty edges up', summary: 'Gains held.', market: ['Nifty rose 1.00%.'], news: [{ id: 1, take: 'Oil relief.' }], view: ['Stay invested.'], watch: ['US CPI'] });
  };
  const result = await generateMarketEdition({ askAI, env: {}, now: ist(16, 1), fetchImpl: fakeFetch() });
  assert.deepEqual(calls, ['research', 'research', 'research', 'generate']);
  assert.equal(result.edition.id, 'close');
  assert.equal(result.stance, 'constructive');
  assert.ok(result.hasCommentary);
  const page = result.renderPage('https://blogspro.in/briefings/hourly/x.html');
  assert.match(page, /Market close · 23 Nov 2026, 16:01 IST/);
  assert.match(page, /Oil relief\./);
  assert.match(page, /<link rel="canonical" href="https:\/\/blogspro\.in\/briefings\/hourly\/x\.html">/);
});

test('generateMarketEdition publishes data without commentary when AI fails, and throws with no data', async () => {
  const askAI = async () => { throw new Error('FLEET_EXHAUSTION_PERMANENT'); };
  const result = await generateMarketEdition({ askAI, env: {}, now: ist(8), fetchImpl: fakeFetch() });
  assert.equal(result.hasCommentary, false);
  assert.match(result.final, /Commentary is unavailable/);
  assert.match(result.final, /Markets rally as oil eases/);
  await assert.rejects(
    generateMarketEdition({ askAI, env: {}, now: ist(8), fetchImpl: fakeFetch({ failAll: true }) }),
    /EDITION_NO_DATA/,
  );
});
