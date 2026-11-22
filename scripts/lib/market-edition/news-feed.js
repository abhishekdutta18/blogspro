/**
 * Headlines for the editions — recent items from market news RSS feeds, de-duplicated and newest first.
 * Feed text is untrusted: titles are reduced to plain text here and escaped again by the template, and
 * links are kept only when they are plain http(s) URLs.
 */

const REQUEST_TIMEOUT_MS = 8000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 15;
const MAX_TITLE = 220;

export const NEWS_FEEDS = Object.freeze([
  { source: 'Economic Times', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
  { source: 'Mint', url: 'https://www.livemint.com/rss/markets' },
  {
    source: 'Moneycontrol',
    url: 'https://news.google.com/rss/search?q=site%3Amoneycontrol.com+markets&hl=en-IN&gl=IN&ceid=IN:en',
    aggregated: true,
  },
  {
    source: 'Reuters',
    url: 'https://news.google.com/rss/search?q=site%3Areuters.com+markets&hl=en-US&gl=US&ceid=US:en',
    aggregated: true,
  },
]);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };

function decode(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, e) => ENTITIES[e])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? match[1] : '';
}

function safeLink(raw) {
  try {
    const url = new URL(decode(raw));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Items from one RSS document: { title, link, source, publishedAt }.
 * For aggregated feeds (Google News) the " - Publisher" title suffix becomes the source.
 */
export function parseRss(xml, feedSource, { aggregated = false } = {}) {
  const items = String(xml || '').match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  return items
    .map((item) => {
      let title = decode(tag(item, 'title'));
      let source = feedSource;
      const suffix = aggregated ? title.match(/^(.*\S)\s+-\s+([^-]{2,40})$/) : null;
      if (suffix) {
        title = suffix[1];
        source = suffix[2];
      }
      const published = Date.parse(decode(tag(item, 'pubDate')));
      return {
        title: title.slice(0, MAX_TITLE),
        link: safeLink(tag(item, 'link')),
        source,
        publishedAt: Number.isFinite(published) ? published : null,
      };
    })
    .filter((i) => i.title.length > 15);
}

/** Recent items across feeds, newest first, without near-duplicate titles. */
export function selectHeadlines(items, { now = Date.now(), limit = MAX_ITEMS } = {}) {
  const seen = new Set();
  return items
    .filter((i) => i.publishedAt === null || now - i.publishedAt <= MAX_AGE_MS)
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
    .filter((i) => {
      const key = i.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

async function fetchFeed(feed, fetchImpl) {
  try {
    const res = await fetchImpl(feed.url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseRss(await res.text(), feed.source, { aggregated: Boolean(feed.aggregated) });
  } catch (error) {
    console.warn(`⚠️ [Edition] News feed unavailable (${feed.source}): ${error.message}`);
    return [];
  }
}

/** The latest headlines from every feed. An empty list means every feed failed. */
export async function fetchHeadlines({ fetchImpl = fetch, now = Date.now() } = {}) {
  const lists = await Promise.all(NEWS_FEEDS.map((f) => fetchFeed(f, fetchImpl)));
  return selectHeadlines(lists.flat(), { now });
}
