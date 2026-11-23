import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { readText } from './lib/media-store.js';

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
    const inputKey = `manuscripts/${FILE_NAME}`;
    const localDistPath = path.join(process.cwd(), 'dist', FILE_NAME);

    let html = "";

    // Local checkout first (dist/), then the media store on the VPS.
    if (fs.existsSync(localDistPath)) {
        console.log(`🏎️ [PDF Worker] Found local manuscript: ${localDistPath}`);
        html = fs.readFileSync(localDistPath, 'utf8');
    } else {
        console.log(`📂 [PDF Worker] Reading HTML from the media store: ${inputKey}`);
        html = await readText(inputKey);
        if (html === null) throw new Error(`Manuscript not found in dist/ or the media store: ${inputKey}`);
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
            @page { margin: 1cm; size: A4; }
            body { font-family: 'Mulish', sans-serif; background: white !important; color: black !important; margin: 0; padding: 0; }
            
            /* 🚫 Layout Reset: Kill web-interactive artifacts */
            .sidebar, .logo, .terminal-sidebar, .v2-nav, .mobile-toggle, #sidebar-toggle { display: none !important; }
            .nav-item, nav { display: none !important; }
            
            /* 📏 Content Expansion: Use full A4 width */
            .main-content { margin-left: 0 !important; padding: 2cm !important; max-width: 100% !important; }
            
            /* 📊 Table Fidelity: High-Contrast Print Mode */
            .table-container { background: white !important; border: 1px solid black !important; margin: 1.5rem 0; }
            table { border-collapse: collapse; width: 100%; color: black !important; }
            th { border: 1px solid black !important; background: #f0f0f0 !important; color: black !important; font-weight: bold; }
            td { border: 1px solid #ccc !important; color: black !important; background: white !important; }
            
            /* 📉 Chart Fidelity */
            .chart-container, .terminal-chart { width: 100% !important; height: auto !important; page-break-inside: avoid; border: 1px solid #eee; margin-top: 1cm; }
            
            /* 🖋️ Typography & Breaks */
            h1, h2, h3 { color: black !important; page-break-after: avoid; }
            .institutional-sector { page-break-before: always; border-top: 2px solid black; padding-top: 1cm; }
            .institutional-divider { display: none !important; }
            a { color: #0000EE !important; text-decoration: underline; }
            p { orphans: 3; widows: 3; line-height: 1.5; }
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

    console.log(`📄 [Worker] PDF written to ${localPath} (${freq})`);

    await browser.close();
    console.log('✅ PDF Generation Complete for:', pdfName);
}

run().catch(err => {
    console.error('❌ PDF Generation Failed:', err);
    process.exit(1);
});
