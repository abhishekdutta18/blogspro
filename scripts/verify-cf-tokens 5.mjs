import fs from 'fs';
import path from 'path';

/**
 * BlogsPro 5.5: Cloudflare Token Verification Utility
 * ==================================================
 * Identifies and tests all potential Cloudflare tokens in the environment.
 */

const POTENTIAL_NAMES = [
    'CLOUDFLARE_API_TOKEN',
    'CF_API_TOKEN',
    'CLOUDFLARE_TOKEN',
    'CF_TOKEN',
    'CLOUDFLARE_API_KEY',
    'CF_API_KEY',
    'CF_KEY',
    'CLOUDFLARE_KEY'
];

async function verifyToken(token, name) {
    if (!token || token.includes('${{') || token.length < 10) return null;

    try {
        const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (data.success && data.result?.status === 'active') {
            return { name, valid: true, id: data.result.id };
        }
        return { name, valid: false, error: data.errors?.[0]?.message || 'Invalid' };
    } catch (e) {
        return { name, valid: false, error: e.message };
    }
}

async function run() {
    console.log("🔍 [CF-Verify] Scanning environment for Cloudflare credentials...");

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
    }

    const foundTokens = new Map();

    // Check all sources
    for (const name of POTENTIAL_NAMES) {
        const val = process.env[name] || localEnv[name];
        if (val) foundTokens.set(name, val);
    }

    // Check for any other CF_ or CLOUDFLARE_ vars
    const allEnvKeys = Object.keys({ ...process.env, ...localEnv });
    allEnvKeys.forEach(k => {
        if (k.startsWith('CF_') || k.startsWith('CLOUDFLARE_')) {
            const val = process.env[k] || localEnv[k];
            if (val && !foundTokens.has(k) && (k.includes('TOKEN') || k.includes('KEY'))) {
                foundTokens.set(k, val);
            }
        }
    });

    if (foundTokens.size === 0) {
        console.log("⚠️ No Cloudflare tokens found in environment or .env.");
        return;
    }

    console.log(`📡 Found ${foundTokens.size} potential credentials. Testing validity...`);

    const results = [];
    for (const [name, token] of foundTokens) {
        process.stdout.write(`⏳ Testing [${name}]... `);
        const res = await verifyToken(token, name);
        if (res?.valid) {
            console.log("✅ VALID");
            results.push(res);
        } else {
            console.log(`❌ INVALID (${res?.error || 'Skipped/Broken'})`);
        }
    }

    console.log("\n🎬 [CF-Verify] Verification Summary:");
    if (results.length > 0) {
        results.forEach(r => console.log(` - [${r.name}] is ACTIVE (Token ID: ${r.id})`));
        console.log("\n💡 Institutional Recommendation: Use the first active token listed above.");
    } else {
        console.log("❌ No active Cloudflare tokens found. Please check your credentials.");
    }
}

run();
