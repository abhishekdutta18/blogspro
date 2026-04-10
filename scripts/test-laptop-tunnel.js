import dotenv from "dotenv";
dotenv.config();

import { askAI, ResourceManager } from "./lib/ai-service.js";

/**
 * [V12.3] Hybrid Tunnel Diagnostic
 * -------------------------------
 * Verifies the connection between GHA and the local laptop (Gemma 4).
 */
async function testLaptopTunnel() {
    console.log("🏙️  Starting Hybrid Sovereign Tunnel Diagnostic...");
    
    // 1. Identify Tunnel Endpoint
    const tunnelUrl = process.env.OLLAMA_PROD_URL || process.env.NGROK_REMOTE_URL;
    if (!tunnelUrl) {
        console.error("❌ ERROR: OLLAMA_PROD_URL or NGROK_REMOTE_URL missing.");
        return;
    }
    console.log(`🔗 Detected Tunnel Endpoint: ${tunnelUrl}`);

    // 2. Initialize Resource Manager
    console.log("🔍 Initializing Resource Manager with Hybrid Support...");
    await ResourceManager.init();

    // 3. Dispatch Sovereign Handshake
    console.log("\n🚀 Dispatching handshake to Institutional Laptop (Gemma 4)...");
    try {
        const start = Date.now();
        const response = await askAI("Institutional Handshake: Verify Sovereign Tunnel State.", {
            role: 'repair',
            model: 'laptop', // Forces the tunnel node
            jobId: 'diagnostic-laptop'
        });
        const latency = Date.now() - start;

        console.log("\n🏙️  SOVEREIGN RESPONSE RECEIVED:");
        console.log("----------------------------");
        console.log(response);
        console.log("----------------------------");
        console.log(`✅ DIAGNOSTIC COMPLETE: Laptop Tunnel is Operational (Latency: ${latency}ms).`);
    } catch (err) {
        console.error("\n❌ TUNNEL FAILURE:", err.message);
        console.log("\nTROUBLESHOOTING:");
        console.log("1. Ensure 'ollama-prod' tunnel is running on the laptop (ngrok).");
        console.log("2. Ensure Gemma 4 is installed and running ('ollama run gemma4:e4b').");
        console.log("3. Verify OLLAMA_PROD_KEY matches the tunnel's basic auth/Access config.");
    }
}

testLaptopTunnel().catch(console.error);
