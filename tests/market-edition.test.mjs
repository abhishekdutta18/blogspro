/**
 * Market edition tests — edition timing, quote, history and RSS parsing, the view-board consensus, the three
 * writer sections, sentence-safe truncation, charts, HTML escaping, and full edition runs with fake fetch and AI.
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEdition } from '../scripts/lib/market-edition/editions.js';
import { marketStatus, parseChart, parseHistory, snapshotToText } from '../scripts/lib/market-edition/market-data.js';
import { parseRss, selectHeadlines } from '../scripts/lib/market-edition/news-feed.js';
import { buildConsensus, parsePersonaReply } from '../scripts/lib/market-edition/view-board.js';
import { parseNews, parseOverview, parseView } from '../scripts/lib/market-edition/edition-writer.js';
import { cleanText, truncateAtSentence } from '../scripts/lib/market-edition/json-reply.js';
import { divergingBarChart, lineChart, niceTicks } from '../scripts/lib/market-edition/charts.js';
import { renderEditionBody } from '../scripts/lib/market-edition/edition-template.js';
import { generateMarketEdition } from '../scripts/lib/market-edition/index.js';

// The pipeline logs progress to stdout, which the test runner also uses for its own event stream; with the
// bond fetch in every edition those lines landed mid-frame ("Unable to deserialize cloned data"). Keep stdout clean.
mock.method(console, 'log', () => {});

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
  const now = Date.UTC(2026, 10, 22, 19, 30);
  const text = snapshotToText([{ title: 'India', quotes: [
    { name: 'Nifty 50', ok: true, price: 25800.6, currency: 'INR', changePct: 2.0145, asOf: Date.UTC(2026, 10, 20, 10, 0), exchangeTz: 'Asia/Kolkata' },
    { name: 'Sensex', ok: false },
  ] }], now);
  assert.match(text, /Nifty 50: 25800\.60 INR \(\+2\.01% vs previous close; closed, Fri 20 Nov session\)/);
  assert.match(text, /Sensex: unavailable/);
});

test('marketStatus uses the exchange day for closed sessions and "live" for fresh quotes', () => {
  const now = Date.UTC(2026, 10, 22, 19, 30);
  // Friday 16:00 New York close is Friday 21:00 UTC (Saturday in IST): the session is Friday's.
  assert.equal(marketStatus({ asOf: Date.UTC(2026, 10, 20, 21, 0), exchangeTz: 'America/New_York' }, now), 'closed, Fri 20 Nov session');
  assert.equal(marketStatus({ asOf: now - 10 * 60 * 1000, exchangeTz: 'UTC' }, now), 'live');
  assert.equal(marketStatus({ asOf: Date.UTC(2026, 10, 20, 21, 0), exchangeTz: 'Not/AZone' }, now), 'closed, Fri 20 Nov session');
  assert.equal(marketStatus({ asOf: null }, now), 'status unknown');
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

test('writer sections: overview needs a title and India text; news ids map to real headlines', () => {
  const overview = parseOverview(JSON.stringify({ title: '## Nifty slips', summary: 's', india: ['p1'], global: ['g1'], macro: [] }));
  assert.deepEqual(overview, { title: 'Nifty slips', summary: 's', india: ['p1'], global: ['g1'], macro: [] });
  assert.equal(parseOverview('{"title":"x","india":[]}'), null);

  const headlines = [{ title: 'A story', source: 'ET', link: 'https://a' }, { title: 'B story', source: 'Mint', link: null }];
  const news = parseNews(JSON.stringify({ stories: [{ id: '2', analysis: 'matters' }, { id: 2, analysis: 'dup' }, { id: 7, analysis: 'out of range' }] }), headlines);
  assert.deepEqual(news, [{ title: 'B story', source: 'Mint', link: null, analysis: 'matters' }]);
  assert.equal(parseNews('{"stories":[{"id":9,"analysis":"x"}]}', headlines), null);
});

test('parseOverview moves paragraphs filed behind a stray "macro=[" item back to their section', () => {
  // Shape of the 23 Nov morning reply: the macro paragraphs sat inside "global" after a "macro=[" item.
  const reply = JSON.stringify({ title: 'T', summary: 's', india: ['i1'], global: ['g1', 'g2', 'g3', 'macro=[', 'm1', 'm2', 'm3'] });
  const overview = parseOverview(reply);
  assert.deepEqual(overview.global, ['g1', 'g2', 'g3']);
  assert.deepEqual(overview.macro, ['m1', 'm2', 'm3']);

  const marked = parseOverview(JSON.stringify({ title: 'T', india: ['i1', '"global": [', 'g1'], macro: ['m1'] }));
  assert.deepEqual(marked.india, ['i1']);
  assert.deepEqual(marked.global, ['g1']);
  assert.deepEqual(marked.macro, ['m1'], 'a real key keeps its own paragraphs first');

  const bare = parseOverview(JSON.stringify({ title: 'T', india: ['i1'], global: ['g1', 'macro:'] }));
  assert.deepEqual(bare.global, ['g1'], 'a marker with nothing after it is dropped, never published');
  assert.deepEqual(bare.macro, []);
});

test('parseOverview drops JSON debris and keeps text that shares a line with a section key', () => {
  const debris = parseOverview(JSON.stringify({ title: 'T', india: ['i1'], global: ['g1', '],', 'macro=[', 'm1', ']', '"}'] }));
  assert.deepEqual(debris.global, ['g1']);
  assert.deepEqual(debris.macro, ['m1']);

  const joined = parseOverview(JSON.stringify({ title: 'T', india: ['i1'], global: ['g1', 'macro: ["The rupee firmed to 84.10."]'] }));
  assert.deepEqual(joined.global, ['g1']);
  assert.deepEqual(joined.macro, ['The rupee firmed to 84.10.']);

  const prose = parseOverview(JSON.stringify({ title: 'T', india: ['i1'], global: ['Global: US stocks fell 1.2% on Friday.'] }));
  assert.deepEqual(prose.global, ['Global: US stocks fell 1.2% on Friday.'], 'a sentence that starts with a key stays where it is');
});

test('parseOverview logs when it repairs sections or drops paragraphs over a cap', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  parseOverview(JSON.stringify({ title: 'T', india: ['i1'], global: ['g1', 'g2', 'g3', 'g4', 'g5', 'macro=[', 'm1'] }));
  const messages = warn.mock.calls.map((c) => String(c.arguments[0]));
  assert.ok(messages.some((m) => /moved 1 misfiled paragraph/.test(m)), messages.join(' | '));
  assert.ok(messages.some((m) => /global: dropped 1 paragraph\(s\) over the cap of 4/.test(m)), messages.join(' | '));

  warn.mock.resetCalls();
  parseOverview(JSON.stringify({ title: 'T', india: ['i1'], global: ['g1'], macro: ['m1'] }));
  assert.equal(warn.mock.callCount(), 0, 'a clean reply logs nothing');
});

test('parseView keeps only known sectors and calls, and needs a thesis', () => {
  const reply = JSON.stringify({
    thesis: ['t1'],
    sectors: [
      { name: 'auto', call: 'Overweight', reason: 'demand' },
      { name: 'Auto', call: 'underweight', reason: 'duplicate' },
      { name: 'Crypto', call: 'overweight', reason: 'not an NSE sector' },
      { name: 'Metal', call: 'buy', reason: 'not a call we use' },
    ],
    risks: ['r1'], watch: ['w1'],
  });
  const view = parseView(reply, ['Auto', 'Metal']);
  assert.deepEqual(view.sectors, [{ name: 'Auto', call: 'overweight', reason: 'demand' }]);
  assert.deepEqual(view.watch, ['w1']);
  assert.equal(parseView('{"thesis":[]}', ['Auto']), null);
});

test('long text is cut at a sentence, never mid-word with a stray ellipsis', () => {
  const text = 'The S&P 500 fell 3.70% on Friday. Losses spread to Asia on Monday. Rate fears could prolong the sell-off.';
  assert.equal(truncateAtSentence(text, 80), 'The S&P 500 fell 3.70% on Friday. Losses spread to Asia on Monday.');
  assert.equal(truncateAtSentence('one two three four five', 12), 'one two…');
  assert.equal(cleanText(text, 2000), text);
  assert.doesNotMatch(cleanText(text, 90), /\w…$|\.\.$/);
});

test('charts: bars sort, sign and escape; line chart needs two points', () => {
  const bars = divergingBarChart({ title: 'Indices', items: [
    { label: '<b>Down</b>', value: -2 }, { label: 'Up', value: 1 }, { label: 'Missing', value: null },
  ] });
  assert.doesNotMatch(bars, /<b>|Missing/);
  assert.ok(bars.indexOf('Up') < bars.indexOf('&lt;b&gt;Down'), 'strongest gain first');
  assert.match(bars, /class="bar neg" style="width:28\.00%"/);
  assert.match(bars, /−2\.00%/);
  assert.equal(divergingBarChart({ title: 'x', items: [] }), '');

  assert.equal(lineChart({ title: 'Nifty 50', points: [{ t: 0, close: 1 }] }), '');
  const line = lineChart({ title: 'Nifty 50', points: [{ t: Date.UTC(2026, 9, 23), close: 100 }, { t: Date.UTC(2026, 10, 20), close: 110 }] });
  assert.match(line, /<svg viewBox="0 0 360 190" role="img" aria-label="Nifty 50, one month: 100 to 110 \(\+10\.00%\)">/);
  assert.match(line, /<title>20 Nov: 110<\/title>/);
  assert.deepEqual(niceTicks(0, 100), [0, 50, 100]);
});

test('parseHistory keeps daily closes and skips null bars', () => {
  const json = { chart: { result: [{ timestamp: [1, 2, 3], indicators: { quote: [{ close: [10, null, 12] }] } }] } };
  assert.deepEqual(parseHistory(json), [{ t: 1000, close: 10 }, { t: 3000, close: 12 }]);
  assert.deepEqual(parseHistory({}), []);
});

test('renderEditionBody escapes model and feed text', () => {
  const html = renderEditionBody({
    markets: [{ id: 'india', title: 'India', quotes: [{ symbol: '^NSEI', name: '<b>Nifty</b>', ok: true, price: 1, change: 0.5, changePct: 50 }] }],
    headlines: [],
    text: {
      title: 't', summary: 's', india: ['<script>alert(1)</script>'], global: [], macro: [],
      news: [{ title: '<img src=x onerror=alert(1)>', source: 'X', link: 'javascript:alert(1)', analysis: '"quoted"' }],
      view: { thesis: ['th'], sectors: [{ name: 'Auto', call: 'overweight', reason: '<i>why</i>' }], risks: ['r'], watch: ['<u>CPI</u>'] },
    },
    board: null,
  });
  assert.doesNotMatch(html, /<script>|<img|<b>|<i>|<u>|href="javascript/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /class="up">\+0\.50/);
  assert.match(html, /Sector calls/);
  assert.match(html, /What would change our view/);
  const dated = renderEditionBody({
    markets: [{ id: 'global', title: 'Global', quotes: [{ symbol: '^GSPC', name: 'S&P 500', ok: true, price: 1, change: 0, changePct: 0, asOf: Date.UTC(2026, 10, 20, 21, 0) }] }],
    headlines: [], text: null, board: null,
  });
  assert.match(dated, /as of Sat 21 Nov, 02:30 IST/);
});

function fakeFetch({ failAll = false } = {}) {
  return async (url) => {
    if (failAll) return { ok: false, status: 503 };
    if (url.includes('finance.yahoo.com')) {
      const result = { meta: { regularMarketPrice: 101, chartPreviousClose: 100, currency: 'INR' }, timestamp: [1, 2], indicators: { quote: [{ close: [100, 101] }] } };
      return { ok: true, json: async () => ({ chart: { result: [result] } }) };
    }
    const pub = new Date().toUTCString();
    return { ok: true, text: async () => `<item><title>Markets rally as oil eases and rupee firms</title><link>https://n.example/1</link><pubDate>${pub}</pubDate></item>` };
  };
}

// Answers each section prompt with its own JSON shape, keyed on a phrase only that prompt contains.
function fakeWriter(prompt) {
  if (prompt.includes('Write the market description')) {
    return JSON.stringify({ title: 'Nifty edges up', summary: 'Gains held.', india: ['Nifty rose 1.00%.'], global: ['US firm.'], macro: ['Rupee firmer.'] });
  }
  if (prompt.includes('most market-relevant stories')) return JSON.stringify({ stories: [{ id: 1, analysis: 'Oil relief.' }] });
  return JSON.stringify({ thesis: ['Stay invested.'], sectors: [{ name: 'Auto', call: 'overweight', reason: 'Demand.' }], risks: ['A VIX spike.'], watch: ['US CPI'] });
}

test('generateMarketEdition builds a full edition: 3 board calls, then 3 writer sections', async () => {
  const calls = [];
  const formats = new Set();
  const askAI = async (prompt, { role, responseFormat }) => {
    calls.push(role);
    formats.add(responseFormat);
    if (role === 'research') return '{"stance":"constructive","conviction":3,"points":["Nifty +1.00%"]}';
    return fakeWriter(prompt);
  };
  const result = await generateMarketEdition({ askAI, env: {}, now: ist(16, 1), fetchImpl: fakeFetch() });
  assert.deepEqual(calls, ['research', 'research', 'research', 'generate', 'generate', 'generate']);
  assert.deepEqual([...formats], ['json'], 'every board and writer call asks for JSON');
  assert.equal(result.edition.id, 'close');
  assert.equal(result.stance, 'constructive');
  assert.ok(result.hasCommentary);
  assert.ok(result.wordCount > 10);
  const page = result.renderPage('https://blogspro.in/briefings/hourly/x.html');
  assert.match(page, /Market close · 23 Nov 2026, 16:01 IST/);
  assert.match(page, /Oil relief\./);
  assert.match(page, /<td><span class="call overweight">overweight<\/span><\/td><td>Demand\.<\/td>/);
  assert.match(page, /Equity indices/);
  assert.match(page, /<svg viewBox/);
  assert.match(page, /<link rel="canonical" href="https:\/\/blogspro\.in\/briefings\/hourly\/x\.html">/);
});

test('generateMarketEdition keeps the overview when the news and view sections fail', async () => {
  const askAI = async (prompt, { role }) => {
    if (role === 'research') return 'no json';
    if (prompt.includes('Write the market description')) return fakeWriter(prompt);
    return 'not json';
  };
  const result = await generateMarketEdition({ askAI, env: {}, now: ist(22), fetchImpl: fakeFetch() });
  assert.ok(result.hasCommentary);
  assert.match(result.final, /Nifty rose 1\.00%\./);
  assert.match(result.final, /Markets rally as oil eases/, 'headlines stand in for the missing analysis');
  assert.doesNotMatch(result.final, /Our view/);
});

test('generateMarketEdition publishes data without commentary when AI fails, and throws with no data', async () => {
  const askAI = async () => { throw new Error('FLEET_EXHAUSTION_PERMANENT'); };
  const result = await generateMarketEdition({ askAI, env: {}, now: ist(8), fetchImpl: fakeFetch() });
  assert.equal(result.hasCommentary, false);
  assert.equal(result.wordCount, 0);
  assert.match(result.final, /Commentary is unavailable/);
  assert.match(result.final, /Markets rally as oil eases/);
  await assert.rejects(
    generateMarketEdition({ askAI, env: {}, now: ist(8), fetchImpl: fakeFetch({ failAll: true }) }),
    /EDITION_NO_DATA/,
  );
});

test('the edition snapshot keeps every raw writer reply, failed attempts included, and the data behind the page', async () => {
  let overviewCalls = 0;
  const askAI = async (prompt, { role }) => {
    if (role === 'research') return '{"stance":"neutral","conviction":2,"points":["flat"]}';
    if (prompt.includes('Write the market description') && (overviewCalls += 1) === 1) return 'macro=[ not json';
    return fakeWriter(prompt);
  };
  const result = await generateMarketEdition({ askAI, env: {}, now: ist(8), fetchImpl: fakeFetch() });
  const { snapshot } = result;
  assert.equal(snapshot.edition, 'morning');
  assert.deepEqual(snapshot.replies.map((r) => [r.section, r.attempt]), [['overview', 1], ['overview', 2], ['news', 1], ['view', 1]]);
  assert.equal(snapshot.replies[0].reply, 'macro=[ not json');
  assert.equal(snapshot.text.title, 'Nifty edges up');
  assert.ok(snapshot.markets.length > 0 && snapshot.headlines.length > 0 && Array.isArray(snapshot.histories));
  assert.equal(snapshot.board.consensus.stance, 'neutral');
});

test('the snapshot of a failed writer still records the errors', async () => {
  const askAI = async () => { throw new Error('FLEET_EXHAUSTION_PERMANENT'); };
  const { snapshot } = await generateMarketEdition({ askAI, env: {}, now: ist(8), fetchImpl: fakeFetch() });
  assert.equal(snapshot.text, null);
  assert.deepEqual(snapshot.replies.map((r) => [r.section, r.attempt, r.error]), [
    ['overview', 1, 'FLEET_EXHAUSTION_PERMANENT'], ['overview', 2, 'FLEET_EXHAUSTION_PERMANENT'],
  ]);
});

test('saveEditionSnapshot writes <id>.json under the snapshot directory, never the web root', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { saveEditionSnapshot, snapshotDir } = await import('../scripts/lib/market-edition/snapshot.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edition-snap-'));
  const file = saveEditionSnapshot({ edition: 'morning', text: null }, 'swarm-hourly-1', { dir });
  assert.equal(file, path.join(dir, 'swarm-hourly-1.json'));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { edition: 'morning', text: null });
  assert.equal(saveEditionSnapshot({}, '../escape', { dir }), null, 'an id with a path separator is refused');
  assert.equal(snapshotDir({ EDITION_SNAPSHOT_DIR: '/x/y' }), '/x/y');
  assert.ok(snapshotDir({}).startsWith(os.homedir()), 'defaults to the home directory, outside /var/www');
  fs.rmSync(dir, { recursive: true, force: true });
});
