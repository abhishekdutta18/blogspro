/**
 * NewsOrchestrator: BlogsPro Multi-Provider Intelligence (V10.0)
 * implements a Balance & Decision Tree for high-fidelity news acquisition.
 * 
 * Logic:
 * 1. RSS Institutional First (Zero cost, high trust)
 * 2. Paid APIs (NewsData.io, NewsAPI.org) - Balanced for quota
 * 3. Dynamic search fallback
 */

import { XMLParser } from "fast-xml-parser";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BlogsPro-Intelligence/4.0 (contact@blogspro.in)";

async function fetchWithTimeout(url, options = {}, timeout = 20000) {
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

async function fetchRSS(url) {
    try {
        const response = await fetchWithTimeout(url);
        if (!response.ok) return [];
        const xmlData = await response.text();
        const parser = new XMLParser({ 
            ignoreAttributes: false,
            attributeNamePrefix: "@_"
        });
        const parsed = parser.parse(xmlData);
        
        const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
        return (Array.isArray(items) ? items : [items]).map(i => {
            let link = "";
            if (typeof i.link === 'string') link = i.link;
            else if (i.link && i.link["@_href"]) link = i.link["@_href"];
            else if (Array.isArray(i.link)) {
                const alternate = i.link.find(l => l["@_rel"] === "alternate");
                link = alternate ? alternate["@_href"] : (i.link[0]?.["@_href"] || "");
            }

            return {
                title: i.title?.["#text"] || i.title || "Untitled",
                link: link || ""
            };
        });
    } catch (e) {
        return [];
    }
}

export class NewsOrchestrator {
    constructor(env = {}) {
        this.env = env;
        this.config = {
            feeds: {
                BLOOMBERG: "https://news.google.com/rss/search?q=site%3Abloomberg.com+finance&hl=en-US&gl=US&ceid=US:en",
                FT: "https://news.google.com/rss/search?q=site%3Aft.com+markets&hl=en-US&gl=US&ceid=US:en",
                REUTERS: "https://news.google.com/rss/search?q=site%3Areuters.com+finance&hl=en-US&gl=US&ceid=US:en",
                CNBC: "https://news.google.com/rss/search?q=site%3Acnbc.com+markets&hl=en-US&gl=US&ceid=US:en",
                NIKKEI: "https://news.google.com/rss/search?q=site%3Aasia.nikkei.com+economy&hl=en-US&gl=US&ceid=US:en"
            },
            apiProviders: [
                { id: "newsdata", name: "NewsData.io", key: env.NEWS_API_KEY, weight: 0.6 },
                { id: "newsapi", name: "NewsAPI.org", key: env.NEWS_API_ORG_KEY || env.NEWSAPI_KEY, weight: 0.4 }
            ]
        };
    }

    /**
     * Decision Tree: Universal Institutional Stream
     */
    async fetchUniversalNews() {
        console.log("🌲 [NewsTree] Starting Universal Multi-Source Acquisition...");
        
        // Tier 1: institutional RSS (Parallel)
        const keys = Object.keys(this.config.feeds);
        const rssResults = await Promise.allSettled(keys.map(k => fetchRSS(this.config.feeds[k])));
        
        let masterNews = [];
        rssResults.forEach((res, idx) => {
            if (res.status === 'fulfilled' && res.value.length > 0) {
                const items = res.value.slice(0, 3).map(i => `${keys[idx]} | ${i.title}`);
                masterNews.push(...items);
            }
        });

        // Tier 2: Paid API Fallback/Balance (If RSS is insufficient)
        if (masterNews.length < 5) {
            console.log("⚖️ [NewsTree] RSS Density Low. Activating Managed API Tier...");
            const apiNews = await this.getBalancedApiNews();
            masterNews.push(...apiNews);
        }

        return masterNews.length > 0 ? masterNews.join(' | ') : "Institutional Pulse: Neutral baseline.";
    }

    /**
     * Decision Tree: Dynamic Vertical Search
     */
    async fetchDynamicNews(query) {
        console.log(`🌲 [NewsTree] Executing Dynamic Search Pulse for: ${query}...`);
        
        // Tier 1: Search RSS (Fast, Zero Cost)
        const encoded = encodeURIComponent(`${query} 2025 2026 finance metrics`);
        const url = `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;
        
        const items = await fetchRSS(url);
        if (items.length >= 5) {
            return items.slice(0, 10).map((i, idx) => {
                const domain = (typeof i.link === 'string' && i.link.includes('/')) ? i.link.split('/')[2] : "institutional-source";
                return `[Pulse ${idx + 1}] ${i.title} (Source: ${domain})`;
            }).join('\n');
        }

        // Tier 2: Deep API Research (Balance)
        console.log("⚖️ [NewsTree] Dynamic RSS Insufficient. Consulting Paid Providers...");
        const apiNews = await this.getBalancedApiNews(query);
        return apiNews.length > 0 ? apiNews.join('\n') : `No deep pulse found for ${query}.`;
    }

    /**
     * Balancing Logic: Multi-Provider Selection
     */
    async getBalancedApiNews(query = null) {
        // Filter providers with keys
        const providers = this.config.apiProviders.filter(p => p.key);
        if (providers.length === 0) return [];

        // Weighted Balancing
        const rand = Math.random();
        let cumulative = 0;
        let selected = providers[0];

        for (const p of providers) {
            cumulative += p.weight;
            if (rand < cumulative) {
                selected = p;
                break;
            }
        }

        try {
            console.log(`📡 [NewsTree] Balanced Selection: ${selected.name}`);
            if (selected.id === "newsdata") {
                return await this.fetchFromNewsData(selected.key, query);
            } else if (selected.id === "newsapi") {
                return await this.fetchFromNewsApi(selected.key, query);
            }
        } catch (e) {
            console.warn(`⚠️ [NewsTree] Provider ${selected.name} Failed:`, e.message);
            // Self-Heal: Try the other provider if available
            const other = providers.find(p => p.id !== selected.id);
            if (other) {
                console.log(`🔄 [NewsTree] Auto-Failover to: ${other.name}`);
                if (other.id === "newsdata") return await this.fetchFromNewsData(other.key, query);
                if (other.id === "newsapi") return await this.fetchFromNewsApi(other.key, query);
            }
        }
        return [];
    }

    async fetchFromNewsData(key, query) {
        const q = query ? `&q=${encodeURIComponent(query)}` : "&category=business,top";
        const url = `https://newsdata.io/api/1/news?apikey=${key}${q}&language=en`;
        const res = await fetchWithTimeout(url);
        const json = await res.json();
        if (json.status === "success" && json.results) {
            return json.results.slice(0, 5).map(i => `${i.source_id.toUpperCase()} (NewsData) | ${i.title}`);
        }
        return [];
    }

    async fetchFromNewsApi(key, query) {
        const q = query ? encodeURIComponent(query) : "finance OR markets";
        const url = `https://newsapi.org/v2/top-headlines?q=${q}&apiKey=${key}&language=en`;
        const res = await fetchWithTimeout(url);
        const json = await res.json();
        if (json.status === "ok" && json.articles) {
            return json.articles.slice(0, 5).map(i => `${i.source.name} (NewsAPI) | ${i.title}`);
        }
        return [];
    }
}
