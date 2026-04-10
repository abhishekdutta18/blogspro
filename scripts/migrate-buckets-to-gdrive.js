/**
 * 🛰️ [V10.1] Institutional Bucket Migration Utility
 * Migrates local metadata and fragments to Google Drive.
 */
import fs from 'node:fs';
import path from 'node:path';
import { saveToGDriveBucket } from './lib/storage-bridge.js';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
    console.log("🚀 [Migration] Initiating Bucket Pivot to Google Drive...");

    const env = process.env;
    const bucketId = env.GDRIVE_BUCKET_ID;

    if (!bucketId) {
        console.error("❌ ERROR: GDRIVE_BUCKET_ID is missing in .env.");
        console.log("Please create a folder on Google Drive and add its ID to your .env file.");
        process.exit(1);
    }

    const metadataPath = path.resolve('./institutional-metadata.json');
    if (!fs.existsSync(metadataPath)) {
        console.error(`❌ ERROR: ${metadataPath} not found.`);
        process.exit(1);
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

    try {
        console.log(`📡 [Migration] Uploading institutional-metadata.json to folder: ${bucketId}...`);
        const fileId = await saveToGDriveBucket('institutional-metadata.json', metadata, env);

        if (fileId) {
            console.log("\n✅ SUCCESS: Metadata Bucket Migrated.");
            console.log("--------------------------------------------------");
            console.log(`FILE ID: ${fileId}`);
            console.log(`REMOTE_CONFIG_URL: https://drive.google.com/uc?export=download&id=${fileId}`);
            console.log("--------------------------------------------------");
            console.log("\nACTION REQUIRED:");
            console.log(`1. Set REMOTE_CONFIG_URL in your Cloudflare/Vercel dashboard.`);
            console.log(`2. Ensure your Service Account has "Editor" access to the GDrive Folder.`);
        } else {
            console.error("❌ Migration failed at the bridge layer.");
        }
    } catch (err) {
        console.error("❌ Migration Crash:", err.message);
    }
}

migrate();
