const RSSParser = require("rss-parser");
const parser = new RSSParser();
async function test() {
  const urls = [
      "https://news.google.com/rss/search?q=site%3Abusiness-standard.com+markets&hl=en-IN&gl=IN&ceid=IN:en",
      "https://news.google.com/rss/search?q=site%3Apib.gov.in+finance+OR+economy&hl=en-IN&gl=IN&ceid=IN:en"
  ];
  for (const url of urls) {
      try {
          const feed = await parser.parseURL(url);
          console.log(`✅ [PASS] ${url.slice(0, 40)}... (${feed.items.length} items)`);
      } catch (e) {
          console.log(`❌ [FAIL] ${url.slice(0, 40)}... Error: ${e.message}`);
      }
  }
}
test();
