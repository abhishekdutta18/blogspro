import 'dotenv/config';
import { institutionalSummaryFlow } from './genkit-pilot-flow.mjs';

/**
 * PRODUCTION HANDSHAKE (V1.0)
 * Goal: Send a live AI trace to Google Cloud Trace to activate the Genkit dashboard.
 */
async function triggerHandshake() {
    console.log("🏙️ [Handshake] Initiating Live Institutional Heartbeat (Vertex AI Edition)...");
    
    // 🚨 DISABLE DRY_RUN: This will consume a small amount of AI tokens.
    delete process.env.DRY_RUN;
    process.env.MAX_OUTPUT_TOKENS = '100';

    try {
        const result = await institutionalSummaryFlow({ vertical: 'Banking & Financial Services' });
        
        console.log("\n✅ [Handshake] Live execution successful!");
        console.log("📡 [Handshake] Telemetry payload dispatched to Google Cloud.");
        console.log("\n--- HEARTBEAT SIGNAL ---\n");
        console.log(result.substring(0, 500) + "...");
        console.log("\n-------------------------\n");
        
        console.log("⏱️  Wait 5-10 minutes, then refresh your Firebase Console.");
        process.exit(0);
    } catch (error) {
        console.error("❌ [Handshake] Handshake failed:", error.message);
        process.exit(1);
    }
}

triggerHandshake();
