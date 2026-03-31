import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Institutional Secret Sync (BlogsPro 5.0)
 * =========================================
 * Bridges local .env secrets to GitHub Repository Secrets using 'gh' CLI.
 */
async function syncSecrets() {
    console.log("🔐 [Security] Starting Institutional Secret Synchronization...");

    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
        console.error("❌ .env file not found. Cannot sync.");
        process.exit(1);
    }

    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');

    // Mapped Keys (Local -> GitHub)
    const SECRET_MAP = {
        'CEREBRAS_API_KEY': 'CEREBRAS_API_KEY',
        'SAMBANOVA_API_KEY': 'SAMBANOVA_API_KEY',
        'HF_TOKEN': 'HF_TOKEN',
        'QWEB_KEY': 'QWEB_KEY',
        'GEMINI_KEY': 'GEMINI_KEY',
        'GROQ_KEY': 'GROQ_KEY',
        'MISTRAL_API_KEY': 'MISTRAL_API_KEY',
        'OPENROUTER_KEY': 'OPENROUTER_KEY',
        'CF_API_TOKEN': 'CF_API_TOKEN',
        'CF_ACCOUNT_ID': 'CF_ACCOUNT_ID',
        'FIREBASE_PROJECT_ID': 'FIREBASE_PROJECT_ID',
        'FIREBASE_STORAGE_BUCKET': 'FIREBASE_STORAGE_BUCKET',
        'FIREBASE_SERVICE_ACCOUNT': 'FIREBASE_SERVICE_ACCOUNT',
        'SWARM_INTERNAL_TOKEN': 'SWARM_INTERNAL_TOKEN',
        'TELEGRAM_BOT_TOKEN': 'TELEGRAM_BOT_TOKEN',
        'TELEGRAM_CHAT_ID': 'TELEGRAM_CHAT_ID',
        'GH_PAT': 'GH_PAT',
        'GH_TOKEN': 'GH_PAT' // Fallback
    };

    let syncedCount = 0;

    for (const line of lines) {
        if (!line || line.startsWith('#')) continue;
        const [key, value] = line.split('=').map(s => s.trim());
        
        if (SECRET_MAP[key] && value) {
            try {
                console.log(`📡 Syncing: ${SECRET_MAP[key]}...`);
                // Use 'gh secret set' to upload the secret
                execSync(`gh secret set ${SECRET_MAP[key]}`, { input: value });
                syncedCount++;
            } catch (e) {
                console.error(`❌ Failed to sync ${key}: ${e.message}`);
            }
        }
    }

    console.log(`\n🏁 [Security] Synchronization Complete! (${syncedCount} Secrets Synced).`);
    console.log("🚀 You can now trigger the high-compute swarm via GitHub Actions.");
}

syncSecrets();
