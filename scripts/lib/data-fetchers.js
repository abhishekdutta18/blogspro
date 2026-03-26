const { XMLParser } = require("fast-xml-parser");
const Parser = require("rss-parser");

// Node 18+ has global fetch, but we'll use a wrapper for safety/logging
// Simple deduplication helper (title similarity)
const seenTitles = new Set();
function isDuplicate(title) {
    const slug = (title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seenTitles.has(slug)) return true;
    seenTitles.add(slug);
    return false;
}

// Simple sentiment score (0-10) based on keywords
function getSentiment(text) {
    const pos = ["growth", "surge", "approval", "success", "profit", "bullish", "innovation", "partnership", "rbi approval", "sebi"];
    const neg = ["crash", "drop", "failure", "scam", "fraud", "penalty", "loss", "bearish", "hacked"];
    let score = 5;
    const lower = text.toLowerCase();
    pos.forEach(w => { if (lower.includes(w)) score += 1; });
    neg.forEach(w => { if (lower.includes(w)) score -= 1; });
    return Math.max(1, Math.min(10, score));
}

async function safeFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status} at ${url}`);
        return response;
    } catch (error) {
        console.error(`Fetch error for ${url}:`, error.message);
        return null;
    }
}

/**
 * Fetches high-impact economic events from Forex Factory's XML feed.
 */
async function fetchForexFactory() {
    const url = "https://nfs.forexfactory.com/ff_calendar_thisweek.xml";
    const response = await safeFetch(url);
    if (!response) return "FOREX FACTORY: Data unavailable.\n";

    const xmlData = await response.text();
    const parser = new XMLParser();
    const jsonObj = parser.parse(xmlData);
    
    // Sometimes it's an array, sometimes a single object
    let events = jsonObj.weeklyevents.event;
    if (!Array.isArray(events)) events = [events];

    let context = "THIS WEEK'S HIGH-IMPACT ECONOMIC EVENTS (FOREX FACTORY):\n";
    let foundHigh = false;

    events.forEach(event => {
        if (event.impact === "High") {
            foundHigh = true;
            context += `
- Event: ${event.title}
- Currency: ${event.country}
- Date/Time: ${event.date} ${event.time}
- Forecast: ${event.forecast || "N/A"}
- Previous: ${event.previous || "N/A"}
- Actual: ${event.actual || "Not yet released"}
`;
        }
    });

    return foundHigh ? context : "FOREX FACTORY: No high-impact events found.\n";
}

/**
 * Fetches news from NewsAPI.
 * Requires API_KEY_NEWS in environment.
 */
async function fetchNewsAPI(query = "fintech OR finance") {
    const apiKey = process.env.API_KEY_NEWS;
    if (!apiKey) return "NEWS API: API key missing.\n";

    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=5&apiKey=${apiKey}`;
    const response = await safeFetch(url);
    if (!response) return "NEWS API: Data unavailable.\n";

    const data = await response.json();
    if (!data.articles || data.articles.length === 0) return "NEWS API: No articles found.\n";

    // Sort by sentiment and deduplicate
    const processed = data.articles
        .filter(a => !isDuplicate(a.title))
        .map(a => ({ ...a, sentiment: getSentiment(`${a.title} ${a.description}`) }))
        .sort((a, b) => b.sentiment - a.sentiment)
        .slice(0, 5);

    let context = "LATEST NEWS HEADLINES (SCORED BY SENTIMENT):\n";
    processed.forEach((article, i) => {
        context += `${i + 1}. Source: ${article.source.name} [Sentiment: ${article.sentiment}/10]\n   Title: ${article.title}\n   Snippet: ${article.description || "N/A"}\n`;
    });
    return context;
}

/**
 * Fetches and parses an RSS feed (e.g., WSJ, FT).
 */
async function fetchRSS(url, sourceName = "RSS Feed") {
    const parser = new Parser({
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BlogsPro-Bot/1.0" }
    });

    try {
        const feed = await parser.parseURL(url);
        let context = `PREMIUM NEWSPAPER HEADLINES (${sourceName}):\n`;
        feed.items
            .filter(item => !isDuplicate(item.title))
            .slice(0, 3)
            .forEach((item, i) => {
                context += `${i + 1}. Title: ${item.title}\n   Snippet: ${(item.contentSnippet || "").substring(0, 200)}...\n`;
            });
        return context;
    } catch (error) {
        console.error(`RSS Error (${sourceName}):`, error.message);
        return `${sourceName}: Data unavailable.\n`;
    }
}

/**
 * Fetches research papers from arXiv.
 */
async function fetchArXiv(query = "cat:q-fin.ST OR cat:q-fin.GN") {
    const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=3`;
    const response = await safeFetch(url);
    if (!response) return "ARXIV: Data unavailable.\n";

    const xmlData = await response.text();
    const parser = new XMLParser();
    const jsonObj = parser.parse(xmlData);

    let entries = jsonObj.feed.entry;
    if (!entries) return "ARXIV: No recent papers found.\n";
    if (!Array.isArray(entries)) entries = [entries];

    let context = "LATEST ACADEMIC RESEARCH (arXiv):\n";
    entries.forEach((entry, i) => {
        const summary = (entry.summary || "").replace(/\n/g, " ").substring(0, 300);
        context += `${i + 1}. Title: ${entry.title}\n   Abstract: ${summary}...\n`;
    });
    return context;
}

module.exports = {
    fetchForexFactory,
    fetchNewsAPI,
    fetchRSS,
    fetchArXiv
};
