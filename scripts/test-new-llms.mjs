import 'dotenv/config';
import { askAI } from "./lib/ai-service.js";

async function verifyNewProviders() {
    console.log("🧪 Swarm 4.4: FINAL PROVIDER VERIFICATION...");
    
    // Testing specific models to force Dispatcher to select them
    // askAI(prompt, { role, model, env, seed })

    const testPrompt = "Institutional Continuity Test: Respond only with 'OK'.";

    const providers = [
        { name: "SambaNova", role: "generate", model: "samba/Meta-Llama-3.1-405B-Instruct" },
        { name: "Cerebras", role: "generate", model: "cerebras/llama3.1-8b" },
        { name: "Qweb", role: "generate", model: "qwen/qwen-2.5-72b-instruct" },
        { name: "HuggingFace", role: "generate", model: "hf/mistralai/Mistral-7B-Instruct-v0.3" },
        { name: "Ollama", role: "generate", model: "local/llama3" }
    ];

    for (const p of providers) {
        console.log(`\n🔍 Testing ${p.name} [Model: ${p.model}]...`);
        try {
            const start = Date.now();
            const res = await askAI(testPrompt, { 
                role: p.role, 
                model: p.model,
                seed: 42 // Deterministic for load balancer testing
            });
            const elapsed = Date.now() - start;
            console.log(`✅ ${p.name} Succeeded in ${elapsed}ms.`);
            console.log(`Response: ${res.substring(0, 100)}...`);
        } catch (e) {
            console.error(`❌ ${p.name} Failed: ${e.message}`);
            if (e.message.includes("missing")) {
                console.warn(`(Note: Key for ${p.name} not found in .env, skipping.)`);
            }
        }
    }
}

verifyNewProviders();
