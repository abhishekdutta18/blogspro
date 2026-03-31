import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

async function run() {
    const {
        R2_ENDPOINT,
        CLOUDFLARE_R2_ACCESS_KEY_ID,
        CLOUDFLARE_R2_SECRET_ACCESS_KEY,
        R2_BUCKET_NAME,
        FILE_NAME,
        FREQUENCY,
        OUTPUT_DIR
    } = process.env;

    if (!FILE_NAME) {
        throw new Error('FILE_NAME environment variable is required');
    }

    const s3 = new S3Client({
        region: 'auto',
        endpoint: R2_ENDPOINT,
        credentials: {
            accessKeyId: CLOUDFLARE_R2_ACCESS_KEY_ID,
            secretAccessKey: CLOUDFLARE_R2_SECRET_ACCESS_KEY,
        },
    });

    const inputKey = `briefings/${FILE_NAME}`;
    console.log('Fetching HTML from R2:', inputKey);

    const getObj = await s3.send(new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: inputKey,
    }));
    const html = await getObj.Body.transformToString();

    console.log('Launching Puppeteer...');
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
    
    // Set content and wait for network idle
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

    // Inject print styling (logic from generate-pdf.js)
    await page.evaluate(() => {
        const style = document.createElement('style');
        style.textContent = `
            @page { margin: 1.5cm; }
            body { font-family: sans-serif; }
            .no-print { display: none !important; }
        `;
        document.head.appendChild(style);
    });

    const pdfName = FILE_NAME.replace('.html', '.pdf');
    const localPath = path.join(OUTPUT_DIR || '.', pdfName);

    console.log('Generating PDF:', pdfName);
    await page.pdf({
        path: localPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '30px', bottom: '30px', left: '30px', right: '30px' }
    });

    console.log('Uploading PDF to R2:', pdfName);
    const outputKey = `briefings/${pdfName}`;
    await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: outputKey,
        Body: fs.readFileSync(localPath),
        ContentType: 'application/pdf'
    }));

    await browser.close();
    console.log('✅ PDF Generation Complete for:', pdfName);
}

run().catch(err => {
    console.error('❌ PDF Generation Failed:', err);
    process.exit(1);
});
