/**
 * BlogsPro Swarm 5.3: Upstox Read-Only Data Snapshot
 * Fetches all possible read-only data via the official Upstox SDK.
 */

import UpstoxClient from 'upstox-js-sdk';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.UPSTOX_ACCESS_TOKEN;

if (!token) {
    console.error("❌ UPSTOX_ACCESS_TOKEN missing in environment.");
    process.exit(1);
}

// Initialize Client
const defaultClient = UpstoxClient.ApiClient.instance;
const OAUTH2 = defaultClient.authentications['OAUTH2'];
OAUTH2.accessToken = token;

async function fetchSnapshot() {
    console.log("🚀 Initializing Upstox Market Snapshot (Public Info Only)...");
    
    const results = {
        timestamp: new Date().toISOString(),
        market: {}
    };

    try {
        // 1. Market Status
        const marketApi = new UpstoxClient.MarketHolidaysAndTimingsApi();
        console.log("📡 Checking Market Status...");
        
        await new Promise((res, rej) => marketApi.getMarketStatus((err, data) => {
            if (err) {
                const status = err.status || err.response?.status;
                if (status === 401 || status === 403) return rej(new Error(`${status} Unauthorized`));
                console.warn("⚠️ Market status fetch failed:", err.message || err);
            }
            results.market.status = data?.data || { status: "unknown" };
            res();
        }));

        // 2. Quotes (Main Indices)
        const quoteApi = new UpstoxClient.MarketQuoteV3Api();
        const symbols = "NSE_INDEX|Nifty 50,NSE_INDEX|Nifty Bank,NSE_EQ|RELIANCE,NSE_EQ|HDFCBANK";
        console.log(`📡 Fetching LTP for ${symbols}...`);

        await new Promise((res, rej) => quoteApi.getLtp({ instrumentKey: symbols }, (err, data) => {
            if (err) {
                const status = err.status || err.response?.status;
                if (status === 401 || status === 403) return rej(new Error(`${status} Unauthorized`));
                console.warn("⚠️ Quote fetch failed:", err.message || err);
            }
            results.market.quotes = data?.data || {};
            res();
        }));

        console.log("\n✅ MARKET SNAPSHOT COMPLETE");
        console.log("--------------------------------------------------");
        console.log(`📊 Nifty 50 LTP: ${results.market.quotes["NSE_INDEX|Nifty 50"]?.last_price || "N/A"}`);
        console.log(`📡 Status: ${results.market.status?.status || "unknown"}`);
        console.log("--------------------------------------------------");

        // For GHA logs/artifact consumption
        console.log("\nDATA_SNAPSHOT_JSON_START");
        console.log(JSON.stringify(results, null, 2));
        console.log("DATA_SNAPSHOT_JSON_END");

    } catch (err) {
        const isAuthError = err.message?.includes('401') || err.message?.includes('Unauthorized')
            || err.message?.includes('invalid_token') || err.message?.includes('expired');

        if (isAuthError) {
            console.warn("⚠️ Snapshot skipped: UPSTOX_ACCESS_TOKEN is expired or invalid.");
            console.warn("   Refresh the token in Upstox Developer Console and update the GH secret.");
            // Exit 0 so CI doesn't hard-fail on a routine token expiry
            process.exit(0);
        }

        console.error("❌ Snapshot Failure:", err.message);
        process.exit(1);
    }
}

fetchSnapshot();
