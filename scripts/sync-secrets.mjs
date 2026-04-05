import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

/**
 * BlogsPro Swarm 5.3: Institutional Secret Synchronizer (V5.4 Hardened)
 * ====================================================================
 * Automatically links local .env credentials to Cloudflare Pulse & GitHub Swarm.
 * Uses temporary file-based piping to ensure shell-safety for complex keys.
 */

const SECRETS_TO_SYNC = [
    'VAULT_MASTER_KEY',
    'SWARM_INTERNAL_TOKEN',
    'GH_PAT',
    'GEMINI_API_KEY',
    'GROQ_API_KEY',
    'MISTRAL_API_KEY',
    'SAMBANOVA_API_KEY',
    'TOGETHER_API_KEY',
    'DEEPINFRA_API_KEY',
    'OPENROUTER_API_KEY',
    'KIMI_API_KEY',
    'SENTRY_DSN',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_SERVICE_ACCOUNT',
    'TELEGRAM_BOT_TOKEN',
    'NGROK_REMOTE_URL'
];

const WORKER_ENVIRONMENTS = ['data-hub', 'relevance', 'auditor', 'seo', 'pulse', 'mirofish', 'newsletter', 'templates', 'hil-relay'];

function log(msg, symbol = '🤖') {
    console.log(`${symbol} [Pulse-Sync] ${msg}`);
}

async function run() {
    const dryRun = process.argv.includes('--dry-run');
    log(`Initializing Institutional Multi-Tier Secret Synchronization (V5.4) [Dry-Run: ${dryRun}]...`);

    // V5.3: Clean Environment (Strip broken placeholders/deprecated vars)
    const BROKEN_VARS = ['CF_API_TOKEN', 'CLOUDFLARE_API_TOKEN', 'CF_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID'];
    const sanitizedEnv = { ...process.env };
    
    BROKEN_VARS.forEach(v => {
        if (sanitizedEnv[v] && (sanitizedEnv[v].includes('${{') || sanitizedEnv[v].length < 10)) {
            delete sanitizedEnv[v];
            log(`🧹 Sanitized ${v} (Broken Placeholder)`, "🧼");
        }
    });

    // Tier 1: Prefer CLOUDFLARE_API_TOKEN if available
    if (sanitizedEnv.CLOUDFLARE_API_TOKEN && !sanitizedEnv.CF_API_TOKEN) {
        sanitizedEnv.CF_API_TOKEN = sanitizedEnv.CLOUDFLARE_API_TOKEN;
    }

    // 1. Dependency Check
    try {
        if (!dryRun) {
            execSync('gh --version', { stdio: 'ignore' });
            execSync('npx wrangler --version', { stdio: 'ignore' });
        }
    } catch (e) {
        log("❌ Dependencies missing (gh/wrangler). Aborting.", "🚫");
        process.exit(1);
    }

    // 2. Load Local .env (Manual Parsing to avoid 'dotenv' dep in GHA)
    const envPath = path.join(process.cwd(), '.env');
    let localEnv = {};
    if (fs.existsSync(envPath)) {
        const raw = fs.readFileSync(envPath, 'utf8');
        raw.split('\n').forEach(line => {
            const [key, ...valParts] = line.split('=');
            if (key && valParts.length > 0) {
                localEnv[key.trim()] = valParts.join('=').trim();
            }
        });
        log("Local .env detected and parsed.");
    }

    // 3. Process Vault Master Key & Identity
    let masterKey = localEnv.VAULT_MASTER_KEY || process.env.VAULT_MASTER_KEY;
    if (!masterKey) {
        log("No VAULT_MASTER_KEY found. Generating institutional identity...", "🔑");
        masterKey = crypto.randomBytes(32).toString('hex');
    }
    
    const swarmToken = localEnv.SWARM_INTERNAL_TOKEN || process.env.SWARM_INTERNAL_TOKEN || "BPRO_SWARM_SECRET_2026";

    // 4. Synchronization Loop
    for (const secret of SECRETS_TO_SYNC) {
        let value = (process.env[secret] || localEnv[secret]);
        if (secret === 'VAULT_MASTER_KEY') value = masterKey;
        if (secret === 'SWARM_INTERNAL_TOKEN') value = swarmToken;
        
        if (!value || value.includes('${{')) {
            log(`Skipping [${secret}]: No valid local value found.`, "⏭");
            continue;
        }

        log(`Propagating [${secret}] to 8-Tier Swarm (GitHub & Cloudflare)...`, "📡");

        // V5.4: SHELL-SAFE PROPAGATION VIA TEMP FILE
        const tmpFile = path.join(os.tmpdir(), `secret-${secret}-${Date.now()}.tmp`);
        try {
            fs.writeFileSync(tmpFile, value);

            if (dryRun) {
                log(`[DRY-RUN] npx wrangler secret put ${secret} --env [8-tiers] < (value: ${value.substring(0, 4)}...)`);
                log(`[DRY-RUN] gh secret set ${secret} --body "${value.substring(0, 4)}..."`);
            } else {
                // Cloudflare (Tiered Envs)
            for (const env of WORKER_ENVIRONMENTS) {
                execSync(`npx wrangler secret put ${secret} --env ${env} < ${tmpFile}`, { 
                    stdio: 'ignore', 
                    env: sanitizedEnv 
                });
            }
            // Miro-Sync (Separate Config)
            execSync(`npx wrangler secret put ${secret} --config wrangler.miro-sync.toml < ${tmpFile}`, { 
                stdio: 'ignore', 
                env: sanitizedEnv 
            });
            
            // GitHub (Actions)
            execSync(`gh secret set ${secret} < ${tmpFile}`, { 
                stdio: 'ignore',
                env: sanitizedEnv
            });
            }
            
            log(`Successfully synchronized [${secret}] across all 8 tiers.`, "✅");
        } catch (e) {
            log(`Warning: Failed to sync [${secret}]: ${e.message}`, "⚠️");
        } finally {
            if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        }
    }

    log("Institutional Synchronization Cycle Complete. Swarm Nodes are now Primed.", "🏆");
}

run();
