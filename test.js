const RSSParser = require("rss-parser");
const parser = new RSSParser({ timeout: 10000 });

const feeds = [
    "https://www.business-standard.com/rss/markets-106.rss",
    "https://www.livemint.com/rss/markets",
    "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    "https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml",
    "https://www.reutersagency.com/feed/?best-topics=business&post_type=best",
    "https://www.rbi.org.in/pressreleases_rss.xml",
    "https://www.sebi.gov.in/sebirss.xml"
];

async function testFeeds() {
    console.log("🔍 Testing Newsfeeds...");
    for (const url of feeds) {
        try {
            const feed = await parser.parseURL(url);
            console.log(`✅ [PASS] ${url.slice(0, 40)}... (${feed.items.length} items)`);
        } catch (e) {
            console.log(`❌ [FAIL] ${url.slice(0, 40)}... - Error: ${e.message}`);
        }
    }
}

testFeeds();
