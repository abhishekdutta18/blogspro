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
    const nodesToTest = ['Gemini-Pro', 'Groq', 'Cerebras-70B'];

    for (const role of testRoles) {
        console.log(`\n--- Auditing Role: ${role} ---`);
        const result = ResourceManager.getAvailable(0, `node-${role}`);
        if (result && nodesToTest.includes(result.name)) {
            console.log(`✅ [Strategy] Balancer correctly prioritized Cloud-First node: ${result.name}`);
        } else {
            console.warn(`⚠️ [Strategy] Balancer picked non-optimal node for ${role}: ${result?.name || 'NONE'}`);
        }
    }

    console.log("\n📡 [CONNECTIVITY] Testing Gemini-Pro...");
    try {
        const geminiResponse = await askAI("Respond with 'GEMINI_OK'", { role: 'research', model: 'gemini-pro' });
        console.log(`✅ Gemini Response: ${geminiResponse}`);
    } catch (e) {
        console.error(`❌ Gemini Failed: ${e.message}`);
    }

    console.log("\n📡 [CONNECTIVITY] Testing Groq...");
    try {
        const groqResponse = await askAI("Respond with 'GROQ_OK'", { role: 'draft', model: 'groq' });
        console.log(`✅ Groq Response: ${groqResponse}`);
    } catch (e) {
        console.error(`❌ Groq Failed: ${e.message}`);
    }
}

auditBalancer();
