import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { executeMultiAgentSwarm } from "./lib/swarm-orchestrator.js";
import { 
  getRecentSnapshots, 
  getHistoricalData, 
  pushTelemetryLog,
  pushMultipleToGitHub
} from "./lib/storage-bridge.js";
import { ResourceManager } from "./lib/ai-service.js";
import { initNodeSentry, flushSentry } from "./lib/sentry-bridge.js";

/**
 * [V1.0] Mass Migration Utility: The Cynical Reconstruction
 * --------------------------------------------------------
 * This script identifies all legacy manuscripts and re-executes 
 * the swarm to purge 'mirage' data and align history with the 
 * new high-fidelity "Bad Mood" persona.
 */

const FREQUENCIES = ['hourly', 'daily', 'weekly', 'monthly'];

async function migrateArchives() {
    const start = Date.now();
    const jobId = `migration-${Date.now()}`;
    
    console.log(`🚀 [Migration] Commencing The Cynical Reconstruction [Job: ${jobId}]`);
    
    // 1. Initialize Infrastructure
    initNodeSentry(process.env.SENTRY_DSN, 'migration');
    await ResourceManager.init(process.env);
    
    await pushTelemetryLog("MIGRATION_START", {
        jobId,
        status: "processing",
        message: "Commencing mass archive re-generation. purging mirage data."
    }, process.env);

    let migrationCount = 0;
    const historicalData = await getHistoricalData(process.env);

    for (const freq of FREQUENCIES) {
        const indexPath = path.join(process.cwd(), 'articles', freq, 'index.json');
        if (!fs.existsSync(indexPath)) continue;

        console.log(`📂 [Migration] Processing ${freq} index...`);
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

        for (const entry of index) {
            console.log(`🔄 [Migration] Re-generating: ${entry.title} (${entry.fileName})`);
            
            try {
                // We use a simplified context for migration to ensure speed
                const semanticDigest = {
                    strategicLead: `MIGRATION_CONTEXT: Re-generating legacy manuscript for [${freq}] period. 
                    Target Title: ${entry.title}
                    Historical Context: ${entry.excerpt}
                    Tone Requirement: AGGRESSIVELY CYNICAL / TRUTH-FIRST.`
                };

                const result = await executeMultiAgentSwarm(
                    freq,
                    semanticDigest,
                    historicalData,
                    'article',
                    process.env,
                    `${jobId}-${entry.fileName.split('.')[0]}`
                );

                if (result && result.final) {
                    const outPath = path.join(process.cwd(), 'articles', freq, entry.fileName);
                    fs.writeFileSync(outPath, result.final);
                    migrationCount++;
                    console.log(`✅ [Migration] Re-generation Successful: ${entry.fileName}`);
                }
            } catch (err) {
                console.error(`❌ [Migration] Failed to re-generate ${entry.fileName}:`, err.message);
            }
        }
    }

    // 2. Sovereign Push: Commit the entire reconstructed archive to GitHub
    if (migrationCount > 0 && process.env.GH_PAT) {
        console.log(`📡 [Migration] Reconstructed ${migrationCount} manuscripts. Initiating Sovereign Push...`);
        
        const filesToPush = [];
        for (const freq of FREQUENCIES) {
            const dir = path.join(process.cwd(), 'articles', freq);
            if (!fs.existsSync(dir)) continue;
            
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') || f === 'index.json');
            for (const f of files) {
                filesToPush.push({
                    path: `articles/${freq}/${f}`,
                    localPath: path.join(dir, f)
                });
            }
        }

        try {
            await pushMultipleToGitHub(
                filesToPush, 
                `institutional: post-migration archival purge [${jobId}]`,
                process.env.GH_OWNER || "abhishekdutta18",
                process.env.GH_REPO || "blogspro",
                process.env.GH_PAT
            );
            console.log(`✅ [Migration] Sovereign Registry Unified. Archives purged.`);
        } catch (e) {
            console.warn(`⚠️ [Migration] GitHub Push Failed:`, e.message);
        }
    }

    await pushTelemetryLog("MIGRATION_COMPLETE", {
        jobId,
        status: "success",
        migrationCount,
        latency: Date.now() - start,
        message: `Mass migration finalized. ${migrationCount} manuscripts reconstructed in 'Bad Mood' mode.`
    }, process.env);

    await flushSentry();
    console.log(`🏁 [Migration] Reconstruction Phase Complete. Total Re-generated: ${migrationCount}`);
}

migrateArchives();
