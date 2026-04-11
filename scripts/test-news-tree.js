import 'dotenv/config';
import { NewsOrchestrator } from './scripts/lib/news-orchestrator.js';

async function test() {
    const orchestrator = new NewsOrchestrator(process.env);
    
    console.log("--- Testing Universal News (Tree Logic) ---");
    const universal = await orchestrator.fetchUniversalNews();
    console.log("Universal Result Excerpt:", universal.substring(0, 200) + "...");
    
    console.log("\n--- Testing Dynamic Vertical News (Balance Logic) ---");
    const dynamic = await orchestrator.fetchDynamicNews("Semiconductor manufacturing India 2026");
    console.log("Dynamic Result Excerpt:", dynamic.substring(0, 200) + "...");
}

test().catch(console.error);
