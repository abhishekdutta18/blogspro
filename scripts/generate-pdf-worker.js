import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { initFirebase, uploadToStorage, downloadFromStorage } from './lib/firebase-service.js';

async function run() {
    const {
        FILE_NAME,
        FREQUENCY,
        OUTPUT_DIR
    } = process.env;

    if (!FILE_NAME) {
        throw new Error('FILE_NAME environment variable is required');
    }

    const freq = (FREQUENCY || 'weekly').toLowerCase();
    const inputKey = `${freq}/${FILE_NAME}`; 
    const localDistPath = path.join(process.cwd(), 'dist', FILE_NAME);

    let html = "";

    // 🏎️ LOCAL-FIRST FALLBACK: Check if file exists in dist/ before fetching from Firebase
    if (fs.existsSync(localDistPath)) {
        console.log(`🏎️ [PDF Worker] Found local manuscript: ${localDistPath}`);
        html = fs.readFileSync(localDistPath, 'utf8');
    } else {
        console.log(`🌐 [PDF Worker] Fetching HTML from Firebase Storage: ${inputKey}`);
        try {
            html = await downloadFromStorage(inputKey);
        } catch (e) {
            console.error(`❌ [PDF Worker] Failed to fetch HTML from Firebase: ${e.message}`);
            throw e;
        }
    }

    console.log('Launching Puppeteer...');
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    // 📐 High-Resolution Production Viewport
    await page.setViewport({ width: 1440, height: 2560, deviceScaleFactor: 2 });
    
    // Set content and wait for network idle
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 90000 });
 
    // 🖨️ PRODUCTION PRINT STYLING: Enforce clean document render
    await page.evaluate(() => {
        const style = document.createElement('style');
        style.textContent = `
            @page { margin: 2cm; size: A4; }
            body { font-family: 'Mulish', sans-serif; background: white !important; color: black !important; }
            /* 🚫 Hide Interactive UI Elements */
            .no-print, .terminal-sidebar, .v2-nav, .mobile-toggle, #sidebar-toggle { display: none !important; }
            .institutional-sector { page-break-before: always; margin-bottom: 2rem; }
            h1, h2, h3 { color: #000 !important; }
            a { color: #0056b3 !important; text-decoration: underline; }
            table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .chart-container { width: 100% !important; height: auto !important; page-break-inside: avoid; }
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

    console.log('Uploading PDF to Firebase Storage:', pdfName);
    const outputKey = `${freq}/${pdfName}`;
    
    try {
        await uploadToStorage(localPath, outputKey, 'application/pdf');
        console.log(`🌐 [Worker] PDF Uploaded to Firebase Storage: ${outputKey}`);
    } catch (e) {
        console.warn(`⚠️ [Worker] Firebase Upload skipped or failed: ${e.message}`);
    }

    await browser.close();
    console.log('✅ PDF Generation Complete for:', pdfName);
}

run().catch(err => {
    console.error('❌ PDF Generation Failed:', err);
    process.exit(1);
});
