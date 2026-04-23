import { ResourceManager, askAI } from './lib/ai-service.js';
import dotenv from 'dotenv';
dotenv.config();

/**
 * test-sovereign-ai.js (V1.0)
 * ----------------------------
 * Consolidated AI diagnostic script to verify Vertex AI, Groq, 
 * and SambaNova integrations for the new GCP environment.
 */
async function runDiagnostic() {
    console.log("🛰️  BlogsPro Sovereign AI Diagnostic [GCP Transition Edition]");
    console.log("----------------------------------------------------------");

    // 1. Initialize Fleet
    await ResourceManager.init(process.env);
    const nodes = ResourceManager.pool;
    console.log(`📡 Identified ${nodes.length} active nodes in the balancer pool.\n`);

    const results = [];

    for (const node of nodes) {
        console.log(`🔍 Testing Node: ${node.name}...`);
        const start = Date.now();

        try {
            const response = await askAI("Institutional Audit: Respond with 'ALIGNED' and your model identity.", {
                role: 'research',
                model: (node.name.includes('Vertex') ? 'vertex/pro' : node.name),
                jobId: 'diagnostic-audit'
            });
            
            const latency = Date.now() - start;
            const isHealthy = response.includes('ALIGNED');
            
            console.log(`${isHealthy ? '✅' : '⚠️'} [${node.name}] Latency: ${latency}ms | Response: ${response.substring(0, 30)}...`);
            results.push({ Provider: node.name, Status: "HEALTHY", Latency: `${latency}ms` });
        } catch (e) {
            console.error(`❌ [${node.name}] FAILED: ${e.message}`);
            results.push({ Provider: node.name, Status: "FAILED", Error: e.message.substring(0, 50) });
        }
    }

    console.log("\n📊 FLEET DIAGNOSTIC SUMMARY");
    console.table(results);

    if (results.some(r => r.Provider.includes('Vertex') && r.Status === 'FAILED')) {
        console.log("\n⚠️  WARNING: Vertex AI failed. Ensure Google Cloud SDK is authenticated locally if testing outside GKE.");
    }
}

runDiagnostic().catch(console.error);
