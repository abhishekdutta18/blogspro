/**
 * BlogsPro Swarm 4.6: Upstox Worker Test (ESM)
 * Validates real-time market data signals.
 */
async function testUpstoxWorker() {
    console.log("🚀 Testing Upstox Cloudflare Worker (Swarm 4.6)...");
    const url = "https://blogspro-upstox-stable.abhishek-dutta1996.workers.dev/quotes";

    
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const data = await res.json();
        
        if (data.status === "success") {
            console.log("✅ Worker Success! Live market context synchronization active.");
            const d = data.data;
            console.log(`📡 NIFTY SPOT: ${d["NSE_INDEX:Nifty 50"]?.last_price || "N/A"}`);
            console.log(`📡 BANK NIFTY: ${d["NSE_INDEX:Nifty Bank"]?.last_price || "N/A"}`);
        } else {
            console.error("❌ Worker returned error signal:", data);
        }
    } catch (err) {
        console.error("❌ Upstox Pulse Failure:", err.message);
    }
}

testUpstoxWorker();
