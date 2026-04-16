import dotenv from 'dotenv';
import { pushMultipleToGitHub } from './lib/storage-bridge.js';
import fs from 'fs';
import path from 'path';

dotenv.config();

async function historicalSync() {
    console.log("🏺 [Historical-Sync] Initiating Batch Repository Realignment...");
    
    const token = process.env.GH_TOKEN || process.env.GH_PAT;
    const owner = process.env.GH_OWNER || "abhishekdutta18";
    const repo = process.env.GH_REPO || "blogspro";

    if (!token) {
        console.error("❌ GH_TOKEN / GH_PAT missing from .env");
        process.exit(1);
    }

    const manifest = [];
    const frequencies = ['weekly', 'monthly', 'hourly'];

    for (const freq of frequencies) {
        const dir = path.join(process.cwd(), 'articles', freq);
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') || f === 'index.json');
            for (const f of files) {
                manifest.push({
                    path: `articles/${freq}/${f}`,
                    localPath: path.join(dir, f)
                });
            }
        }
    }

    console.log(`📦 [Historical-Sync] Found ${manifest.length} files to synchronize.`);

    try {
        // Push in batches to be gentle on the API
        const batchSize = 5;
        for (let i = 0; i < manifest.length; i += batchSize) {
            const batch = manifest.slice(i, i + batchSize);
            console.log(`📡 [GitHub] Pushing batch ${Math.floor(i/batchSize) + 1}...`);
            await pushMultipleToGitHub(batch, "archival: historical manuscript synchronization", owner, repo, token);
        }
        console.log("✅ [Historical-Sync] Batch alignment complete. All pulses are now live on GitHub Pages.");
    } catch (e) {
        console.error("❌ [Historical-Sync] Synchronization failed:", e.message);
    }
}

historicalSync().catch(console.error);
