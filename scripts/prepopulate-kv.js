import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * BlogsPro KV Prepopulator
 * Splits the massive ai-feedback.json into chunks and uploads to Cloudflare KV.
 * Run this locally via: node scripts/prepopulate-kv.js
 */

const LEDGER_PATH = path.resolve(__dirname, '../knowledge/ai-feedback.json');
const LEDGER_KEY = 'ai-feedback-ledger';
const BINDING = 'KV'; // Matches wrangler.toml

async function prepopulate() {
    console.log("📂 Reading local RL ledger...");
    if (!fs.existsSync(LEDGER_PATH)) {
        console.error("❌ ai-feedback.json not found in knowledge directory.");
        return;
    }

    const data = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    console.log(`✅ Loaded ${data.length} entries.`);

    // Keep only the most recent 1500 entries for KV optimization
    const trimmed = data.slice(-1500);
    const jsonStr = JSON.stringify(trimmed);

    console.log(`🚀 Prepopulating KV [${BINDING}] via Wrangler...`);
    
    try {
        // We use 'wrangler kv:key put' to upload the entire ledger as a single JSON blob
        // Note: For very large ledgers, we might need multiple keys, but 1500 entries is usually < 1MB limit.
        fs.writeFileSync('temp_ledger.json', jsonStr);
        
        // The correct syntax for V3 is 'kv key put' with --remote, environment flag, and preview override
        execSync(`npx wrangler kv key put --binding=${BINDING} --remote -e pulse --preview false "${LEDGER_KEY}" --path=temp_ledger.json`, { stdio: 'inherit' });
        
        console.log("✅ KV Ledger Prepopulated Successfully.");
    } catch (e) {
        console.error("❌ Prepopulation Failed. Ensure you are logged into Wrangler and the binding is correct.");
        console.error(e.message);
    } finally {
        if (fs.existsSync('temp_ledger.json')) fs.unlinkSync('temp_ledger.json');
    }
}

prepopulate();
