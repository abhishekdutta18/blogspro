import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

/**
 * BlogsPro Remote Key Discovery (V10.9)
 * -------------------------------------
 * Fetches the definitive production keys from Firebase Remote Config.
 * This script uses the institutional service account to authenticate.
 */

async function getAccessToken(sa) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/firebase.remoteconfig",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now
    })).toString('base64url');

    const signature = crypto.createSign('RSA-SHA256')
        .update(`${header}.${payload}`)
        .sign(sa.private_key, 'base64url');

    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: `${header}.${payload}.${signature}`
        })
    });

    const data = await res.json();
    return data.access_token;
}

async function fetchRemoteConfig() {
    console.log("🔍 [Remote-Discovery] Searching for working production keys...");
    
    // 1. Locate Service Account
    const saPath = path.join(process.cwd(), 'knowledge', 'firebase-service-account.json');
    if (!fs.existsSync(saPath)) {
        console.error("❌ [Error] Service account not found at: " + saPath);
        return;
    }

    const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
    console.log(`🛡️ [Remote-Discovery] Authenticating as: ${sa.client_email}`);

    try {
        // 2. Obtain Token
        const token = await getAccessToken(sa);
        if (!token) throw new Error("Failed to obtain OAuth2 token.");

        // 3. Fetch Remote Config for common namespaces
        const namespaces = ['firebase', 'prod', 'global'];
        for (const ns of namespaces) {
            console.log(`🌐 Checking Namespace: ${ns}...`);
            const url = `https://firebaseremoteconfig.googleapis.com/v1/projects/${sa.project_id}/namespaces/${ns}/remoteConfig`;
            const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
            if (!res.ok) {
                console.warn(`⚠️ Namespace ${ns} failed: ${res.status}`);
                continue;
            }
            const config = await res.json();
            const params = config.parameters || {};
            console.log(`✅ [${ns}] Retrieved ${Object.keys(params).length} parameters.`);
            
            for (const [key, param] of Object.entries(params)) {
               const defVal = param.defaultValue?.value || "(no default)";
               console.log(`🔑 Key [${ns}]: ${key}`);
               console.log(`   Default: ${defVal}`);
               if (param.conditionalValues) {
                   for (const [cond, condVal] of Object.entries(param.conditionalValues)) {
                       console.log(`   Condition [${cond}]: ${condVal.value}`);
                   }
               }
            }
        }
        console.log("------------------------------------------\n");
        
        console.log("💡 [Next Step] Update your .env using these values to align with the Working GH Action.");

    } catch (e) {
        console.error("❌ [Remote-Discovery] Failure:", e.message);
    }
}

fetchRemoteConfig();
