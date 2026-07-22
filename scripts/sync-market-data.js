/**
 * BlogsPro - 5000+ Ticker Bulk Synchronization Script
 * Fetches historical End-of-Day (EOD) data from Yahoo Finance across thousands of symbols.
 * 
 * Usage: node scripts/sync-market-data.js
 */

const fs = require('fs');
const path = require('path');

const TICKERS_FILE = path.join(__dirname, '../knowledge/tickers_5000.json');
const OUTPUT_FILE = path.join(__dirname, '../knowledge/market_history.json');
const BATCH_SIZE = 10;
const DELAY_MS = 1000; // 1s between batches to avoid 429 Rate Limiting

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";

async function fetchHistorical(symbol) {
    try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
        const res = await fetch(url, { headers: { "User-Agent": UA } });
        if (!res.ok) return null;
        
        const data = await res.json();
        const result = data.chart?.result?.[0];
        if (!result || !result.indicators?.quote?.[0]?.close) return null;
        
        const closes = result.indicators.quote[0].close;
        const validCloses = closes.filter(c => c !== null);
        return { symbol, closes: validCloses };
    } catch (e) {
        return null;
    }
}

async function runSync() {
    console.log("Starting Bulk Sync of 5000+ Tickers...");
    let tickers = [];
    try {
        tickers = JSON.parse(fs.readFileSync(TICKERS_FILE, 'utf8'));
    } catch (e) {
        console.error("Failed to load tickers file.", e);
        return;
    }

    const historyCache = {};
    let processed = 0;

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const batch = tickers.slice(i, i + BATCH_SIZE);
        const promises = batch.map(sym => fetchHistorical(sym));
        const results = await Promise.all(promises);

        for (const res of results) {
            if (res) {
                historyCache[res.symbol] = res.closes;
            }
        }

        processed += batch.length;
        console.log(`Processed ${processed} / ${tickers.length} tickers...`);

        // Wait to avoid rate limits
        if (i + BATCH_SIZE < tickers.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(historyCache));
    console.log(`Sync Complete! Fetched ${Object.keys(historyCache).length} active symbols. Data saved to market_history.json`);
}

runSync();
