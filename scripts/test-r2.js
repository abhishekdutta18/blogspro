import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();

/**
 * R2 Connectivity Diagnostic Tool
 * Verifies if R2_ACCESS_KEY_ID and SECRET can reach the BlogsPro bucket.
 */
async function verifyR2() {
    console.log("🔍 [Diagnostic] Testing Cloudflare R2 Connectivity...");
    
    const {
        R2_ENDPOINT,
        R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY,
        R2_BUCKET_NAME
    } = process.env;

    if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
        console.error("❌ Missing R2 Environment Variables in .env");
        process.exit(1);
    }

    try {
        const s3 = new S3Client({
            region: 'auto',
            endpoint: R2_ENDPOINT,
            credentials: {
                accessKeyId: R2_ACCESS_KEY_ID,
                secretAccessKey: R2_SECRET_ACCESS_KEY,
            },
        });

        console.log(`🌐 Connecting to Endpoint: ${R2_ENDPOINT}`);
        console.log(`🪣 Target Bucket: ${R2_BUCKET_NAME}`);

        const result = await s3.send(new ListObjectsV2Command({
            Bucket: R2_BUCKET_NAME,
            MaxKeys: 5
        }));

        console.log("✅ [R2 SUCCESS] Connection established. Files found:", result.Contents?.length || 0);
        if (result.Contents) {
            result.Contents.forEach(obj => console.log(` - ${obj.Key}`));
        }
    } catch (e) {
        console.error("❌ [R2 FAILURE] Could not authenticate with Cloudflare R2:", e.message);
        if (e.message.includes("SignatureDoesNotMatch")) {
            console.error("💡 Hint: Check your Secret Access Key for trailing spaces or special characters.");
        }
    }
}

verifyR2();
