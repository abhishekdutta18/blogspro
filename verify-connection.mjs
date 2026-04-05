import { TextEncoder } from 'util';
import crypto from 'crypto';
import fs from 'fs';

// Load the real secret from .env - Robust Multi-line Parser
const rawEnv = fs.readFileSync('.env', 'utf8');
const lines = rawEnv.split('\n');
let saStr = "";
let collecting = false;

for (let line of lines) {
    if (line.startsWith("FIREBASE_SERVICE_ACCOUNT='")) {
        saStr = line.substring("FIREBASE_SERVICE_ACCOUNT='".length);
        collecting = true;
    } else if (collecting) {
        saStr += "\n" + line;
    }
    if (collecting && line.endsWith("'")) {
        saStr = saStr.substring(0, saStr.length - 1);
        collecting = false;
        break;
    }
}

if (!saStr) {
    console.error("❌ FIREBASE_SERVICE_ACCOUNT not found or correctly parsed from .env");
    process.exit(1);
}

const sa = JSON.parse(saStr);

async function getAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/datastore",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now
    })).toString('base64url');

    const message = `${header}.${payload}`;
    const pemContents = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n|\s/g, "");
    const binaryDer = Buffer.from(pemContents, 'base64');

    const key = await crypto.webcrypto.subtle.importKey(
        "pkcs8", binaryDer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false, ["sign"]
    );

    const signature = await crypto.webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(message));
    const encodedSig = Buffer.from(signature).toString('base64url');
    const jwt = `${message}.${encodedSig}`;

    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });

    const data = await res.json();
    return data.access_token;
}

async function run() {
    console.log("🧪 Starting Automated Connection Test...");
    try {
        const token = await getAccessToken();
        if (!token) throw new Error("Failed to exchange JWT for token");
        console.log("✅ OAuth2 Handshake Successful");

        const url = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/latest_snapshots`;
        const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });

        if (res.ok) {
            console.log("🏆 PROJECT CONNECTED! Live Authenticated Access Verified.");
            const data = await res.json();
            console.log("📄 Active Clusters:", data.documents?.length || 0);
        } else {
            console.error("❌ Access Denied:", await res.text());
        }
    } catch (e) {
        console.error("❌ Test Failed:", e.message);
    }
}
run();
