import { TextEncoder } from 'util';
import crypto from 'crypto';
import fs from 'fs';

// Mock environment
const env = {
    FIREBASE_SERVICE_ACCOUNT: fs.readFileSync('.env', 'utf8').split('FIREBASE_SERVICE_ACCOUNT=')[1].trim().replace(/^'|'$/g, '')
};

async function test() {
    console.log("🧪 Starting Auth Bridge Simulation...");
    try {
        const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
        console.log("✅ Service Account Parsed:", sa.client_email);
        
        // Simulating the worker logic
        const now = Math.floor(Date.now() / 1000);
        const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({
            iss: sa.client_email,
            scope: "https://www.googleapis.com/auth/devstorage.full_control https://www.googleapis.com/auth/datastore",
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
        console.log("✅ JWT Generated Successfully (Signature Length:", encodedSig.length, ")");
        
        console.log("📡 Attempting Token Exchange...");
        const res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
        });

        const data = await res.json();
        if (data.access_token) {
            console.log("🏆 SUCCESS! Access Token Obtained:", data.access_token.substring(0, 10) + "...");
        } else {
            console.error("❌ Token Exchange Failed:", data);
        }
    } catch (e) {
        console.error("❌ Test Failed:", e.message);
        process.exit(1);
    }
}

test();
