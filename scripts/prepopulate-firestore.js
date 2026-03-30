const fs = require('fs');
const path = require('path');

/**
 * BlogsPro Firestore Prepopulator
 * Migrates local ai-feedback.json history to Google Firestore.
 * 
 * Usage: 
 * 1. Ensure FIREBASE_PROJECT_ID is in your environment or wrangler.toml
 * 2. Run: node scripts/prepopulate-firestore.js
 */

const LEDGER_PATH = path.resolve(__dirname, '../knowledge/ai-feedback.json');
const COLLECTION = 'ai_reinforcement_ledger';
const PROJECT_ID = 'blogspro-ai'; // Fallback

async function syncEntry(entry) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}`;
    
    const fields = {
        type: { stringValue: entry.type },
        timestamp: { timestampValue: entry.timestamp },
        task: { stringValue: entry.task },
        pattern: { stringValue: entry.pattern || "" },
        preview: { stringValue: entry.preview ? entry.preview.substring(0, 1000) : "" }
    };

    if (entry.failures && Array.isArray(entry.failures)) {
        fields.failures = { arrayValue: { values: entry.failures.map(f => ({ stringValue: f })) } };
    }

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields })
    });
    return res.ok;
}

async function prepopulate() {
    console.log("📂 Reading local RL ledger...");
    if (!fs.existsSync(LEDGER_PATH)) {
        console.error("❌ ai-feedback.json not found.");
        return;
    }

    const data = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    console.log(`✅ Loaded ${data.length} entries.`);

    // To respect Firestore free-tier limits, we only migrate the last 300 entries
    const batch = data.slice(-300);
    console.log(`🚀 Migrating last 300 entries to Firestore [${PROJECT_ID}]...`);

    let success = 0;
    for (const entry of batch) {
        const ok = await syncEntry(entry);
        if (ok) success++;
        if (success % 50 === 0) console.log(`--- Synced ${success} entries...`);
    }

    console.log(`\n✨ Prepopulation Complete: ${success}/${batch.length} entries synced to Firestore.`);
    console.log(`🔗 View here: https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data/~2F${COLLECTION}`);
}

prepopulate();
