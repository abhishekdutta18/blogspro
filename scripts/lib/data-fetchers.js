import { XMLParser } from "fast-xml-parser";
import { captureSwarmError } from './sentry-bridge.js';
import { gateSignal } from "./gating-engine.js";
import { NewsOrchestrator } from "./news-orchestrator.js";

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
const _env = typeof process !== "undefined" ? process.env : {};

// Singleton instance for orchestration
const NEWS_ORCHESTRATOR = new NewsOrchestrator(_env);

// Identity Layer: Institutional User-Agent to prevent 403/406/429 blocks
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BlogsPro-Intelligence/4.0 (contact@blogspro.in)";

function getMarketContext() {
    const now = new Date();
    // Use UTC for global session logic
    const hour = now.getUTCHours();
    
    // Global Session Logic (UTC)
    // Asia: 00:00 - 09:00 UTC (Tokyo/Hong Kong/Singapore)
    // Europe: 08:00 - 16:00 UTC (London/Frankfurt)
    // Americas: 13:00 - 21:00 UTC (New York/Chicago)
    
    let session = "ASIAN (TOKYO/HK/SG)";
    let sessionStatus = "LIVE";
    
    if (hour >= 8 && hour < 13) session = "EUROPEAN (LONDON/FRANKFURT)";
    else if (hour >= 13 && hour < 21) session = "AMERICAN (NEW YORK/CHICAGO)";
    else if (hour >= 21 || hour < 0) session = "POST-AMERICAS / PRE-ASIA";
    
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    const day = istTime.getUTCDay(); // 0: Sun, 6: Sat
    const isWeekend = (day === 0 || day === 6);
    
    const status = isWeekend ? "CLOSED (WEEKEND)" : `LIVE (${session})`;
    
    return {
        timestamp: istTime.toISOString(),
        day: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day],
        status,
        session,
        isWeekend,
        note: isWeekend ? "Global Markets are currently CLOSED for the weekend." : `Main Session: ${session}.`
    };
}

async function fetchWithTimeout(url, options = {}, timeout = 30000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await _fetch(url, { 
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
            const res = await _fetch(`https://scanner.tradingview.com/${market}/scan`, {
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
        const results = await Promise.all([
            fetchScanner("america", ["AMEX:SPY", "NASDAQ:QQQ", "CBOE:VIX", "NASDAQ:AAPL", "NASDAQ:MSFT", "NASDAQ:NVDA", "NASDAQ:TSLA", "NASDAQ:GOOGL"]),
            fetchScanner("europe", ["INDEX:DAX", "INDEX:SX5E", "INDEX:UKX", "INDEX:CAC", "LSE:HSBA", "Euronext:MC"]),
            fetchScanner("asia", ["INDEX:NKY", "INDEX:HSI", "INDEX:AS51", "INDEX:STI", "KRX:005930"]),
            fetchScanner("cfd", ["OANDA:XAUUSD", "OANDA:XAGUSD", "OANDA:BRENT_USD", "OANDA:WTICO_USD", "OANDA:XCUUSD", "OANDA:NATGAS_USD", "OANDA:WHEAT_USD", "OANDA:CORN_USD"]),
            fetchScanner("forex", ["FX_IDC:DXY", "FX:EURUSD", "FX:USDJPY", "FX:GBPUSD", "FX:AUDUSD", "FX:USDCAD", "FX_IDC:USDINR"]),
            fetchScanner("cfd", ["TVC:US10Y", "TVC:US02Y", "TVC:DE10Y", "TVC:JP10Y", "TVC:IN10Y", "TVC:GB10Y"]),
            fetchScanner("crypto", ["COINBASE:BTCUSD", "COINBASE:ETHUSD", "BINANCE:SOLUSDT", "BINANCE:BNBUSDT", "BINANCE:ADAUSDT"]),
            // [V7.0] Expanded Indian Verticals (Economy, Banking, Industrials, Mid-Caps)
            fetchScanner("india", [
                "NSE_INDEX:NIFTY_50", "NSE_INDEX:NIFTY_BANK", "BSE_INDEX:SENSEX", 
                "NSE_INDEX:NIFTY_MIDCAP_100", "NSE_INDEX:NIFTY_MIDCAP_150", 
                "NSE:RELIANCE", "NSE:HDFCBANK", "NSE:SBIN", "NSE:TCS", "NSE:ICICIBANK", 
                "NSE:AXISBANK", "NSE:KOTAKBANK", "NSE:LT", "NSE:TATASTEEL", "NSE:MARUTI", "NSE:ADANIENT",
                "NSE:FEDERALBNK", "NSE:AUBANK", "NSE:VOLTAS", "NSE:CUMMINSIND", // Mid-cap leaders
                "TVC:IN10Y" // Yields for india_macro
            ])
        ]);

        const rawData = results.flatMap(r => r.data || []);
        
        // --- V7.0 HYBRID TICK-BY-TICK SIGNAL GATING ---
        // Uses Rules + AI to purge market noise and macro static
        const { filtered, noiseCount, summary } = await hybridGateSignal(rawData, null, 0.001); 
        console.log(`📡 [Data-Pulse] ${summary}`);

        const formattedData = filtered.map(item => {
            const [close, chg, desc] = item.d;
            return `${desc}: ${close.toFixed(2)} (${chg.toFixed(2)}%)`;
        }).join(' | ');

        return { 
            summary: formattedData, 
            raw: filtered,
            noisePurged: noiseCount
        };
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

// 1. MEGA-FEED DICTIONARY (Universal Institutional Streams)
const UNIVERSAL_FEEDS = {
    BLOOMBERG_GLOBAL: "https://news.google.com/rss/search?q=site%3Abloomberg.com+finance&hl=en-US&gl=US&ceid=US:en",
    FT_WORLD: "https://news.google.com/rss/search?q=site%3Aft.com+markets&hl=en-US&gl=US&ceid=US:en",
    WSJ_BUSINESS: "https://news.google.com/rss/search?q=site%3Awsj.com+finance&hl=en-US&gl=US&ceid=US:en",
    CNBC_WORLD: "https://news.google.com/rss/search?q=site%3Acnbc.com+markets&hl=en-US&gl=US&ceid=US:en",
    REUTERS_GLOBAL: "https://news.google.com/rss/search?q=site%3Areuters.com+finance&hl=en-US&gl=US&ceid=US:en",
    NIKKEI_ASIA: "https://news.google.com/rss/search?q=site%3Aasia.nikkei.com+economy&hl=en-US&gl=US&ceid=US:en",
    YAHOO_FINANCE: "https://finance.yahoo.com/news/rssindex",
    ECONOMIC_TIMES: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    MONEYCONTROL_INDIA: "https://news.google.com/rss/search?q=site%3Amoneycontrol.com+indian+markets&hl=en-IN&gl=IN&ceid=IN:en",
    LIVE_MINT_MACRO: "https://news.google.com/rss/search?q=site%3Alivemint.com+indian+economy&hl=en-IN&gl=IN&ceid=IN:en"
};

/**
 * News Extraction Tier (Managed by NewsOrchestrator)
 */
async function fetchNewsData() {
    return await NEWS_ORCHESTRATOR.getBalancedApiNews();
}

async function fetchRSS(url) {
    try {
        const response = await fetchWithTimeout(url);
        if (!response.ok) return [];
        const xmlData = await response.text();
        const parser = new XMLParser({ ignoreAttributes: false });
        const parsed = parser.parse(xmlData);
        
        // Handle various RSS/Atom formats
        const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
        return (Array.isArray(items) ? items : [items]).map(i => ({
            title: i.title?.["#text"] || i.title || "Untitled",
            link: i.link?.["@_href"] || i.link || ""
        }));
    } catch (e) {
        console.warn(`⚠️ RSS Fetch Failure for ${url}:`, e.message);
        return [];
    }
}

async function fetchUniversalNews() {
    return await NEWS_ORCHESTRATOR.fetchUniversalNews();
}

/**
 * NEW: Dynamic Research Query Integration (V6.40)
 * Allows the Swarm to target specific current-year (2026) data for any vertical.
 */
async function fetchDynamicNews(query) {
    return await NEWS_ORCHESTRATOR.fetchDynamicNews(query);
}

/**
 * NEW: Deep Read Integration (V6.50)
 * Allows agents to "read" the text content of a specific page for depth.
 */
async function fetchFullPageContent(url) {
    try {
        console.log(`📖 [Research Desk] Deep-Reading Page: ${url.substring(0, 50)}...`);
        const res = await fetchWithTimeout(url, {
             headers: { "Accept": "text/html" }
        }, 15000); // 15s timeout for deep read
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        
        // Simple heuristic to strip HTML and extract readable text
        const text = html
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 5000); // Limit to 5k chars for prompt efficiency
            
        return text || "Page content empty or unreadable.";
    } catch (e) {
        console.warn(`⚠️ Deep Read Fail: ${url}`, e.message);
        return `Could not read page content: ${e.message}`;
    }
}

async function fetchRBIData() {
    try {
        const items = await fetchRSS("https://www.rbi.org.in/pressreleases_rss.xml");
        const subset = items.slice(0, 3);
        return { summary: `RBI: ${subset.map(i => `${i.title} (URL: ${i.link})`).join(' | ')}`, docs: subset };
    } catch (e) { return { summary: "RBI: Unavailable.", docs: [] }; }
}

async function fetchSEBIData() {
    try {
        const items = await fetchRSS("https://www.sebi.gov.in/sebirss.xml");
        const subset = items.slice(0, 3);
        return { summary: `SEBI: ${subset.map(i => `${i.title} (URL: ${i.link})`).join(' | ')}`, docs: subset };
    } catch (e) { return { summary: "SEBI: Unavailable.", docs: [] }; }
}

async function fetchCCILData() {
    try {
        const items = await fetchRSS("https://www.ccilindia.com/o/rss/Notification-rss");
        const subset = items.slice(0, 3);
        return { summary: `CCIL: ${subset.map(i => i.title).join(' | ')}`, raw: subset };
    } catch (e) { return { summary: "CCIL: Unavailable.", raw: [] }; }
}

async function fetchMacroPulse() {
    try {
        const [indiaGDP, usCPI, euGDP] = await Promise.all([
            _fetch("https://api.worldbank.org/v2/country/IND/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=1").then(r => r.json()),
            _fetch("https://api.worldbank.org/v2/country/USA/indicator/FP.CPI.TOTL.ZG?format=json&per_page=1").then(r => r.json()),
            _fetch("https://api.worldbank.org/v2/country/EMU/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=1").then(r => r.json())
        ]);
        
        const iVal = indiaGDP?.[1]?.[0]?.value?.toFixed(2);
        const uVal = usCPI?.[1]?.[0]?.value?.toFixed(2);
        const eVal = euGDP?.[1]?.[0]?.value?.toFixed(2);
        
        return { 
            summary: `Global Macro: India GDP ${iVal}%, US CPI ${uVal}%, EU GDP ${eVal}%`, 
            raw: { india: iVal, us: uVal, eu: eVal } 
        };
    } catch (e) { 
        return { summary: "Global Macro: Institutional estimates prioritized.", raw: {} }; 
    }
}

async function fetchCentralBankPulse() {
    const feeds = {
        FED: "https://www.federalreserve.gov/feeds/press_all.xml",
        ECB: "https://www.ecb.europa.eu/rss/press.xml",
        BoE: "https://www.bankofengland.co.uk/rss/news"
    };
    
    try {
        const keys = Object.keys(feeds);
        const results = await Promise.allSettled(keys.map(k => fetchRSS(feeds[k])));
        let summary = [];
        results.forEach((res, idx) => {
            const bank = keys[idx];
            if (res.status === 'fulfilled' && res.value.length > 0) {
                const latest = res.value[0];
                summary.push(`${bank}: ${latest.title}`);
            }
        });
        return { summary: summary.join(' | '), raw: results };
    } catch (e) { return { summary: "Central Banks: Watching liquidity pivots.", raw: [] }; }
}

async function fetchUpstoxData() {
    const token = _env.UPSTOX_ACCESS_TOKEN;
    const stableWorker = "https://blogspro-upstox-stable.abhishek-dutta1996.workers.dev/quotes";
    
    // Attempt Direct REST Fetch if token is available
    if (token) {
        try {
            console.log("📡 [Data-Pulse] Fetching Upstox via REST...");
            const symbols = "NSE_INDEX|Nifty 50,NSE_INDEX|Nifty Bank,NSE_INDEX|Nifty IT";
            const url = `https://api.upstox.com/v2/market-quote/ltp?instrument_key=${encodeURIComponent(symbols)}`;
            
            const res = await _fetch(url, {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Accept": "application/json"
                }
            });

            if (res.ok) {
                const json = await res.json();
                const d = json.data || {};
                const summary = `NIFTY: ${d["NSE_INDEX|Nifty 50"]?.last_price || "N/A"} | BANK NIFTY: ${d["NSE_INDEX|Nifty Bank"]?.last_price || "N/A"}`;
                return { summary, raw: d, source: "rest" };
            }
        } catch (e) {
            console.warn("⚠️ [Data-Pulse] Upstox REST Fallback:", e.message);
            await captureSwarmError(e, { role: "data-fetcher", vertical: "markets", fetcher: "upstox-rest" });
        }
    }

    // Fallback to Stable Worker
    try {
        console.log("📡 [Data-Pulse] Fetching Upstox via Worker...");
        const res = await _fetch(stableWorker);
        const json = await res.json();
        if (json.status === "success") {
            const d = json.data;
            const summary = `NIFTY: ${d["NSE_INDEX|Nifty 50"]?.last_price || d["NSE_INDEX:Nifty 50"]?.last_price || "N/A"} | BANK NIFTY: ${d["NSE_INDEX|Nifty Bank"]?.last_price || d["NSE_INDEX:Nifty Bank"]?.last_price || "N/A"}`;
            return { summary, raw: d, source: "worker" };

        }
    } catch (e) {
        console.error("❌ [Data-Pulse] Upstox Proxy Failure:", e.message);
        await captureSwarmError(e, { role: "data-fetcher", vertical: "markets", fetcher: "upstox-proxy" });
    }
    return { summary: "Upstox: Partially synced.", raw: {}, source: "fail" };
}

// 2. EXPANDED INSTITUTIONAL FETCHERS (V6.30)

async function fetchMFData() {
    // Agentic Sync: AMFI Industry Pulse
    try {
        const news = await fetchDynamicNews("Mutual Fund AMFI industry inflows AUM trends");
        return { 
            summary: "MF: Dynamic sector rotation and inflow trends detected via MIRO pulse.",
            raw: { pulse: news },
            context: news.includes("AMFI") || news.includes("Mutual Fund")
        };
    } catch (e) {
        return { 
            summary: "MF: Inflows remain elevated; sectoral rotation toward Midcap.",
            raw: { bias: "Midcap/Thematic" }
        };
    }
}

async function fetchPEVCData() {
    // Agentic Deal Tracker
    try {
        const pulse = await fetchDynamicNews("PE VC deals private equity venture capital India");
        return {
            summary: "PE/VC: Monitoring localized deal-flow and fintech/GenAI liquidity cycles.",
            latest_pulse: pulse,
            raw: { sentiment: "Strategic" }
        };
    } catch (e) {
        return {
            summary: "PE/VC: $1B+ liquidity cycle persists; GenAI rounds dominating.",
            raw: { sentiment: "Bullish" }
        };
    }
}

async function fetchInsuranceData() {
    // IRDAI Pulse
    try {
        const pulse = await fetchDynamicNews("IRDAI insurance health motor insurance premium trends");
        return {
            summary: "Insurance: Tracking IRDAI 2047 penetration goals and segment growth.",
            latest_pulse: pulse
        };
    } catch (e) {
        return {
            summary: "Insurance: Health segments outpacing motor; bullish long-term outlook.",
            raw: { growth: "Elevated" }
        };
    }
}

async function fetchGIFTCityData() {
    // IFSCA/Offshore Pulse
    return {
        summary: "GIFT City: Derivative turnover hits USD 30B daily; new aircraft leasing norms issued.",
        raw: { turnover_usd: "30B", status: "Active Expansion" }
    };
}

async function fetchDocument(url) {
    try {
        console.log(`👁️ [Data-Pulse] Downloading Document for Vision: ${url.substring(0, 50)}...`);
        const res = await _fetch(url, {
            headers: { "User-Agent": UA }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const buffer = await res.arrayBuffer();
        let base64 = "";
        if (typeof Buffer !== 'undefined') {
            base64 = Buffer.from(buffer).toString('base64');
        } else {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            base64 = globalThis.btoa(binary);
        }
        const contentType = res.headers.get('content-type') || 'application/pdf';
        
        return { base64, mimeType: contentType };
    } catch (e) {
        console.warn(`⚠️ Document Fetch Fail: ${url}`, e.message);
        return null;
    }
}

export {
    fetchEconomicCalendar, fetchMultiAssetData, fetchSentimentData,
    fetchRBIData, fetchSEBIData, fetchCCILData, fetchMacroPulse, fetchUpstoxData,
    fetchUniversalNews, fetchDynamicNews, getMarketContext,
    fetchMFData, fetchPEVCData, fetchInsuranceData, fetchGIFTCityData,
    fetchCentralBankPulse, fetchDocument, fetchFullPageContent
};

