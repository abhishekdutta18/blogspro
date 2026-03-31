import { persistLearning } from "./scripts/lib/swarm-orchestrator.js";
import fs from "fs";

async function verifyLearning() {
    console.log("🧪 VERIFYING LEARNING PERSISTENCE v4.3...");
    
    const mockAudit = {
        score: 45,
        status: "FAIL",
        reason: "Missing 2024 Historical Data Table (Debt-to-GDP override).",
        learning_note: "Agent consistently ignores historical grounding in the first pass.",
        guidance: "MANDATORY: Inject Debt-to-GDP 2024 table."
    };

    try {
        await persistLearning("Macro-Strategy-Verification", mockAudit, "FAILURE");
        
        const ledger = JSON.parse(fs.readFileSync("./knowledge/ai-feedback.json", 'utf8'));
        const lastEntry = ledger[ledger.length - 1];
        
        if (lastEntry.task === "Macro-Strategy-Verification" && lastEntry.score === 45) {
            console.log("✅ SUCCESS: Learning Persisted to [ai-feedback.json]");
            console.log("Entry Preview:", JSON.stringify(lastEntry, null, 2));
        } else {
            console.error("❌ FAILURE: Persistence data mismatch.");
        }
    } catch (e) {
        console.error("❌ ERROR during persistence test:", e.message);
    }
}

verifyLearning();
