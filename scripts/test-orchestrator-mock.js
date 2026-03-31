import { executeMultiAgentSwarm } from "./lib/swarm-orchestrator.js";

// Mock the AI service for logical verification
import * as aiModule from "./lib/ai-service.js";

async function verifyLogic() {
    console.log("🛠️  Logical Verification: BlogsPro Swarm 4.0 'Deep-Reflect' Protocol...");

    // Hijack askAI to log the role/model sequence
    const sequence = [];
    aiModule.askAI = async (prompt, options) => {
        sequence.push({ role: options.role, model: options.model });
        console.log(`📡 [Mock AI] Role: ${options.role.padEnd(10)} | Model: ${options.model}`);
        return `Mock result for ${options.role} (${options.model})`;
    };

    const mockEnv = {
        EXTENDED_MODE: true, // TRIGGER THE NEW LOOP
        TEMPLATE_ENGINE: {
            fetch: async (req) => {
                console.log("🎨 [Mock] Template Engine called.");
                return { 
                    json: async () => ({ 
                        html: "<html><body>Mock Extended Content</body></html>", 
                        wordCount: 1500 
                    }) 
                };
            }
        }
    };

    const semanticDigest = { marketContext: {}, strategicLead: "Verifying Logic" };
    const historicalData = {};

    try {
        await executeMultiAgentSwarm("weekly", semanticDigest, historicalData, "article", mockEnv, "logic-verify-id");
        
        console.log("\n✅ [Sequence Verification]");
        const hasCritic = sequence.some(s => s.role === 'edit' && s.model === 'claude-3.5-sonnet');
        const hasRefinement = sequence.some(s => s.role === 'generate' && s.model === 'claude-3.5-sonnet');
        
        console.log("Criticism Round firing?....", hasCritic ? "PASSED" : "FAILED");
        console.log("Refinement Round firing?....", hasRefinement ? "PASSED" : "FAILED");

        if (hasCritic && hasRefinement) {
            console.log("\n🚀 DEEP-REFLECT PROTOCOL LOGICALLY VERIFIED.");
        } else {
            console.error("\n❌ Logic Failure: Recursive loop missed.");
            process.exit(1);
        }

    } catch (e) {
        console.error("❌ Exception during verification:", e.message);
        process.exit(1);
    }
}

verifyLogic();
