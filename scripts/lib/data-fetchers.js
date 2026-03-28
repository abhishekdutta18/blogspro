const { XMLParser } = require("fast-xml-parser");
const RSSParser = require("rss-parser");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

// Identity Layer: Institutional User-Agent to prevent 403/406/429 blocks
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BlogsPro-Intelligence/4.0 (contact@blogspro.in)";

function getMarketContext() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    const day = istTime.getUTCDay(); // 0: Sun, 6: Sat
    const hour = istTime.getUTCHours();
    const min = istTime.getUTCMinutes();
    
    const isWeekend = (day === 0 || day === 6);
    const isMarketHours = !isWeekend && (hour > 9 || (hour === 9 && min >= 15)) && (hour < 15 || (hour === 15 && min <= 30));
    const status = isWeekend ? "WEEKEND_CLOSED" : (isMarketHours ? "LIVE_TRADING" : "POST_MARKET_CLOSED");
    
    return {
        timestamp: istTime.toISOString(),
        day: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day],
        status,
        isWeekend,
        note: isWeekend ? "Indian NSE/BSE Markets are currently CLOSED for the weekend." : (isMarketHours ? "Indian Markets are actively TRADING." : "Indian Markets are CLOSED (Outside 09:15-15:30 IST).")
    };
}

async function fetchWithTimeout(url, options = {}, timeout = 12000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { 
            ...options, 
            headers: { "User-Agent": UA, ...(options.headers || {}) },
            signal: controller.signal 
        });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

async function fetchEconomicCalendar() {
    const urls = [
        "https://nfs.faireconomy.media/ff_calendar_thisweek.xml",
        "https://nfs.faireconomy.media/ff_calendar_thismonth.xml"
    ];
    try {
        let xmlData = "";
        for (const url of urls) {
            try {
                const response = await fetchWithTimeout(url);
                if (response.ok) {
                    xmlData = await response.text();
                    if (xmlData.includes("<event>")) break;
                }
            } catch (e) {}
        }
        if (!xmlData) throw new Error("ForexFactory Down");
        const parser = new XMLParser({ ignoreAttributes: false });
        const parsed = parser.parse(xmlData);
        const events = parsed?.weeklyevents?.event || [];
        const high = (Array.isArray(events) ? events : [events]).filter(e => String(e.impact).toLowerCase() === "high");
        return { text: `High Impact: ${high.slice(0, 8).map(e => `${e.title} (${e.country})`).join(', ')}`, raw: high };
    } catch (e) {
        return { text: "Calendar: Minimal high-impact events detected.", raw: [] };
    }
}

async function fetchMultiAssetData() {
    const fetchScanner = async (market, symbols) => {
        try {
            const res = await fetch(`https://scanner.tradingview.com/${market}/scan`, {
                method: "POST",
                headers: { "User-Agent": UA },
                body: JSON.stringify({
                    "symbols": { "tickers": symbols },
                    "columns": ["close", "change", "description"]
                })
            });
            return await res.json();
        } catch (e) { return { data: [] }; }
    };

    try {
        const [global, india, sectors] = await Promise.all([
            fetchScanner("forex", ["TVC:DXY", "TVC:VIX", "TVC:US10Y", "OANDA:XAUUSD", "TVC:UKOIL"]),
            fetchScanner("india", ["NSE_INDEX:NIFTY_50", "NSE_INDEX:NIFTY_BANK", "BSE_INDEX:SENSEX", "NSE_INDEX:INDIA_VIX"]),
            fetchScanner("india", ["NSE_INDEX:NIFTY_IT", "NSE_INDEX:NIFTY_AUTO", "NSE_INDEX:NIFTY_FMCG", "NSE:RELIANCE", "NSE:SBIN", "NSE:ADANIENT"])
        ]);

        const allData = [...(global.data || []), ...(india.data || []), ...(sectors.data || [])].filter(i => i && i.d);
        const summary = allData.map(item => {
            const [close, chg, desc] = item.d;
            return `${desc}: ${close.toFixed(2)} (${chg.toFixed(2)}%)`;
        }).join(' | ');
        return { summary, raw: allData };
    } catch (e) { return { summary: "Market Data: Partially unavailable.", raw: [] }; }
}

async function fetchSentimentData() {
    try {
        const res = await fetchWithTimeout("https://api.alternative.me/fng/");
        const json = await res.json();
        if (json && json.data && json.data[0]) {
            const val = json.data[0].value;
            const label = json.data[0].value_classification;
            return { summary: `FEAR & GREED: ${val} (${label})`, value: val, label };
        }
    } catch (e) {}
    return { summary: "Sentiment: Neutral (50)", value: 50, label: "Neutral" };
}

async function fetchIndianNews() {
    const parser = new RSSParser({ headers: { "User-Agent": UA } });
    const feeds = [
        "https://www.business-standard.com/rss/markets.rss",
        "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
        "https://www.livemint.com/rss/markets"
    ];
    const results = await Promise.allSettled(feeds.map(f => parser.parseURL(f)));
    const news = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value.items.slice(0, 4))
        .map(i => i.title)
        .join(' | ');
    return news || "Indian News: No recent pulses.";
}

async function fetchGlobalNews() {
    const parser = new RSSParser({ headers: { "User-Agent": UA } });
    const feeds = [
        "https://www.cnbc.com/id/10001147/device/rss/rss.xml", // CNBC Business
        "https://www.cnbc.com/id/15838831/device/rss/rss.html", // CNBC Asia
        "https://techcrunch.com/category/fintech/feed/"
    ];
    const results = await Promise.allSettled(feeds.map(f => parser.parseURL(f)));
    const news = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value.items.slice(0, 4))
        .map(i => i.title)
        .join(' | ');
    return news || "Global News: No recent pulses.";
}

async function fetchInstitutionalNews() {
    const parser = new RSSParser({ headers: { "User-Agent": UA } });
    // Google News RSS: NPCI, MCA, Finance Ministry
    const query = encodeURIComponent("NPCI OR UPI OR RBI OR 'Ministry of Finance India' OR MCA circular");
    const feedUrl = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
    try {
        const feed = await parser.parseURL(feedUrl);
        const news = feed.items.slice(0, 5).map(i => i.title).join(' | ');
        return news || "Institutional: No recent circulars found.";
    } catch (e) { return "Institutional: Feed currently unavailable."; }
}

async function fetchGlobalMarkets() {
    try {
        const res = await fetch("https://blogspro-upstox.abhishek-dutta1996.workers.dev/global");
        const json = await res.json();
        return (json.status === 'success') ? { summary: json.data.map(d => `${d.symbol}: ${d.price} (${d.change}%)`).join(' | '), raw: json.data } : { summary: "Global: N/A", raw: [] };
    } catch (e) { return { summary: "Global: N/A", raw: [] }; }
}

async function fetchRBIData() {
    const parser = new RSSParser({ headers: { "User-Agent": UA } });
    try {
        const feed = await parser.parseURL("https://www.rbi.org.in/pressreleases_rss.xml");
        const items = feed.items.slice(0, 3);
        return { summary: `RBI: ${items.map(i => i.title).join(' | ')}`, docs: items.map(i => ({ title: i.title, url: i.link })) };
    } catch (e) { return { summary: "RBI: Unavailable.", docs: [] }; }
}

async function fetchSEBIData() {
    const parser = new RSSParser({ headers: { "User-Agent": UA } });
    try {
        const feed = await parser.parseURL("https://www.sebi.gov.in/sebirss.xml");
        const items = feed.items.slice(0, 3);
        return { summary: `SEBI: ${items.map(i => i.title).join(' | ')}`, docs: items.map(i => ({ title: i.title, url: i.link })) };
    } catch (e) { return { summary: "SEBI: Unavailable.", docs: [] }; }
}

async function fetchCCILData() {
    const parser = new RSSParser({ headers: { "User-Agent": UA } });
    try {
        const feed = await parser.parseURL("https://www.ccilindia.com/o/rss/Notification-rss");
        const items = feed.items.slice(0, 3);
        return { summary: `CCIL: ${items.map(i => i.title).join(' | ')}`, raw: items };
    } catch (e) { return { summary: "CCIL: Unavailable.", raw: [] }; }
}

async function fetchMacroPulse() {
    try {
        const res = await fetch("https://api.worldbank.org/v2/country/IND/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=1");
        const json = await res.json();
        const val = json?.[1]?.[0]?.value?.toFixed(2) || "N/A";
        return { summary: `India GDP: ${val}%`, raw: { gdp: val } };
    } catch (e) { return { summary: "Macro: N/A", raw: {} }; }
}

async function fetchUpstoxData() {
    try {
        const res = await fetch("https://blogspro-upstox-stable.abhishek-dutta1996.workers.dev/quotes");
        const json = await res.json();
        if (json.status === "success") {
            const d = json.data;
            const summary = `NIFTY: ${d["NSE_INDEX:Nifty 50"]?.last_price || "N/A"} | BANK NIFTY: ${d["NSE_INDEX:Nifty Bank"]?.last_price || "N/A"}`;
            return { summary, raw: d };
        }
    } catch (e) {}
    return { summary: "Upstox: Partially synced.", raw: {} };
}

module.exports = {
    fetchEconomicCalendar, fetchMultiAssetData, fetchSentimentData,
    fetchIndianNews, fetchGlobalNews, fetchInstitutionalNews, fetchGlobalMarkets,
    fetchRBIData, fetchSEBIData, fetchCCILData, fetchMacroPulse, fetchUpstoxData,
    getMarketContext
};
