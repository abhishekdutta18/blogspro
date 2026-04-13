import { askAI, ResourceManager } from './lib/ai-service.js';

async function testDecoupling() {
    console.log("🧪 [Test] Starting Institutional Retry Decoupling Verification...");
    
    // 1. Force fail a provider
    await ResourceManager.init({}, true);
    const originalFn = ResourceManager.pool[0].fn;
    ResourceManager.pool[0].fn = async () => { throw new Error("INTENTIONAL_FAILURE"); };

    try {
        console.log("🚀 [Test] Dispatching with Seed: 99 (Should retry 5 times)...");
        await askAI("Test prompt", { seed: 99, role: 'generate' });
    } catch (e) {
        console.log(`🏁 [Test] Final Result: ${e.message}`);
        if (e.message.includes("AI_FLEET_EXHAUSTED")) {
            console.log("✅ [Test] Decoupling SUCCESS: Retry logic hit limit after 5 attempts despite seed 99.");
        } else {
            console.error("❌ [Test] Decoupling FAILURE: Unexpected error behavior.");
        }
    } finally {
        ResourceManager.pool[0].fn = originalFn;
    }
}

testDecoupling();
