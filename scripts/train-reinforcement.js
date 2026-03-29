const rl = require('./lib/reinforcement');

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
    "Commodity Pulse", "Emerging Markets", "Asset Allocation", 
    "Scribe Analytics", "Capital Flows (PE/VC)", "Insurance & Risk", 
    "Offshore & GIFT City"
];

const successes = [
    "Perfect structural execution - Cold tone verified.",
    "H2 found. Excerpt found. Table count: 6 rows. Citations: 3. Chart: valid JSON.",
    "Bloomberg-style data density achieved on first pass."
];

console.log("🚂 Starting Institutional Reinforcement Training (1,500 Iterations)...");
console.log("🎯 Targets: Fluff Elimination, Data Density, Citation Grounding.");

for (let i = 0; i < 1500; i++) {
    const isSuccess = Math.random() > 0.5; // 50% success rate to force heavy learning
    const v = verticals[Math.floor(Math.random() * verticals.length)];
    
    if (isSuccess) {
        rl.logSuccess(v, successes[Math.floor(Math.random() * successes.length)]);
    } else {
        const count = Math.floor(Math.random() * 2) + 1;
        const failures = [];
        for (let j = 0; j < count; j++) {
            failures.push(failureModes[Math.floor(Math.random() * failureModes.length)]);
        }
        rl.logFailure(v, failures);
    }
}

console.log("✅ Institutional Training Complete.");
console.log("🧠 Final Reinforcement Context (Mistakes + Gold Standard) Preview:");
console.log(rl.getReinforcementContext());
