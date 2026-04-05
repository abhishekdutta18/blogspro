import dotenv from 'dotenv';
import { askAI, ResourceManager } from './scripts/lib/ai-service.js';

dotenv.config();

/**
 * 🛰️ Institutional Pre-flight Connectivity Check
 * Verifies the health of the AI fleet across all configured providers.
 */
async function runPreFlight() {
    console.log("🚀 Starting Swarm Pre-flight Connectivity Test...");
    console.log("==================================================");

    // 1. Initialize Pool
    const env = process.env;
    console.log(`🔍 [Check] Raw CEREBRAS_API_KEY length: ${env.CEREBRAS_API_KEY?.length || 0}`);
    console.log(`🔍 [Check] Raw CEREBRAS_API_KEY prefix: ${env.CEREBRAS_API_KEY?.substring(0, 5)}...`);
    console.log(`🔍 [Check] Raw OLLAMA_PROD_URL: ${env.OLLAMA_PROD_URL}`);
    ResourceManager.init(env);
    
    const activeNodes = ResourceManager.pool.map(p => p.name);
    console.log(`📡 Detected Nodes: ${activeNodes.join(', ')}`);
    console.log(`🛡️  Blacklisted Nodes: ${Array.from(ResourceManager.failed).join(', ') || 'None'}`);
    
    // 2. Test Cerebras (Tier 1 Priority)
    console.log("\n📡 Testing Tier 1: Cerebras...");
    try {
        const resp = await askAI("Hello. Respond with 'ACK: CEREBRAS_READY'.", { role: 'research', model: 'cerebras', env });
        console.log(`✅ Cerebras Response: ${resp.trim()}`);
    } catch (e) {
        console.error(`❌ Cerebras Failure: ${e.message}`);
    }

    // 3. Test Ollama Prod (Tier 2 Authenticated)
    const hasOllamaProd = ResourceManager.pool.some(p => p.name === 'Ollama-Prod');
    if (hasOllamaProd) {
        console.log("\n📡 Testing Tier 2: Ollama-Prod...");
        try {
            // Force mapping to llama3.1
            const resp = await askAI("Hello. Respond with 'ACK: OLLAMA_PROD_READY'.", { role: 'research', model: 'ollama-prod', env });
            console.log(`✅ Ollama-Prod Response: ${resp.trim()}`);
        } catch (e) {
            console.error(`❌ Ollama-Prod Failure: ${e.message}`);
        }
    }
    // 4. Test Cloudflare AI (Tier 2 Stable)
    const hasCloudflare = ResourceManager.pool.some(p => p.name === 'Cloudflare');
    if (hasCloudflare) {
        console.log("\n📡 Testing Tier 2: Cloudflare AI...");
        try {
            const resp = await askAI("Hello. Respond with 'ACK: CLOUDFLARE_READY'.", { role: 'research', model: 'cloudflare', env });
            console.log(`✅ Cloudflare Reponse: ${resp.trim()}`);
        } catch (e) {
            console.error(`❌ Cloudflare Failure: ${e.message}`);
        }
    }

    // 5. Test HuggingFace (Tier 2 Stable)
    const hasHF = ResourceManager.pool.some(p => p.name === 'HuggingFace');
    if (hasHF) {
        console.log("\n📡 Testing Tier 2: HuggingFace...");
        try {
            const resp = await askAI("Hello. Respond with 'ACK: HF_READY'.", { role: 'research', model: 'hf', env });
            console.log(`✅ HuggingFace Response: ${resp.trim()}`);
        } catch (e) {
            console.error(`❌ HuggingFace Failure: ${e.message}`);
        }
    }

    // 4. Summary
    console.log("\n==================================================");
    console.log("🏁 Pre-flight Diagnostic Complete.");
    process.exit(0);
}

runPreFlight();
