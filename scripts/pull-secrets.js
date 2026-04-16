import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Institutional Secret Retrieval (BlogsPro 5.0)
 * ============================================
 * Pulls GitHub Repository Secrets into the local .env using 'gh' CLI.
 */
async function pullSecrets() {
    console.log("🔐 [Security] Starting Institutional Secret Retrieval from GitHub...");

    const envPath = path.join(process.cwd(), '.env');
    let currentEnv = {};
    
    // 🛡️ INSTITUTIONAL TOOLING: Resolve 'gh' absolute path
    const GH_PATH = fs.existsSync('/opt/homebrew/bin/gh') ? '/opt/homebrew/bin/gh' : 'gh';
    
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
            if (line && !line.startsWith('#')) {
                const [k, v] = line.split('=');
                if (k) currentEnv[k.trim()] = v ? v.trim() : "";
            }
        });
    }

    try {
        // 1. List all available secrets
        console.log(`📡 Fetching secret list from GitHub using ${GH_PATH}...`);
        const secretListRaw = execSync(`${GH_PATH} secret list`, { encoding: 'utf8' });
        const secretNames = secretListRaw.split('\n')
            .slice(1) // Skip header
            .map(line => line.split(/\s+/)[0])
            .filter(name => name);

        console.log(`🔍 Found ${secretNames.length} secrets on GitHub.`);

        // 2. Fetch and Map
        for (const name of secretNames) {
            try {
                process.stdout.write(`📥 Pulling ${name}... `);
                const value = execSync(`${GH_PATH} secret view ${name} --raw`, { encoding: 'utf8' }).trim();
                
                // Map to local keys (handle naming variations)
                let localKey = name;
                // if (name === 'GEMINI_API_KEY' && !currentEnv['GEMINI_API_KEY']) localKey = 'GEMINI_KEY'; // Purged
                if (name === 'GROQ_API_KEY' && !currentEnv['GROQ_API_KEY']) localKey = 'GROQ_KEY';
                if (name === 'MISTRAL_API_KEY' && !currentEnv['MISTRAL_API_KEY']) localKey = 'MISTRAL_KEY';

                currentEnv[localKey] = value;
                console.log("✅");
            } catch (e) {
                console.log(`❌ ERROR: ${e.message}`);
            }
        }

        // 3. Write back to .env
        const newEnvContent = Object.entries(currentEnv)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');

        fs.writeFileSync(envPath, newEnvContent);
        console.log(`\n🏁 [Security] Retrieval Complete! Local .env hydrated and stabilized.`);
    } catch (e) {
        console.error("❌ High-Compute Sync Failed:", e.message);
    }
}

pullSecrets();
