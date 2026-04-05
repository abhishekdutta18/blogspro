import { executeMultiAgentSwarm } from "./lib/swarm-orchestrator.js";
import { runSwarmAudit } from "./lib/mirofish-qa-service.js";
import { ResourceManager } from "./lib/ai-service.js";
import { pushTelemetryLog } from "./lib/firebase-service.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * dry-run-institutional.js (V5.4.6)
 * -------------------------------
 * Standalone verification utility for the BlogsPro Institutional Swarm.
 * Tests: 
 * 1. AI Resource Pool (Cerebras/SambaNova/Gemini/Ollama)
 * 2. Multi-Agent Orchestration (Macro -> Sector Anchor)
 * 3. High-Fidelity QA Swarm Audit (Pass/Reject)
 * 4. Firebase Telemetry Heartbeat
 */

async function runVerification() {
    console.log("🚀 [DRY-RUN] Starting Institutional Swarm Verification...");
    
    // 0. AI POOL CHECK
    console.log("🔍 Checking AI Node Pool...");
    await ResourceManager.init(process.env);
    const activeNodes = ResourceManager.pool.length - ResourceManager.failed.size;
    console.log(`✅ [Pool] ${activeNodes} active nodes detected (Cerebras, Gemini, Samba, Ollama).`);

    if (activeNodes < 2) {
        console.warn("⚠️ [Warning] AI pool is critically low. High-fidelity swarm might stall.");
    }

    // 1. MINI-SWARM SIMULATION
    console.log("🤖 Initiating Mini-Swarm (Vertical: EM Alpha)...");
    const mockDigest = { strategicLead: "GIFT City offshore arbitrage expansion vs onshore Nifty Midcap rotation." };
    const historical = { baseline: "2025 LFY indices showing 12% consolidation." };

    try {
        // Run a small subset (or just a consolidator pulse)
        const result = await executeMultiAgentSwarm('weekly', mockDigest, historical, 'pulse', process.env, "dry-run-123");
        
        const wc = result.wordCount || 0;
        console.log(`✅ [Orchestrator] Pulse successfully generated. Word Count: ${wc}`);

        if (wc < 100) {
            throw new Error(`Word count threshold failure: ${wc} words is insufficient for institutional grade.`);
        }

        // 2. HIGH-FIDELITY QA AUDIT
        console.log("🕵️  Engaging High-Fidelity Swarm Auditor...");
        const auditedContent = await runSwarmAudit(result.final, 'weekly');
        console.log("✅ [QA-Swarm] Manuscript APPROVED by institutional audit board.");

        // 3. FIREBASE HEARTBEAT
        console.log("🔥 Dispatching Firebase Telemetry Heartbeat...");
        await pushTelemetryLog("DRY_RUN_SUCCESS", {
            timestamp: new Date().toISOString(),
            nodes: activeNodes,
            wordCount: wc,
            id: "dry-run-123"
        });
        console.log("✅ [Firebase] Telemetry synced.");

        console.log("\n🎊 [SUCCESS] Phase 2 Institutional Hardening Validated.");
        process.exit(0);

    } catch (err) {
        console.error(`❌ [FAILURE] Institutional Dry-Run Failed: ${err.message}`);
        
        await pushTelemetryLog("DRY_RUN_FAILURE", {
            error: err.message,
            timestamp: new Date().toISOString()
        });
        
        process.exit(1);
    }
}

runVerification();
