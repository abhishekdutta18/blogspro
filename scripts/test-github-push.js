import dotenv from 'dotenv';
import { pushMultipleToGitHub } from './lib/storage-bridge.js';
import fs from 'fs';
import path from 'path';

dotenv.config();

async function testPush() {
    console.log("🧪 [Test-Push] Testing GitHub Sovereign Bridge...");
    
    const token = process.env.GH_TOKEN || process.env.GH_PAT;
    const owner = process.env.GH_OWNER || "abhishekdutta18";
    const repo = process.env.GH_REPO || "blogspro";

    if (!token) {
        console.error("❌ GH_TOKEN / GH_PAT missing from .env");
        process.exit(1);
    }

    // Create a tiny test file
    const testFile = path.join(process.cwd(), 'articles', 'test-sync.txt');
    if (!fs.existsSync(path.dirname(testFile))) fs.mkdirSync(path.dirname(testFile), { recursive: true });
    fs.writeFileSync(testFile, `Sync Test: ${new Date().toISOString()}`);

    try {
        await pushMultipleToGitHub(
            [{ path: 'articles/test-sync.txt', localPath: testFile }],
            "chore: test sovereign push bridge",
            owner, repo, token
        );
        console.log("✅ [Test-Push] Success! Bridge is operational.");
    } catch (e) {
        console.error("❌ [Test-Push] Failed:", e.message);
    }
}

testPush().catch(console.error);
