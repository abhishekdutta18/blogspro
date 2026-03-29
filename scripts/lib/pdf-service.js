const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

/**
 * Institutional PDF Generator (BlogsPro V1.0)
 * Converts high-fidelity HTML terminal reports into professional PDFs.
 */
async function generatePDF(htmlPath) {
    console.log(`📑 Generating Institutional PDF for: ${path.basename(htmlPath)}...`);
    const pdfPath = htmlPath.replace('.html', '.pdf');
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // Wait for network idle to ensure Google Charts and fonts are loaded
        const fileUrl = `file://${path.resolve(htmlPath)}`;
        await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        
        // Inject print-specific styles to ensure the terminal look translates well to paper
        await page.addStyleTag({
            content: `
                body { background: #000 !important; color: #fff !important; }
                .terminal-chart { break-inside: avoid; border: 1px solid rgba(191,161,0,0.3) !important; }
                header, footer { border-color: #BFA100 !important; }
                a { color: #BFA100 !important; text-decoration: none !important; }
                @page { size: A4; margin: 1cm; }
            `
        });

        // Small delay to ensure charts are fully rendered after network idle
        await new Promise(resolve => setTimeout(resolve, 2000));

        await page.pdf({
            path: pdfPath,
            format: 'A4',
            printBackground: true,
            margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
            displayHeaderFooter: true,
            headerTemplate: '<div style="font-size: 10px; color: #BFA100; margin-left: 1cm;">BlogsPro Terminal — Institutional Briefing</div>',
            footerTemplate: '<div style="font-size: 10px; color: #BFA100; margin-left: 1cm; width: 100%; text-align: right; margin-right: 1cm;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'
        });

        console.log(`✅ PDF Generated Successfully: ${path.basename(pdfPath)}`);
        return pdfPath;
    } catch (error) {
        console.error(`❌ PDF Generation Failed for ${path.basename(htmlPath)}:`, error);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { generatePDF };
