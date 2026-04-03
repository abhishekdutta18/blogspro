import dotenv from 'dotenv';
dotenv.config();
import { fetch } from 'undici'; // Use node built-in or undici if native is unavailable in Node 18
import { executeMultiAgentSwarm } from "./lib/swarm-orchestrator.js";
import { getRecentSnapshots, getHistoricalData, saveBriefing, updateIndex, syncToFirestore, pushTelemetryLog } from "./lib/storage-bridge.js";
import fs from 'fs';
import path from 'path';

/**
 * BlogsPro Briefing Proxy (GHA Runner Implementation)
 * ==================================================
 * This script allows orchestrateSwarm logic to run locally on GitHub Actions
 * without requiring a Cloudflare Worker deployment.
 */
async function runBriefingProxy() {
    const frequency = process.argv.find(a => a.startsWith('--freq='))?.split('=')[1] || 'daily';
    const type = 'briefing';
    const id = `swarm-${frequency}-${Date.now()}`;
    const env = process.env;

    console.log(`🚀 [Proxy] Initializing ${frequency.toUpperCase()} Briefing Swarm [ID: ${id}]`);
    
    // 0. INITIALIZE TRACE
    await pushTelemetryLog("BRIEFING_START", { frequency, jobId: id, status: "processing" }, env);

    try {
        // 1. DATA TIER: Context Retrieval
        const snapshots = await getRecentSnapshots(frequency, 1, env);
        const historical = await getHistoricalData(env);
        const semanticDigest = snapshots[0] || { strategicLead: "Institutional Macro Briefing Initiative." };

        // 2. REASONING TIER: Execute Swarm
        const swarmResult = await executeMultiAgentSwarm(frequency, semanticDigest, historical, type, env, id);

        // 3. DISTRIBUTION TIER: Local Archival (for Commit & Push)
        const fileName = `swarm-${frequency}-${Date.now()}.html`;
        
        // Mock saveBriefing to write to briefings/ folder for GHA persistence
        const briefingsDir = `./briefings/${frequency}`;
        if (!fs.existsSync(briefingsDir)) fs.mkdirSync(briefingsDir, { recursive: true });
        
        fs.writeFileSync(path.join(briefingsDir, fileName), swarmResult.final);
        console.log(`💾 [Proxy] Archive Success: briefings/${frequency}/${fileName}`);

        // 4. SYNC TIER: Firestore & Index
        const entry = { 
            id: Date.now(), 
            title: `${frequency.toUpperCase()} Swarm - ${new Date().toLocaleDateString()}`, 
            date: new Date().toISOString(), 
            file: fileName, 
            frequency, 
            sentiment: 50
        };
        await syncToFirestore("pulse_briefings", entry, env);
        
        console.log(`🏁 [Proxy] Cycle Complete: ${frequency}`);
        await pushTelemetryLog("BRIEFING_COMPLETE", { frequency, jobId: id, status: "success", message: `Briefing Finalized: ${fileName}` }, env);
    } catch (e) {
        console.error(`❌ [Proxy] Critical Failure:`, e.message);
        await pushTelemetryLog("BRIEFING_ERROR", { frequency, jobId: id, status: "error", message: e.message }, env);
        process.exit(1);
    }
}

runBriefingProxy();
