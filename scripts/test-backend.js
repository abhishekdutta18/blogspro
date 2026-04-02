/**
 * scripts/test-backend.js
 * Verifies live connectivity for BlogsPro backend using native fetch (No dependencies).
 */
// const https = require("https"); // Removed: Using native fetch

async function get(url) {
    try {
        const res = await fetch(url);
        const data = await res.text();
        return { status: res.status, data };
    } catch (err) {
        throw err;
    }
}

async function testBackend() {
    console.log("🚀 Starting BlogsPro Backend Integration Test (Dependency-Free)...");
    
    // 1. Upstox Proxy (Indian Markets)
    console.log("\n📡 Testing Upstox Proxy (India)...");
    try {
        const res = await get("https://blogspro-upstox-stable.abhishek-dutta1996.workers.dev/quotes");

        const json = JSON.parse(res.data);
        if (json.status === "success") {
            const symbols = Object.keys(json.data || {});
            console.log(`✅ SUCCESS: Upstox Proxy is LIVE. Fetched ${symbols.length} symbols.`);
        } else {
            console.warn("⚠️ WARNING: Proxy result:", json);
        }
    } catch (e) {
        console.error("❌ FAILURE: Upstox Proxy:", e.message);
    }

    // 2. Global Markets Proxy
    console.log("\n📡 Testing Global Market Proxy...");
    try {
        const res = await get("https://blogspro-upstox-stable.abhishek-dutta1996.workers.dev/global");

        const json = JSON.parse(res.data);
        if (json.status === "success") {
            console.log(`✅ SUCCESS: Global Proxy is LIVE. Fetched ${json.data.length} indices.`);
            json.data.forEach(d => console.log(`   - ${d.symbol}: ${d.price}`));
        } else {
            console.warn("⚠️ WARNING: Global Proxy:", json);
        }
    } catch (e) {
        console.error("❌ FAILURE: Global Proxy:", e.message);
    }

    // 3. Regulatory RSS
    console.log("\n📡 Testing Regulatory RSS Feeds...");
    const feeds = [
        { name: "RBI", url: "https://www.rbi.org.in/pressreleases_rss.xml" },
        { name: "SEBI", url: "https://www.sebi.gov.in/sebirss.xml" }
    ];
    for (const f of feeds) {
        try {
            const res = await get(f.url);
            if (res.status === 200) {
                console.log(`✅ SUCCESS: ${f.name} RSS is reachable.`);
            } else {
                console.warn(`⚠️ WARNING: ${f.name} returned ${res.status}`);
            }
        } catch (e) {
            console.error(`❌ FAILURE: ${f.name} RSS:`, e.message);
        }
    }

    console.log("\n🏁 Backend Test Completed.");
}

testBackend();
