import { ResourceManager, askAI } from "./lib/ai-service.js";
import dotenv from "dotenv";
dotenv.config();

/**
 * AI Pool Strength Verification (BlogsPro 9.0)
 * ===========================================
 * Bruteforce verification of every configured institutional AI node.
 */

async function testPool() {
    console.log("🦾 [BlogsPro-AI] Starting Institutional Resource Pool Verification...");
    
    // Initialize pool with current environment
    ResourceManager.init(process.env, true);
    
    if (ResourceManager.pool.length === 0) {
        console.error("❌ [AI-Pool] ERROR: No nodes found in pool. Verify .env keys.");
        process.exit(1);
    }

    console.log(`📊 [AI-Pool] Total nodes available: ${ResourceManager.pool.length}`);
    
    const results = [];
    for (const node of ResourceManager.pool) {
        console.log(`\n🔍 [Testing] Node: ${node.name} [Tier: ${node.tier}]...`);
        try {
            const start = Date.now();
            const res = await askAI("Institutional Handshake Test: Verify signal integrity. Output 'OK' if successful.", {
                role: 'utility',
                model: node.name,
                seed: 42,
                env: process.env
            });
            const latency = Date.now() - start;
            console.log(`✅ [Success] Node: ${node.name} | Latency: ${latency}ms | Response: ${res.substring(0, 20).trim()}`);
            results.push({ node: node.name, status: "HEALTHY", latency });
        } catch (e) {
            console.error(`❌ [Failure] Node: ${node.name} | Error: ${e.message}`);
            results.push({ node: node.name, status: "FAILED", error: e.message });
        }
    }

    console.log("\n" + "=".repeat(50));
    console.log("🏆 INSTITUTIONAL AI POOL SUMMARY");
    console.log("=".repeat(50));
    const healthy = results.filter(r => r.status === "HEALTHY");
    const failed = results.filter(r => r.status === "FAILED");
    
    console.log(`🟢 HEALTHY NODES: ${healthy.length}`);
    healthy.forEach(r => console.log(`   - ${r.node} (${r.latency}ms)`));
    
    console.log(`🔴 FAILED NODES: ${failed.length}`);
    failed.forEach(r => console.log(`   - ${r.node}: ${r.error}`));
    
    if (failed.length > 0) {
        console.log("\n⚠️  ADVISORY: Use 'ResourceManager.forcePoolHeal()' or re-run with forceRefresh if errors were transient.");
    }
    
    console.log("=".repeat(50));
}

testPool();
