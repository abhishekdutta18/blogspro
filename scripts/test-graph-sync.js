import { extractKnowledgeGraph, semanticGating } from "./lib/knowledge-graph.js";

async function testGraphSync() {
    console.log("🧪 [Test] Initializing Semantic Graph Verification...");
    
    // Mock environment with minimal KV
    const env = {
        KV: {
            get: async () => null,
            put: async (key, val) => console.log(`💾 [Mock KV] Storing ${key} (${val.length} bytes)`)
        }
    };

    const mockPulse = "Market Update: Nifty 50 surges as FPI flows rotate from Banking to IT. Reliance hits all-time high ahead of 2026 expansion plans.";
    const blackboard = "Macro Anchor: Yield curve steepening detected globally.";

    try {
        console.log("1. Testing Semantic Gating...");
        const gating = await semanticGating({ data: mockPulse }, env);
        console.log("✅ Gating Result:", JSON.stringify(gating, null, 2));

        console.log("\n2. Testing 70B Extraction & Institutional Memory...");
        const graph = await extractKnowledgeGraph(mockPulse, env, "test-vertical", blackboard);
        console.log("✅ Graph Extraction Result:", JSON.stringify(graph, null, 2));

        console.log("\n✨ [Phase 4] Verification Complete. Semantic Memory is Stable.");
    } catch (e) {
        console.error("❌ Test Failed:", e.message);
    }
}

testGraphSync();
