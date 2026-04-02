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
    console.log("🚀 Initializing Upstox Read-Only Snapshot (v2 SDK)...");
    
    const results = {
        timestamp: new Date().toISOString(),
        user: {},
        portfolio: {},
        market: {}
    };

    try {
        // 1. User Data
        const userApi = new UpstoxClient.UserApi();
        console.log("📡 Fetching Profile & Funds...");
        
        await Promise.allSettled([
            new Promise((res, rej) => userApi.getProfile((err, data) => err ? rej(err) : res(data))),
            new Promise((res, rej) => userApi.getUserFundMargin((err, data) => err ? rej(err) : res(data)))
        ]).then(([profile, funds]) => {
            results.user.profile = profile.status === 'fulfilled' ? profile.value?.data : null;
            results.user.funds = funds.status === 'fulfilled' ? funds.value?.data : null;
        });

        // 2. Portfolio Data
        const portfolioApi = new UpstoxClient.PortfolioApi();
        console.log("📡 Fetching Holdings & Positions...");
        
        await Promise.allSettled([
            new Promise((res, rej) => portfolioApi.getHoldings((err, data) => err ? rej(err) : res(data))),
            new Promise((res, rej) => portfolioApi.getPositions((err, data) => err ? rej(err) : res(data)))
        ]).then(([holdings, positions]) => {
            results.portfolio.holdings = holdings.status === 'fulfilled' ? holdings.value?.data : [];
            results.portfolio.positions = positions.status === 'fulfilled' ? positions.value?.data : [];
        });

        // 3. Market Status
        const marketApi = new UpstoxClient.MarketHolidaysAndTimingsApi();
        console.log("📡 Checking Market Status...");
        
        await new Promise((res) => marketApi.getMarketStatus((err, data) => {
            results.market.status = data?.data || { status: "unknown" };
            res();
        }));

        // 4. Quotes (Main Indices)
        const quoteApi = new UpstoxClient.MarketQuoteV3Api();
        const symbols = "NSE_INDEX|Nifty 50,NSE_INDEX|Nifty Bank,NSE_EQ|RELIANCE,NSE_EQ|HDFCBANK";
        console.log(`📡 Fetching LTP for ${symbols}...`);
        
        await new Promise((res) => quoteApi.getLtp({ instrumentKey: symbols }, (err, data) => {
            results.market.quotes = data?.data || {};
            res();
        }));

        console.log("\n✅ SNAPSHOT COMPLETE");
        console.log("--------------------------------------------------");
        console.log(`👤 User: ${results.user.profile?.email || "N/A"}`);
        console.log(`💰 Funds Available: ${results.user.funds?.equity?.available_margin || "N/A"}`);
        console.log(`📂 Holdings Count: ${results.portfolio.holdings?.length || 0}`);
        console.log(`📊 Nifty 50 LTP: ${results.market.quotes["NSE_INDEX|Nifty 50"]?.last_price || "N/A"}`);
        console.log("--------------------------------------------------");

        // For GHA logs/artifact consumption
        console.log("\nDATA_SNAPSHOT_JSON_START");
        console.log(JSON.stringify(results, null, 2));
        console.log("DATA_SNAPSHOT_JSON_END");

    } catch (err) {
        console.error("❌ Snapshot Critical Failure:", err.message);
        process.exit(1);
    }
}

fetchSnapshot();
