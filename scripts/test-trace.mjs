import dotenv from "dotenv";
dotenv.config();

import { pushSovereignTrace } from "./lib/storage-bridge.js";

/**
 * [V12.3] Sovereign Trace Diagnostic
 * --------------------------------
 * Verifies that research breadcrumbs are correctly reaching Firestore.
 */
async function testTrace() {
    console.log("🏙️  Starting Sovereign Trace Diagnostic...");
    
    const env = process.env;
    const testJobId = `trace-test-${Date.now()}`;
    
    if (!env.FIREBASE_PROJECT_ID) {
        console.error("❌ ERROR: FIREBASE_PROJECT_ID missing.");
        return;
    }

    console.log(`📡 Targeting Firestore Project: ${env.FIREBASE_PROJECT_ID}`);
    console.log(`🆔 Test Job ID: ${testJobId}`);

    // 1. Dispatch Handshake Trace
    console.log("\n🚀 Dispatching handshake trace...");
    try {
        await pushSovereignTrace("DIAGNOSTIC_START", {
            jobId: testJobId,
            frequency: "diagnostic",
            status: "processing",
            message: "Sovereign Trace Handshake Initialized."
        }, env);
        
        // 2. Dispatch Mock interaction
        console.log("🚀 Dispatching mock interaction breadcrumb...");
        await pushSovereignTrace("AI_INTERACTION", {
            jobId: testJobId,
            frequency: "diagnostic",
            status: "success",
            latency: 1250,
            role: "research",
            model: "diagnostic-node",
            message: "Mock research Chapter complete."
        }, env);

        // 3. Dispatch Completion
        console.log("🚀 Dispatching completion trace...");
        await pushSovereignTrace("DIAGNOSTIC_COMPLETE", {
            jobId: testJobId,
            frequency: "diagnostic",
            status: "success",
            message: "Institutional Trace Path Functional."
        }, env);

        console.log("\n✅ DIAGNOSTIC COMPLETE: Trace engine is Operational.");
        console.log(`🔗 Verify in Firebase Console: https://console.firebase.google.com/u/0/project/${env.FIREBASE_PROJECT_ID}/firestore/data/~2Ftelemetry_logs`);
    } catch (err) {
        console.error("\n❌ TRACE FAILURE:", err.message);
        console.log("\nTROUBLESHOOTING:");
        console.log("1. Verify FIREBASE_SERVICE_ACCOUNT is correctly provisioned.");
        console.log("2. Ensure 'telemetry_logs' collection exists (or allow auto-creation).");
        console.log("3. Check network access to firestore.googleapis.com.");
    }
}

testTrace().catch(console.error);
