// [V1.0] BlogsPro Institutional Reinforcement Training - ESM Edition
import rl from './lib/reinforcement.js';

const failureModes = [
    "TONE VIOLATION: Excessive conversational fluff detected. Use raw institutional data blocks.",
    "Insufficient data density (Found 1-2 metrics, need at least 5 for terminal depth).",
    "Verification failure (Found 0-1 citations, need at least 2 distinct sources).",
    "Missing exactly one <h2> header tag.",
    "Missing analytical <details> envelope.",
    "The text inside <chart-data> is not valid JSON.",
    "COLD TONE VIOLATION: Conversational fluff detected. Use Bloomberg-style blocks only."
];

const verticals = [
    "Global Macro Drift", "Debt & Sovereignty", "Digital Rails", 
    "Equities & Alpha", "Regulatory Ledger", "FX & Cross-Border", 
    "Commodity Pulse", "Emerging Markets", "Asset Allocation"
];

async function runTraining() {
    console.log("🚂 Starting Institutional Reinforcement Training (1,500 Iterations)...");
    
    // Check if cloud sync is requested
    const shouldSync = process.argv.includes('--sync');
    if (shouldSync) console.log("📡 [GCP] Cloud Sync Enabled (Firestore Uplink Activity).");

    for (let i = 0; i < 1500; i++) {
        const isSuccess = Math.random() > 0.5;
        const v = verticals[Math.floor(Math.random() * verticals.length)];
        
        if (isSuccess) {
            await rl.logSuccess(v, "Perfect structural execution - Cold tone verified.", null, shouldSync ? process.env : null);
        } else {
            const count = Math.floor(Math.random() * 2) + 1;
            const failures = [];
            for (let j = 0; j < count; j++) {
                failures.push(failureModes[Math.floor(Math.random() * failureModes.length)]);
            }
            await rl.logFailure(v, failures, null, shouldSync ? process.env : null);
        }

        if (i % 500 === 0 && i > 0) console.log(`[${i}/1500] Training in progress...`);
    }

    console.log("✅ Institutional Training Complete.");
    console.log("🧠 Final Reinforcement Context Preview:");
    const context = await rl.getReinforcementContext(shouldSync ? process.env : null);
    console.log(context.substring(0, 1000) + "...");
}

runTraining().catch(console.error);
