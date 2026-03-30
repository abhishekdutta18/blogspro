/**
 * MiroFish Integration Test (Serverless Persona Swarm)
 * ===================================================
 * Validates that the serverless AI persona swarm correctly simulates 
 * institutional consensus and generates a high-fidelity forecast.
 * 
 * Run via: node scripts/test-mirofish.js
 */

const { generateMiroForecast } = require("./lib/mirofish-persona.js");

// Mock Environment (Can pull from your local process.env)
const env = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.LLM_API_KEY,
    FIREBASE_PROJECT_ID: "blogspro-ai"
};

const mockMarketContext = `
--- MARKET SESSIONS ---
IST: 2026-03-30T10:00:00.000Z | Main Session: LIVE (ASIAN)
--- ASSETS ---
NIFTY 50: 25420.50 (+0.82%) | SENSEX: 83210.15 (+0.75%) | DXY: 104.20 (-0.15%) | BTC: 72400 (+1.2%)
--- PULSE ---
FEAR & GREED: 72 (Greed) | High Impact: India GDP Quarterly, RBI MPC Minutes
--- NEWS ---
REUTERS | India Equity Inflows Hit Record USD 4B in March (URL: https://reuters.com) | 
WSJ | US Fed Signals Potential Pivot as Inflation Cools (URL: https://wsj.com)
`.trim();

async function runTest() {
    console.log("🛠️ Starting MiroFish Swarm Integration Test...");
    
    if (!env.GEMINI_API_KEY) {
        console.warn("⚠️ No API Key found in environment. Testing with fallback logic.");
    }

    try {
        const forecast = await generateMiroForecast(mockMarketContext, env);
        
        console.log("\n--- MIROFISH SWAM CONSENSUS FORECAST ---");
        console.log(forecast);
        console.log("----------------------------------------\n");

        if (forecast && !forecast.includes("decoupled")) {
            console.log("✅ MiroFish Integration Test: PASSED");
        } else {
            console.error("❌ MiroFish Integration Test: FAILED (Returned fallback/error)");
        }
    } catch (e) {
        console.error("❌ Test Execution Error:", e.message);
    }
}

runTest();
