import { normalizeInstitutionalPem } from './lib/sanitizer.js';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenv.config();

/**
 * 🛰️ [V10.2] OAuth Bridge Diagnostic
 */
async function debug() {
    console.log("🔍 [Diagnostic] Testing Storage Bridge Auth Logic...");

    let sa = null;
    const env = process.env;

    // Mimic storage-bridge.js hydration
    if (env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
            if (sa.private_key) sa.private_key = normalizeInstitutionalPem(sa.private_key);
            console.log("✅ Service Account JSON parsed.");
        } catch (e) {
            console.error("❌ JSON Parse Fail:", e.message);
            return;
        }
    }

    if (!sa || !sa.private_key) {
        console.error("❌ No Service Account / Private Key found in .env");
        return;
    }

    try {
        const base64Der = sa.private_key
            .replace(/-----BEGIN PRIVATE KEY-----/g, "")
            .replace(/-----END PRIVATE KEY-----/g, "")
            .replace(/\s+/g, "");

        console.log(`📏 Base64 Length: ${base64Der.length}`);
        console.log(`📡 Base64 Sample (Start): ${base64Der.substring(0, 50)}...`);

        const binaryDer = Buffer.from(base64Der, 'base64');
        console.log(`📦 Binary Length: ${binaryDer.byteLength}`);

        // Try importing with the global crypto (Node 25 supports this)
        // Note: webcrypto is usually available on globalThis.crypto or crypto.webcrypto
        const webcrypto = crypto.webcrypto;
        
        const key = await webcrypto.subtle.importKey(
            "pkcs8",
            binaryDer,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false,
            ["sign"]
        );

        console.log("✅ WebCrypto Import: SUCCESS");
        
    } catch (err) {
        console.error("❌ WebCrypto Import: FAILED");
        console.error(`ERROR: ${err.message}`);
        console.error("STACK:", err.stack);
    }
}

debug();
