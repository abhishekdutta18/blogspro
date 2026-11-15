/**
 * fetch.js — pulls every feed in parallel and returns recent, de-duplicated headlines,
 * newest first. A feed that fails or times out is logged and skipped; the caller decides
 * whether what is left is enough to write a briefing.
 */
import { parseRssItems } from './rss.js';
import { silentLogger } from '../log.js';

const USER_AGENT = 'Mozilla/5.0 (compatible; blogspro-swarm/1.0)';
const MAX_FEED_BYTES = 3_000_000;

/** Lowercased title with punctuation removed, so syndicated copies collapse into one. */
const titleKey = title => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

async function fetchFeed(feed, { fetchImpl, timeoutMs }) {
  const response = await fetchImpl(feed.url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const xml = await response.text();
  if (xml.length > MAX_FEED_BYTES) throw new Error(`feed larger than ${MAX_FEED_BYTES} bytes`);
  return parseRssItems(xml, { defaultTz: feed.defaultTz }).map(item => ({ ...item, source: feed.name }));
}

/**
 * @param {{feeds: readonly object[], now: number, maxAgeHours: number, perFeedLimit: number, totalLimit: number,
 *          timeoutMs?: number, fetchImpl?: typeof fetch, log?: import('../log.js').Logger}} options
 * @returns {Promise<{title: string, url: string, summary: string, publishedAt: number, source: string}[]>}
 */
export async function fetchHeadlines({ feeds, now, maxAgeHours, perFeedLimit, totalLimit, timeoutMs = 15_000, fetchImpl = fetch, log = silentLogger }) {
  const oldest = now - maxAgeHours * 3_600_000;
  const settled = await Promise.allSettled(feeds.map(feed => fetchFeed(feed, { fetchImpl, timeoutMs })));

  const perFeed = settled.map((result, index) => {
    const feed = feeds[index];
    if (result.status === 'rejected') {
      log.warn('news.feed_failed', { feed: feed.id, reason: String(result.reason?.message || result.reason) });
      return [];
    }
    // Undated items are dropped: freshness is the whole point of an hourly briefing.
    const fresh = result.value
      .filter(item => Number.isFinite(item.publishedAt) && item.publishedAt >= oldest && item.publishedAt <= now + 3_600_000)
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, perFeedLimit);
    log.info('news.feed_ok', { feed: feed.id, items: result.value.length, fresh: fresh.length });
    return fresh;
  });

  const seen = new Set();
  return perFeed
    .flat()
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .filter(item => {
      const key = titleKey(item.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, totalLimit);
}
