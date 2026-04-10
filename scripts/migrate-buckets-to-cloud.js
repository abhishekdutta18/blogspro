/**
 * 🛰️ [V10.5] Institutional GCS Pivot Utility
 * Migrates local metadata to Google Cloud Storage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { saveToCloudBucket } from './lib/storage-bridge.js';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
    console.log("🚀 [Migration] Initiating GCS Cloud Bucket Pivot...");

    const env = process.env;
    const bucket = env.FIREBASE_STORAGE_BUCKET || "blogspro-asset";

    console.log(`📡 [Migration] Target Bucket: ${bucket}`);

    const metadataPath = path.resolve('./institutional-metadata.json');
    if (!fs.existsSync(metadataPath)) {
        console.error(`❌ ERROR: ${metadataPath} not found.`);
        process.exit(1);
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    if (!metadata.VERTICALS || metadata.VERTICALS.length === 0) {
        console.error("❌ ERROR: Metadata is empty or corrupt.");
        process.exit(1);
    }

    try {
        console.log(`📡 [Migration] Uploading institutional-metadata.json (${metadata.VERTICALS.length} verticals)...`);
        const result = await saveToCloudBucket('institutional-metadata.json', metadata, env);

        if (result) {
            console.log("\n✅ SUCCESS: Metadata Pivot Complete.");
            console.log("--------------------------------------------------");
            console.log(`BUCKET: ${bucket}`);
            console.log(`FILE: institutional-metadata.json`);
            console.log(`REMOTE_CONFIG_URL: https://storage.googleapis.com/${bucket}/institutional-metadata.json`);
            console.log("--------------------------------------------------");
            console.log("\nZero-Node Readiness: 100%");
        } else {
            console.error("❌ Migration failed at the bridge layer.");
        }
    } catch (err) {
        console.error("❌ Migration Crash:", err.message);
    }
}

migrate();
