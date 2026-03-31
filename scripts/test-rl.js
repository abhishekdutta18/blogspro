import 'dotenv/config';
import { executeMultiAgentSwarm } from "./lib/swarm-orchestrator.js";
import fs from "fs";

/**
 * RL Verification Test: 1 Vertical (Macro)
 */
async function test() {
    console.log("💎 BLOGSPRO RL VERIFICATION START (2025-2026 Grounding)");
    const env = {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GROQ_KEY: process.env.GROQ_KEY,
        FIRESTORE_DB: "blogspro-swarm-4",
        EXTENDED_MODE: true, // Force RL loop to run if logic depends on it
        TEMPLATE_ENGINE: {
            fetch: async () => ({
                json: async () => ({ html: "<h1>Test Output</h1>", wordCount: 100 })
            })
        },
        MIRO_SYNC: {
            fetch: async () => ({})
        }
    };

    const mockData = {
        semanticDigest: { strategicLead: "Test Lead" },
        historicalData: { lfy: 2025 }
    };

    try {
        // Run a trial for a single vertical to verify RL loop
        // executeMultiAgentSwarm(frequency, semanticDigest, historicalData, type, env, jobId = null)
        const result = await executeMultiAgentSwarm("hourly", mockData.semanticDigest, mockData.historicalData, "article", env, "test-job");

        console.log("✅ RL Verification Pass Complete.");
        console.log("Final Report Preview:", result.raw.substring(0, 500));
        
        // Check for Tables/Charts in the output
        if (result.raw.includes('<table') || result.raw.includes('chart_')) {
            console.log("📊 SUCCESS: Institutional Data density confirmed.");
        } else {
            console.warn("⚠️ WARNING: Metadata missing in output. Check RL scores.");
        }

    } catch (err) {
        console.error("❌ RL Verification Failed:", err);
    }
}

test();
