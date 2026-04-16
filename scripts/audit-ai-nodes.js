import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// 🛡️ INSTITUTIONAL PATH RESOLUTION
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(rootDir, '.env') });

// Dynamically import ai-service from the lib folder relative to this script
const aiServicePath = path.resolve(__dirname, 'lib/ai-service.js');
const { ResourceManager, askAI } = await import(`file://${aiServicePath}`);

async function auditBalancer() {
    console.log("🔍 [AUDIT] Initializing BlogsPro Institutional AI Balancer...");
    await ResourceManager.init();

    const testRoles = ['research', 'edit', 'draft', 'generate'];
    const nodesToTest = ['SambaNova-405B', 'Groq', 'Cerebras-70B'];

    for (const role of testRoles) {
        console.log(`\n--- Auditing Role: ${role} ---`);
        const result = ResourceManager.getAvailable(0, `node-${role}`);
        if (result && nodesToTest.some(n => result.name.includes(n))) {
            console.log(`✅ [Strategy] Balancer correctly prioritized Cloud-First node: ${result.name}`);
        } else {
            console.warn(`⚠️ [Strategy] Balancer picked non-optimal node for ${role}: ${result?.name || 'NONE'}`);
        }
    }

    console.log("\n📡 [CONNECTIVITY] Testing SambaNova-405B...");
    try {
        const sambaResponse = await askAI("Respond with 'SAMBANOVA_OK'", { role: 'research', model: 'llama-3.1-405b' });
        console.log(`✅ SambaNova Response: ${sambaResponse}`);
    } catch (e) {
        console.error(`❌ SambaNova Failed: ${e.message}`);
    }

    console.log("\n📡 [CONNECTIVITY] Testing Cerebras-70B...");
    try {
        const cerebrasResponse = await askAI("Respond with 'CEREBRAS_OK'", { role: 'draft', model: 'llama-3.1-70b' });
        console.log(`✅ Cerebras Response: ${cerebrasResponse}`);
    } catch (e) {
        console.error(`❌ Cerebras Failed: ${e.message}`);
    }
}

auditBalancer();
