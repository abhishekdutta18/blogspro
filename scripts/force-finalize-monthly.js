import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { 
    loadSectorFragments, 
    finalizeManuscript, 
    publishGitHubTrace,
    askAIWithEscalation,
    saveSectorFragment
} from "./lib/swarm-orchestrator.js";
import { 
    getInstitutionalSettings,
    pushTelemetryLog,
    updateIndex,
    syncToFirestore
} from "./lib/storage-bridge.js";
import { askAI } from "./lib/ai-service.js";

async function forceFinalize(jobId, frequency = 'monthly') {
    console.log(`🚀 [Force-Finalize] Initiating emergency recovery for Job: ${jobId}`);
    
    const env = process.env;
    const settings = await getInstitutionalSettings(env);
    env.GEMINI_ENABLED = settings.geminiEnabled;

    // 1. Recover existing fragments
    const fragments = await loadSectorFragments(jobId, env);
    console.log(`📂 [Recovery] Found ${fragments.length} valid fragments.`);

    const verticalIds = ["macro", "equities", "debt", "fx", "crypto", "commodities", "alpha", "scribe"];
    const missing = verticalIds.filter(v => !fragments.find(f => f.verticalId === v));

    if (missing.length > 0) {
        console.log(`🚨 [Recovery] Missing verticals: ${missing.join(', ')}. Attempting high-fidelity repair...`);
        
        for (const vertical of missing) {
            try {
                console.log(`🧬 [Repair] Re-generating ${vertical}...`);
                const content = await askAIWithEscalation(`Generate a deep-research strategic report for the ${vertical} vertical. Year: 2026. Focus: Institutional Macro.`, {
                    role: 'research',
                    env,
                    frequency: 'monthly'
                });
                
                await saveSectorFragment(jobId, vertical, content, env);

                fragments.push({
                    verticalId: vertical,
                    content,
                    jobId,
                    timestamp: new Date().toISOString()
                });
                console.log(`✅ [Repair] Successfully recovered and persisted ${vertical}.`);
            } catch (e) {
                console.error(`❌ [Repair] Failed to recover ${vertical}: ${e.message}`);
            }
        }
    }

    // 2. Finalize Manuscript
    console.log(`🏗️ [Finalization] Assembling final ${frequency} tome...`);
    // [V12.3] Signature: finalizeManuscript(fragments, consensusSummary, frequency, type, env, id)
    const finalReport = await finalizeManuscript(fragments, `Strategic Recovery for Intelligence Batch ${jobId}`, frequency, 'article', env, jobId);
    
    if (finalReport) {
        // 3. Dual-Sync (Firestore Articles + Static Index)
        const entry = {
            id: jobId,
            title: finalReport.title || `${frequency.toUpperCase()} Strategic Pulse`,
            excerpt: finalReport.excerpt || "Institutional strategic research and quantitative analysis.",
            timestamp: new Date().toISOString(),
            frequency,
            url: `manuscripts/${jobId}.html`,
            pdfUrl: `manuscripts/${jobId}.pdf`,
            type: 'article',
            wordCount: finalReport.wordCount
        };

        console.log(`🗂️ [Dual-Sync] Updating Static Index & Firestore Articles...`);
        await Promise.all([
            updateIndex(entry, frequency, env),
            syncToFirestore("articles", entry, env)
        ]);

        // 4. Publish Trace
        try {
            await publishGitHubTrace(jobId, `Swarm Recovery Successful. Segments recovered: ${fragments.length}.`, env);
        } catch (e) {
            console.warn(`⚠️ [Trace] GitHub sync failed: ${e.message}`);
        }
        
        await pushTelemetryLog("SWARM_RECOVERY_COMPLETE", {
            jobId,
            status: "success",
            recoveredCount: fragments.length
        }, env);
    } else {
        console.error(`❌ [Failure] Assembly failed despite recovery attempts.`);
    }
}

const targetJobId = process.argv[2];
if (!targetJobId) {
    console.error("Usage: node scripts/force-finalize-monthly.js <jobId>");
    process.exit(1);
}

forceFinalize(targetJobId).catch(err => {
    console.error(`🚨 Fatal Recovery Error:`, err.message);
    process.exit(1);
});
