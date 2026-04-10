import dotenv from "dotenv";
dotenv.config();

import { askAI, ResourceManager } from "./lib/ai-service.js";

async function testAIBridge() {
    console.log("🛰️  Starting Institutional AI Bridge Diagnostic...");
    
    // 1. Validate Environment
    const masterKey = process.env.VAULT_MASTER_KEY;
    if (!masterKey) {
        console.error("❌ ERROR: VAULT_MASTER_KEY missing from .env. Bridge cannot authenticate.");
        return;
    }
    console.log("✅ VAULT_MASTER_KEY detected.");

    // 2. Initialize Resource Manager
    console.log("🔍 Initializing Resource Manager...");
    await ResourceManager.init();

    // 3. Adaptive Bridge Probing (V12.2)
    console.log("\n📡 Testing Adaptive Infrastructure Probing...");
    const bridgeUrl = process.env.SWARM_AI_BRIDGE || "https://blogspro-pulse.abhishekdutta18.workers.dev/ai-gateway";
    console.log(`🔗 Target: ${bridgeUrl}`);

    try {
        const probeStart = Date.now();
        const response = await askAI("Institutional Handshake: Verify Bridge State.", {
            role: 'research',
            model: 'groq/bridge-test', 
            jobId: 'diagnostic-probe'
        });
        const latency = Date.now() - probeStart;

        console.log(`✅ [ADAPTIVE_PROBE] Success. Latency: ${latency}ms`);
        console.log("----------------------------");
        console.log(response);
        console.log("----------------------------");
    } catch (err) {
        console.error("\n❌ PROBE FAILURE:", err.message);
        console.log("\nREENGINEERING ADVICE:");
        console.log("1. Ensure 'blogspro-pulse' worker is deployed.");
        console.log("2. Verify VAULT_MASTER_KEY matches the Pulse strategic vault.");
    }
}

testAIBridge().catch(console.error);
