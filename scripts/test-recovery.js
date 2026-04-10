import { ResourceManager, askAI } from './lib/ai-service.js';

async function testRecovery() {
    console.log("🧪 [Test] Starting Autonomous Recovery Verification...");
    
    // 1. Manually add a failure to simulate a blacklisted node
    ResourceManager.failed.add('Cerebras-70B-Versatile');
    ResourceManager.failedAt.set('Cerebras-70B-Versatile', Date.now());
    console.log(`Current Failures: ${Array.from(ResourceManager.failed)}`);

    // 2. Trigger askAI with a NEW swarm Job ID
    console.log("\n🚀 Triggering askAI with Job ID: swarm-test-123...");
    await askAI("Verification Prompt", { 
        jobId: 'swarm-test-123',
        role: 'utility',
        env: process.env 
    });

    // 3. Verify blacklist is cleared
    console.log(`Post-Trigger Failures: ${Array.from(ResourceManager.failed)}`);
    if (ResourceManager.failed.size === 0) {
        console.log("✅ [SUCCESS] Blacklist autonomously cleared for new swarm run.");
    } else {
        console.error("❌ [FAILURE] Blacklist persisted.");
    }
}

testRecovery().catch(console.error);
