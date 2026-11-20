import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRssItems, parseDate, toPlainText } from '../src/news/rss.js';
import { fetchHeadlines } from '../src/news/fetch.js';

const NOW = Date.parse('2026-11-15T01:30:00Z');

const item = ({ title, link = 'https://pub.test/a', description = '', pubDate = 'Sun, 15 Nov 2026 06:30:17 +0530' }) =>
  `<item><title>${title}</title><link>${link}</link><description>${description}</description><pubDate>${pubDate}</pubDate></item>`;
const rss = (...items) => `<?xml version="1.0"?><rss><channel><title>x</title>${items.join('')}</channel></rss>`;

test('parses CDATA-wrapped fields (Mint style) into plain text', () => {
  const xml = rss(item({
    title: '<![CDATA[Nifty <b>slips</b> &amp; Sensex falls]]>',
    link: '<![CDATA[https://www.livemint.com/x.html]]>',
    description: '<![CDATA[<p>Banks drag &#8377;  index</p>]]>',
    pubDate: '<![CDATA[Sun, 15 Nov 2026 06:30:17 +0530]]>'
  }));
  const [parsed] = parseRssItems(xml);
  assert.equal(parsed.title, 'Nifty slips & Sensex falls');
  assert.equal(parsed.url, 'https://www.livemint.com/x.html');
  assert.equal(parsed.summary, 'Banks drag ₹ index');
  assert.equal(parsed.publishedAt, Date.parse('2026-11-15T01:00:17Z'));
});

test('applies the feed default zone only when the date has none (RBI style)', () => {
  assert.equal(parseDate('Fri, 13 Nov 2026 17:50:00', '+0530'), Date.parse('2026-11-13T12:20:00Z'));
  assert.equal(parseDate('Fri, 13 Nov 2026 22:12 GMT', '+0530'), Date.parse('2026-11-13T22:12:00Z'));
  assert.ok(Number.isNaN(parseDate('', '+0530')));
});

test('drops items without a title or with a non-http link', () => {
  const xml = rss(item({ title: '' }), item({ title: 'bad', link: 'javascript:alert(1)' }), item({ title: 'good' }));
  assert.deepEqual(parseRssItems(xml).map(i => i.title), ['good']);
});

test('escaped markup in feeds never survives as tags', () => {
  assert.equal(toPlainText('&lt;script&gt;alert(1)&lt;/script&gt;Rates', 100), 'alert(1) Rates');
});

test('fetchHeadlines keeps fresh items, dedupes syndicated titles, sorts newest first, survives a dead feed', async () => {
  const feeds = [
    { id: 'a', name: 'A', url: 'https://a.test/rss', defaultTz: '+0000' },
    { id: 'b', name: 'B', url: 'https://b.test/rss', defaultTz: '+0000' },
    { id: 'dead', name: 'Dead', url: 'https://dead.test/rss', defaultTz: '+0000' }
  ];
  const bodies = {
    'a.test': rss(
      item({ title: 'RBI holds repo rate', pubDate: 'Sun, 15 Nov 2026 01:00:00 GMT' }),
      item({ title: 'Stale story', pubDate: 'Tue, 23 Apr 2024 15:46:31 +0530' }),
      item({ title: 'Undated story', pubDate: '' })
    ),
    'b.test': rss(
      item({ title: 'RBI holds repo rate!', pubDate: 'Sun, 15 Nov 2026 00:30:00 GMT' }),
      item({ title: 'Crude climbs', pubDate: 'Sun, 15 Nov 2026 01:20:00 GMT' })
    )
  };
  const fetchImpl = async url => {
    const host = new URL(url).host;
    if (host === 'dead.test') throw new Error('ECONNRESET');
    return new Response(bodies[host], { status: 200 });
  };

  const headlines = await fetchHeadlines({ feeds, now: NOW, maxAgeHours: 24, perFeedLimit: 10, totalLimit: 10, fetchImpl });
  assert.deepEqual(headlines.map(h => [h.source, h.title]), [['B', 'Crude climbs'], ['A', 'RBI holds repo rate']]);
});

test('fetchHeadlines honours the per-feed and total caps', async () => {
  const titles = Array.from({ length: 6 }, (_, i) => item({ title: `Story ${i}`, pubDate: `Sun, 15 Nov 2026 01:0${i}:00 GMT` }));
  const feeds = [{ id: 'a', name: 'A', url: 'https://a.test/rss' }, { id: 'b', name: 'B', url: 'https://b.test/rss' }];
  const fetchImpl = async url => new Response(rss(...titles.map(t => t.replace('Story', new URL(url).host))), { status: 200 });
  const headlines = await fetchHeadlines({ feeds, now: NOW, maxAgeHours: 24, perFeedLimit: 2, totalLimit: 3, fetchImpl });
  assert.equal(headlines.length, 3);
});
