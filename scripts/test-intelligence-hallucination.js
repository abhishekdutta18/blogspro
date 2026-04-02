/**
 * test-intelligence-hallucination.js
 * Verifies if the MiroFish QA service correctly flags stale dates (2023/2024).
 */
import { runSwarmAudit } from './lib/mirofish-qa-service.js';

const hallucinatedContent = `
<html>
  <body>
    <h2>Strategic Outlook: Q2 2023</h2>
    <p>Market data from November 2023 suggests a bullish pivot in onshore benchmarks.</p>
  </body>
</html>
`;

async function test() {
    console.log("🧪 Testing Intelligence Hallucination Detection (Stale 2023 Dates)...");
    
    try {
        const result = await runSwarmAudit(hallucinatedContent, "daily");
        console.warn("⚠️  RESULT: Audit PASSED (This is a BUG - the 2023 date was NOT flagged).");
    } catch (e) {
        if (e.message.includes("REJECT")) {
            console.log("✅ SUCCESS: Auditor correctly REJECTED stale content!");
        } else {
            console.error("❌ FAILURE: Unexpected error:", e.message);
        }
    }
}

test().catch(console.error);
