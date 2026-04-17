import 'dotenv/config';
import { askAI } from './lib/ai-service.js';

async function testGhostResilience() {
    console.log("🧪 [Test] Commencing Swarm Resilience Stress Test...");
    console.log("🧪 [Test] Scenario: Total Cluster Collapse (All providers unreachable)");

    const prompt = "GENERATE A STRATEGIC INSTITUTIONAL REPORT ON GLOBAL LIQUIDITY FOR 2026-2027.";
    
    try {
        console.log("🚀 Dispatching request to Swarm...");
        // Forcing exhaustion by passing 9 fleet retries (10 is the limit)
        // and using a non-existent bridge
        const result = await askAI(prompt, { 
            role: 'research', 
            model: 'non-existent-model',
            _fleetRetries: 9, 
            env: { 
                ...process.env, 
                SWARM_AI_BRIDGE: 'https://broken-bridge.workers.dev',
                VAULT_MASTER_KEY: 'invalid-key'
            } 
        });

        console.log("\n--- SWARM RESPONSE START ---");
        console.log(result);
        console.log("--- SWARM RESPONSE END ---\n");

        if (result.includes('ghost-metadata')) {
            console.log("✅ [SUCCESS] Ghost Simulation Fallback Triggered and Succeeded.");
        } else {
            console.error("❌ [FAILURE] Ghost Simulation did not trigger or failed.");
        }
    } catch (err) {
        console.error("❌ [CRITICAL] Pipeline broke instead of falling back:", err.message);
    }
}

testGhostResilience();
