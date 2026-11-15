/**
 * feeds.js — publisher RSS feeds the swarm reads (no Google News). Checked live on
 * 2026-11-15. Moneycontrol is left out: its feeds stopped updating in April 2024.
 * `defaultTz` is applied to pubDates that carry no zone (RBI publishes IST without one).
 */

export const FEEDS = Object.freeze([
  { id: 'et_markets', name: 'Economic Times', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', defaultTz: '+0530' },
  { id: 'livemint_markets', name: 'Mint', url: 'https://www.livemint.com/rss/markets', defaultTz: '+0530' },
  { id: 'bs_markets', name: 'Business Standard', url: 'https://www.business-standard.com/rss/markets-106.rss', defaultTz: '+0530' },
  { id: 'businessline_markets', name: 'BusinessLine', url: 'https://www.thehindubusinessline.com/markets/feeder/default.rss', defaultTz: '+0530' },
  { id: 'rbi_press', name: 'Reserve Bank of India', url: 'https://www.rbi.org.in/pressreleases_rss.xml', defaultTz: '+0530' },
  { id: 'cnbc_markets', name: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258', defaultTz: '+0000' },
  // Bulletins, not top stories: top stories is mostly personal-finance advice columns.
  { id: 'marketwatch_bulletins', name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_bulletins', defaultTz: '+0000' }
]);
