import { ResourceManager, askAI } from './lib/ai-service.js';

async function testAutonomousHealing() {
    console.log("🧪 [Test] Starting Autonomous Healing Verification (0-Failure Implementation)...");

    // 1. Manually Poison a Node (simulate a failure)
    console.log("🚫 Poisoning Node: Ollama-Local...");
    ResourceManager.failed.add('Ollama-Local');
    ResourceManager.failedAt.set('Ollama-Local', Date.now());
    console.log(`Pool State (Failures): ${Array.from(ResourceManager.failed)}`);

    // 2. Trigger a NEW Swarm Job ID
    console.log("\n🚀 Triggering fresh Institutional Swarm: jobId=swarm-healing-verification-1...");
    
    // We don't need to actually call a model, just trigger the revaluation gate
    await askAI("Trigger Prompt", { 
        jobId: 'swarm-healing-verification-1',
        role: 'utility',
        env: process.env 
    });

    // 3. Verify Healing
    console.log(`\nPost-Trigger Pool State: ${Array.from(ResourceManager.failed).length === 0 ? '✅ HEALED (Blacklist Cleaned)' : '❌ FAILED (Blacklist Persisted)'}`);
    
    if (ResourceManager.failed.size === 0) {
        console.log("✅ [Success] Autonomous Healing Loop verified.");
    } else {
        console.error("❌ [Failure] Recovery gate did not trigger.");
    }
}

testAutonomousHealing().catch(console.error);
