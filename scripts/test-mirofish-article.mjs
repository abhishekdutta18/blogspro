/**
 * test-mirofish-article.js
 * =======================
 * Dedicated test for MiroFish integration within the Strategic Article pipeline.
 */

const { generateArticleJob } = require("./generation-worker.js");

const env = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.LLM_API_KEY,
    FIREBASE_PROJECT_ID: "blogspro-ai",
    BLOOMBERG_ASSETS: { put: async (k, c) => console.log(`📦 [R2] Mock Save: ${k}`) },
    KV: { get: async () => null, put: async () => null }
};

async function testArticleSwarm() {
    console.log("🧪 Testing MIROFISH Integration in Strategic Article (WEEKLY Tome)...");
    console.log("------------------------------------------------------------------");

    if (!env.GEMINI_API_KEY) {
        console.error("❌ ERROR: API Key missing. Run with GEMINI_API_KEY=... node scripts/test-mirofish-article.js");
        return;
    }

    try {
        const entry = await generateArticleJob("weekly", env);
        console.log("\n✅ Article Generation Complete!");
        console.log("Entry metadata:", JSON.stringify(entry, null, 2));
        console.log("\nVERIFICATION: check your console output above for the 'MIROFISH STRATEGIC OUTLOOK' section.");
    } catch (e) {
        console.error("❌ Article Test Failed:", e.message);
    }
}

testArticleSwarm();
