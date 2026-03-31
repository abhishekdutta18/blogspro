import { executeMultiAgentSwarm } from "./lib/swarm-orchestrator.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testExtendedSwarm() {
    console.log("🐝 [Test] Starting Deep-Reflect Prototype (Single Vertical)...");

    const mockEnv = {
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "blogspro-test",
        GROQ_API_KEY: process.env.GROQ_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        OPENROUTER_KEY: process.env.OPENROUTER_KEY,
        MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
        EXTENDED_MODE: true, // Force the recursive loop
        TEMPLATE_ENGINE: {
            fetch: async (req) => {
                console.log("🎨 [Mock] Template Engine called.");
                return { 
                    json: async () => ({ 
                        html: "<html><body>Mock Extended Content</body></html>", 
                        wordCount: 1500 
                    }) 
                };
            }
        }
    };

    const semanticDigest = {
        marketContext: { day: "Tuesday" },
        strategicLead: "Testing Extended High-Compute Logic"
    };

    const historicalData = { lastWeek: "Normal range" };

    try {
        // Run with only one vertical to save time/tokens but test the loop
        const result = await executeMultiAgentSwarm("weekly", semanticDigest, historicalData, "article", mockEnv, "test-extended-job");
        
        console.log("\n✅ [Test] Extended Swarm Complete.");
        console.log(`Word Count: ${result.wordCount}`);
        console.log("Job ID:", result.jobId);
        
        // Save raw output to verify length
        const outPath = path.join(__dirname, "..", "dist", "extended-test-raw.md");
        if (!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, result.raw);
        console.log(`💾 [Test] Raw markdown saved to: ${outPath}`);

    } catch (e) {
        console.error("❌ [Test] Swarm Failed:", e.message);
    }
}

testExtendedSwarm();
