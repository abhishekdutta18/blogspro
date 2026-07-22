import { executeSingleVerticalSwarm } from './lib/swarm-orchestrator.js';

const vertical = {
    id: "indian_markets_weekly",
    name: "Indian Markets Performance in the Next Week"
};

const frequency = "weekly";
const semanticDigest = { strategicLead: "Global macro is volatile, Asian markets are reacting." };
const historicalData = "Past week saw slight correction in Indian indices.";
const env = { ...process.env, DRY_RUN: '', GEMINI_ENABLED: false };

async function run() {
    try {
        console.log("Running executeSingleVerticalSwarm for Indian Markets...");
        const result = await executeSingleVerticalSwarm(vertical, 0, frequency, semanticDigest, historicalData, env, "test_job_123", true, "auto", "");
        console.log("\n\n====== FINAL MANUSCRIPT ======\n");
        console.log(result);
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
