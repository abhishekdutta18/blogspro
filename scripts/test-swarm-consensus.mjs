import { executeMultiAgentSwarm } from './lib/swarm-orchestrator.js';

async function runTest() {
    console.log("🚀 [Test] Starting MiroFish Consensus Smoke Test...");
    
    // 1. Mock Environment
    const env = {
        GROQ_API_KEY: process.env.GROQ_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        CLAUDE_API_KEY: process.env.CLAUDE_API_KEY, // if available
        
        // Mock MiroSync Durable Object push
        MIRO_SYNC: {
            fetch: async (url, options) => {
                const body = JSON.parse(options.body);
                console.log(`📡 [Mock Affine] Pushed: ${body.source} - Length: ${body.content.length}`);
                return new Response(JSON.stringify({ success: true }));
            }
        },
        
        // Mock Template Engine
        TEMPLATE_ENGINE: {
            fetch: async (req) => {
                const body = await req.json();
                console.log(`🎨 [Mock Templates] Received content for: ${body.title}`);
                return new Response(JSON.stringify({ 
                    html: `<html><body>${body.content}</body></html>`, 
                    wordCount: body.content.split(' ').length 
                }));
            }
        },

        // Mock Analytics
        ANALYTICS: {
            writeDataPoint: (data) => console.log(`🛰 [Mock Analytics] Data Point:`, data)
        }
    };

    // 2. Mock Semantic Digest
    const semanticDigest = {
        strategicLead: "Test Strategic Convergence Analysis.",
        marketContext: { day: "Tuesday" },
        megaPool: { hourly: { signals: ["Consensus Test Signal 01"] } }
    };

    const historicalData = { baseline: "Baseline 2026" };

    try {
        // Run a 'briefing' type for speed (single vertical consolidation)
        console.log("🔍 [Test] Executing Swarm (Type: briefing)...");
        const result = await executeMultiAgentSwarm('hourly', semanticDigest, historicalData, 'briefing', env, 'test-job-001');

        console.log("\n✅ [Test] Swarm Result Summary:");
        console.log(`- Job ID: ${result.jobId}`);
        console.log(`- Word Count: ${result.wordCount}`);
        
        // Check for Consensus and Governor markers
        const hasConsensus = result.raw.includes("SWARM CONSENSUS");
        console.log(`- Includes Consensus Block: ${hasConsensus ? '✅ Yes' : '❌ No'}`);

        if (result.final.includes('FIDELITY_ERROR')) {
            console.error("❌ [Test] Fidelity Governor flagged a critical error.");
        } else {
            console.log("✅ [Test] Fidelity Governor passed.");
        }

    } catch (e) {
        console.error("❌ [Test] Swarm Execution Failed:", e.message);
    }
}

runTest();
