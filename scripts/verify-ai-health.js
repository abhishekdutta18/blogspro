import { ResourceManager, askAI } from './lib/ai-service.js';
import { initNodeSentry, logSwarmPulse, flushSentry } from './lib/sentry-bridge.js';
import dotenv from 'dotenv';
dotenv.config();

/**
 * verify-ai-health.js (Phase 12)
 * ----------------------------
 * Rigorous handshake verification for the entire AI resource pool.
 * Does not hallucinate: performs direct network calls to each node.
 */
async function auditFleet() {
    console.log("🦾 [AI-Audit] Initiating Zero-Failure Fleet Verification...");
    
    // 1. Telemetry Init
    await initNodeSentry(process.env.SENTRY_DSN, 'fleet-audit');
    
    // 2. Resource Discovery
    ResourceManager.init(process.env);
    const nodes = ResourceManager.pool;
    console.log(`📡 [Discovery] Identified ${nodes.length} potential AI nodes.`);

    const report = [];

    for (const node of nodes) {
        const start = Date.now();
        console.log(`\n🔍 Checking Node: ${node.name} (${node.model})...`);
        
        try {
            // Institutional Handshake Prompt
            const handshake = await askAI("Institutional Audit Handshake: Respond with 'ALIGNED' and the current year.", {
                role: 'generic',
                model: node.model,
                env: process.env,
                node_preference: node.name // Force hit specific node
            });

            const latency = Date.now() - start;
            const status = handshake.includes('ALIGNED') ? 'HEALTHY' : 'MISALIGNED';
            
            console.log(`${status === 'HEALTHY' ? '✅' : '⚠️'} [${node.name}] Latency: ${latency}ms | Res: "${handshake.substring(0, 15)}..."`);
            
            report.push({ node: node.name, status, latency, model: node.model });
            
            await logSwarmPulse('info', `AI Node Health: ${node.name}`, { 
                latency, 
                status, 
                model: node.model 
            });

        } catch (err) {
            console.error(`❌ [${node.name}] Connection Failed: ${err.message}`);
            report.push({ node: node.name, status: 'UNREACHABLE', error: err.message });
        }
    }

    console.log("\n📑 --- FLEET HEALTH SUMMARY ---");
    console.table(report);
    
    await flushSentry();
    console.log("\n✅ Fleet audit complete. Results synchronized to Sentry.");
}

auditFleet().catch(console.error);
