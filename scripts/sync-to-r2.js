import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

async function sync() {
    const {
        R2_ENDPOINT,
        CLOUDFLARE_R2_ACCESS_KEY_ID,
        CLOUDFLARE_R2_SECRET_ACCESS_KEY,
        R2_BUCKET_NAME,
        SYNC_DIR,
        SYNC_PREFIX
    } = process.env;

    if (!SYNC_DIR) throw new Error('SYNC_DIR is required');

    const s3 = new S3Client({
        region: 'auto',
        endpoint: R2_ENDPOINT,
        credentials: {
            accessKeyId: CLOUDFLARE_R2_ACCESS_KEY_ID,
            secretAccessKey: CLOUDFLARE_R2_SECRET_ACCESS_KEY,
        },
    });

    const files = fs.readdirSync(SYNC_DIR).filter(f => fs.lstatSync(path.join(SYNC_DIR, f)).isFile());
    
    console.log(`🚀 [Sync] Starting R2 upload of ${files.length} files from ${SYNC_DIR}...`);

    for (const file of files) {
        const localPath = path.join(SYNC_DIR, file);
        const key = SYNC_PREFIX ? `${SYNC_PREFIX}/${file}` : file;
        const contentType = file.endsWith('.html') ? 'text/html' : 
                          file.endsWith('.pdf') ? 'application/pdf' : 
                          file.endsWith('.json') ? 'application/json' : 'application/octet-stream';

        console.log(`📦 [Sync] Uploading ${file} -> ${key} (${contentType})`);
        
        await s3.send(new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
            Body: fs.readFileSync(localPath),
            ContentType: contentType
        }));
    }

    console.log('✅ [Sync] Complete.');
}

sync().catch(err => {
    console.error('❌ [Sync] Failed:', err);
    process.exit(1);
});
