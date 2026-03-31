import puppeteer from 'puppeteer';
import path from 'path';

async function generate() {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    const htmlPath = path.resolve('dist/swarm-hourly-1774951742233.html');
    const pdfPath = path.resolve('dist/hourly-pulse-2026.pdf');

    console.log(`📄 Converting ${htmlPath} to PDF...`);
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
    
    // Inject print styles for consistent 2025-2026 branding
    await page.addStyleTag({ content: `
        @page { margin: 1cm; }
        body { font-family: sans-serif; background: white !important; color: black !important; }
        .sidebar, footer { display: none !important; }
        .main-content { margin: 0 !important; width: 100% !important; }
    `});

    await page.pdf({ 
        path: pdfPath, 
        format: 'A4', 
        printBackground: true 
    });

    console.log(`✅ Generated PDF at: ${pdfPath}`);
    await browser.close();
}

generate().catch(console.error);
