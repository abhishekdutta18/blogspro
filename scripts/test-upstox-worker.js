const fetch = require("node-fetch");

async function testUpstoxWorker() {
    console.log("🚀 Testing Upstox Cloudflare Worker...");
    const url = "https://blogspro-upstox-stable.abhishekdutta18.workers.dev/quotes?symbols=NSE_INDEX%7CNifty%2050";
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.status === "success") {
            console.log("✅ Worker Success! Live data received.");
            console.log(JSON.stringify(data.data, null, 2));
        } else {
            console.error("❌ Worker returned error:", data);
        }
    } catch (err) {
        console.error("❌ Fetch failed:", err.message);
    }
}

testUpstoxWorker();
