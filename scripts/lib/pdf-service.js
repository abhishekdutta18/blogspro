// Conditional imports to prevent Worker environment crashes
let puppeteer = null;
let path = null;
let fs = null;

const isNode = typeof process !== "undefined" && process.versions && process.versions.node;

if (isNode) {
    import('puppeteer').then(m => puppeteer = m.default).catch(() => {});
    import('path').then(m => path = m.default).catch(() => {});
    import('fs').then(m => fs = m.default).catch(() => {});
}

/**
 * Institutional PDF Generator (BlogsPro V1.0)
 * Converts high-fidelity HTML terminal reports into professional PDFs.
 */
export async function generatePDF(htmlPath, frequency = 'daily') {
    if (!isNode || !puppeteer) {
        console.warn("⚠️ [PDF-Service] Rendering engine restricted. PDF generation only available in Node.js environments.");
        return null;
    }
    console.log(`📑 Generating Institutional PDF for: ${path.basename(htmlPath)} (${frequency.toUpperCase()})...`);
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
                body { background: #FFFFFF !important; color: #000000 !important; font-family: 'Inter', system-ui, sans-serif !important; }
                .main-content { padding: 40px !important; }
                .terminal-card, .terminal-chart { break-inside: avoid; border: 1px solid #E5E7EB !important; background: #FFFFFF !important; margin-bottom: 2rem !important; }
                header, footer { border-color: #111827 !important; color: #111827 !important; }
                h1, h2, h3 { color: #111827 !important; }
                .excerpt { border-left: 4px solid #111827 !important; color: #374151 !important; font-style: italic !important; }
                a { color: #2563EB !important; text-decoration: underline !important; }
                @page { size: A4; margin: 1cm; }
            `
        });

        // Small delay to ensure charts are fully rendered after network idle
        await new Promise(resolve => setTimeout(resolve, 2000));

        await page.pdf({
            path: pdfPath,
            format: 'A4',
            printBackground: true,
            margin: { top: '1.5cm', right: '1cm', bottom: '1.5cm', left: '1cm' },
            displayHeaderFooter: true,
            headerTemplate: `<div style="font-size: 8px; color: #6B7280; width: 100%; text-align: center;">BlogsPro Intellectual Unit — ${frequency.toUpperCase()} Institutional Research Manuscript</div>`,
            footerTemplate: '<div style="font-size: 8px; color: #6B7280; width: 100%; text-align: center; border-top: 1px solid #E5E7EB; padding-top: 5px;">© 2026 BlogsPro Terminal • Confidential • Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'
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
