const { XMLParser } = require("fast-xml-parser");
const RSSParser = require("rss-parser");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

async function fetchEconomicCalendar() {
    try {
        const response = await fetch("https://nfs.forexfactory.com/ff_calendar_thisweek.xml");
        const xmlData = await response.text();
        const parser = new XMLParser();
        const jsonObj = parser.weeklycalendar.event || [];
        const events = Array.isArray(jsonObj) ? jsonObj : [jsonObj];
        const highImpact = events.filter(e => e.impact === 'High');
        return { 
            text: `High Impact Events: ${highImpact.slice(0, 10).map(e => `${e.event} (${e.country})`).join(', ')}`,
            raw: highImpact.slice(0, 10)
        };
    } catch (err) { return { text: "Calendar: Unavailable.", raw: [] }; }
}

async function fetchMultiAssetData() {
    const fetchScanner = async (market, symbols) => {
        try {
            const res = await fetch(`https://scanner.tradingview.com/${market}/scan`, {
                method: "POST",
                body: JSON.stringify({
                    "symbols": { "tickers": symbols },
                    "columns": ["base_currency", "currency", "close", "change", "change_abs", "description"]
                })
            });
            return await res.json();
        } catch (e) { return { data: [] }; }
    };

    try {
        const [forex, stocks, crypto] = await Promise.all([
            fetchScanner("forex", ["FX:USDINR", "FX:EURUSD", "FX:GBPUSD", "OANDA:XAUUSD", "TVC:UKOIL"]),
            fetchScanner("india", ["NSE:RELIANCE", "NSE:HDFCBANK", "NSE:ICICIBANK", "NSE:INFY", "NSE:TCS", "TVC:IN10Y"]),
            fetchScanner("crypto", ["BINANCE:BTCUSDT", "BINANCE:ETHUSDT", "BINANCE:SOLUSDT"])
        ]);

        const allData = [...(forex.data || []), ...(stocks.data || []), ...(crypto.data || [])].filter(i => i && i.d);
        const summary = allData.map(item => {
            const [base, cur, close, chg, abs, desc] = item.d;
            return `${desc || base+cur}: ${close.toFixed(2)} (${chg.toFixed(2)}%)`;
        }).join(' | ');
        return { summary, raw: allData };
    } catch (e) { return { summary: "Market Data: Unavailable.", raw: [] }; }
}

async function fetchIndianNews() {
    try {
        const parser = new RSSParser();
        const feeds = [
            "https://www.business-standard.com/rss/markets-106.rss",
            "https://www.livemint.com/rss/markets",
            "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms"
        ];
        const results = await Promise.allSettled(feeds.map(f => parser.parseURL(f)));
        const news = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value.items.slice(0, 5))
            .map(i => i.title)
            .join(' | ');
        return news || "Indian News: No recent updates.";
    } catch (e) { return "Indian News: Unavailable."; }
}

async function fetchGlobalNews() {
    try {
        const parser = new RSSParser();
        const feeds = [
            "https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml",
            "https://www.reutersagency.com/feed/?best-topics=business&post_type=best"
        ];
        const results = await Promise.allSettled(feeds.map(f => parser.parseURL(f)));
        const news = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value.items.slice(0, 5))
            .map(i => i.title)
            .join(' | ');
        return news || "Global News: No recent updates.";
    } catch (e) { return "Global News: Unavailable."; }
}

async function fetchGlobalMarkets() {
    try {
        const res = await fetch("https://blogspro-upstox.abhishek-dutta1996.workers.dev/global");
        const json = await res.json();
        if (json.status === 'success') {
            const summary = json.data.map(d => `${d.symbol}: ${d.price} (${d.change}%)`).join(' | ');
            return { summary, raw: json.data };
        }
        return { summary: "Global Markets: Unavailable.", raw: [] };
    } catch (e) { return { summary: "Global Markets: Unavailable.", raw: [] }; }
}

async function downloadRegFile(url, fileName) {
    try {
        const downloadsDir = path.join(__dirname, "../../downloads");
        if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
        const dest = path.join(downloadsDir, fileName);
        if (fs.existsSync(dest)) return fileName;
        const res = await fetch(url);
        const buffer = await res.buffer();
        fs.writeFileSync(dest, buffer);
        console.log(`✅ Downloaded: ${fileName}`);
        return fileName;
    } catch (e) {
        console.warn(`❌ Download fail (${fileName}):`, e.message);
        return null;
    }
}

async function fetchRBIData() {
    try {
        const parser = new RSSParser();
        const urls = [
            "https://www.rbi.org.in/pressreleases_rss.xml",
            "https://www.rbi.org.in/notifications_rss.xml"
        ];
        const results = await Promise.allSettled(urls.map(u => parser.parseURL(u)));
        const items = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value.items.slice(0, 3));
        
        const docs = [];
        for (const item of items.slice(0, 3)) {
            try {
                const html = await fetchWithTimeout(item.link).then(r => r.text());
                const pdfMatch = html.match(/href="([^"]+\.PDF)"/i);
                if (pdfMatch) {
                    const pdfUrl = pdfMatch[1].startsWith('http') ? pdfMatch[1] : `https://www.rbi.org.in/${pdfMatch[1]}`;
                    const local = await downloadRegFile(pdfUrl, `rbi-${Date.now()}-${path.basename(pdfUrl)}`);
                    if (local) docs.push({ title: item.title, url: item.link, pdf: local });
                }
            } catch (e) { console.warn(`⚠️ RBI Item fetch failed: ${item.link}`); }
        }
        return { summary: `RBI: ${items.map(i => i.title).join(' | ')}`, docs };
    } catch (e) { return { summary: "RBI: Unavailable.", docs: [] }; }
}

async function fetchCCILData() {
    try {
        const parser = new RSSParser();
        const feeds = [
            "https://www.ccilindia.com/o/rss/Notification-rss",
            "https://www.ccilindia.com/web/ccil/what-s-news/-/journal/rss/43866/334136201"
        ];
        const results = await Promise.allSettled(feeds.map(f => parser.parseURL(f)));
        const items = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value.items.slice(0, 5));
        return { 
            summary: items.length ? `CCIL Pulse: ${items.map(i => i.title).join(' | ')}` : "CCIL: No recent updates.",
            raw: items 
        };
    } catch (e) { return { summary: "CCIL Data: Unavailable.", raw: [] }; }
}

async function fetchSEBIData() {
    try {
        const parser = new RSSParser();
        const feed = await parser.parseURL("https://www.sebi.gov.in/sebirss.xml");
        const items = feed.items.slice(0, 3);
        const docs = [];
        for (const item of items) {
            try {
                const html = await fetchWithTimeout(item.link).then(r => r.text());
                const pdfMatch = html.match(/https:\/\/www\.sebi\.gov\.in\/sebi_data\/attachdocs\/[^"]+\.pdf/i);
                if (pdfMatch) {
                    const local = await downloadRegFile(pdfMatch[0], `sebi-${Date.now()}-${path.basename(pdfMatch[0])}`);
                    if (local) docs.push({ title: item.title, url: item.link, pdf: local });
                }
            } catch (e) { console.warn(`⚠️ SEBI Item fetch failed: ${item.link}`); }
        }
        return { summary: `SEBI: ${items.map(i => i.title).join(' | ')}`, docs };
    } catch (e) { return { summary: "SEBI: Unavailable.", docs: [] }; }
}

async function fetchMacroPulse() {
    const getWB = async (country, indicator) => {
        try {
            const res = await fetch(`https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&per_page=1`);
            const json = await res.json();
            if (json && json[1] && json[1][0]) {
                const item = json[1][0];
                return { 
                    value: (item.value !== null && item.value !== undefined) ? item.value.toFixed(2) : "N/A", 
                    date: item.date || "N/A" 
                };
            }
        } catch (e) {}
        return { value: "N/A", date: "N/A" };
    };

    try {
        const [inGdp, inInf, usGdp, usInf] = await Promise.all([
            getWB("IND", "NY.GDP.MKTP.KD.ZG"),
            getWB("IND", "FP.CPI.TOTL.ZG"),
            getWB("USA", "NY.GDP.MKTP.KD.ZG"),
            getWB("USA", "FP.CPI.TOTL.ZG")
        ]);
        return {
            summary: `IN GDP: ${inGdp.value}% (${inGdp.date}) | IN INF: ${inInf.value}% (${inInf.date}) | US GDP: ${usGdp.value}% (${usGdp.date}) | US INF: ${usInf.value}% (${usInf.date})`,
            raw: { india: { gdp: inGdp, inflation: inInf }, us: { gdp: usGdp, inflation: usInf } }
        };
    } catch (e) { return { summary: "Macro Data: Unavailable.", raw: {} }; }
}

async function fetchUpstoxData() {
    try {
        const [liveRes, histRes] = await Promise.all([
            fetch("https://blogspro-upstox-stable.abhishek-dutta1996.workers.dev/quotes"),
            fetch("https://blogspro-upstox-stable.abhishek-dutta1996.workers.dev/historical?instrumentKey=NSE_INDEX%7CNifty%2050&interval=day")
        ]);
        const liveData = await liveRes.json();
        const histData = await histRes.json();
        let summary = "Upstox: Live data unavailable.";
        let raw = {};
        if (liveData.status === "success" && liveData.data) {
            const d = liveData.data;
            const getLtp = (s) => d[s]?.last_price || "N/A";
            summary = `NIFTY: ${getLtp("NSE_INDEX:Nifty 50")} | BANK NIFTY: ${getLtp("NSE_INDEX:Nifty Bank")} | REL: ${getLtp("NSE_EQ:RELIANCE")} | HDFC: ${getLtp("NSE_EQ:HDFCBANK")}`;
            raw = d;
        }
        if (histData.status === "success" && histData.data && histData.data.candles) {
            const lastClose = histData.data.candles[0][4]; 
            const prevClose = histData.data.candles[1][4];
            summary += ` | NIFTY Trend: ${lastClose > prevClose ? "Bullish" : "Bearish"} (${((lastClose - prevClose)/prevClose * 100).toFixed(2)}%)`;
        }
        return { summary, raw };
    } catch (e) { return { summary: "Live Markets (Upstox): Currently unavailable. Relying on TradingView fallback.", raw: {} }; }
}

module.exports = {
    fetchEconomicCalendar,
    fetchMultiAssetData,
    fetchIndianNews,
    fetchGlobalNews,
    fetchGlobalMarkets,
    fetchRBIData,
    fetchCCILData,
    fetchSEBIData,
    fetchMacroPulse,
    fetchUpstoxData
};
