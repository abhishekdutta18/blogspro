const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function getLatestFile(dir) {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && !f.includes('demo') && !f.includes('smoke'));
    if (files.length === 0) return null;
    files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
    return path.join(dir, files[0]);
}

async function prepareForPrint(page) {
    await page.evaluate(() => {
        // 1. Remove rogue AI <script> tags inside the manuscript
        document.querySelectorAll('.manuscript-body script').forEach(el => el.remove());

        // 2. Remove AI hallucinated SVGs that conflict with Google Charts
        document.querySelectorAll('.manuscript-body svg').forEach(el => el.remove());

        // 3. Remove duplicate chart divisions
        const seenIds = new Set();
        document.querySelectorAll('.manuscript-body div[id^="chart_"]').forEach(el => {
            if (seenIds.has(el.id)) {
                el.remove(); // Remove duplicate injected card
            } else {
                seenIds.add(el.id);
                el.innerHTML = ''; // Clear AI text inside it so Google charts can render clean
            }
        });

        // 4. Cleanup Empty P tags resulting from parsed HTML layout breaks
        document.querySelectorAll('p').forEach(p => {
            if (!p.textContent.trim() && p.children.length === 0) {
                p.remove();
            }
        });
        
        // 5. Convert any orphaned </em> or strange tags
        
        // 6. Inject Print-Friendly Standardized Styling
        const style = document.createElement('style');
        style.textContent = `
            @page { margin: 1.5cm; }
            :root {
                --nexus-bg: #FFFFFF !important;
                --nexus-sidebar: #FFFFFF !important;
                --nexus-glass: #FFFFFF !important;
                --nexus-accent: #111827 !important; /* Dark Grey for headers */
                --nexus-amber: #4B5563 !important;  /* Muted Grey for accents */
                --nexus-border: #E5E7EB !important;
                --nexus-text-h1: #000000 !important;
                --nexus-text-p: #374151 !important;
            }
            body { 
                background-color: #FFFFFF !important; 
                color: #000000 !important; 
                font-size: 11pt !important;
            }
            .sidebar { display: none !important; }
            .main-content { 
                margin-left: 0 !important; 
                padding: 0 !important; 
                max-width: none !important; 
                width: 100% !important;
            }
            h1, h2, h3, h4, strong { color: #000000 !important; page-break-after: avoid; }
            p, li { color: #333333 !important; orphans: 3; widows: 3; line-height: 1.5; }
            table { width: 100% !important; border-collapse: collapse !important; color: #000 !important; margin: 15px 0 !important; }
            th { border-bottom: 2px solid #000 !important; color: #000 !important; padding: 5px !important; text-align: left !important; }
            td { border-bottom: 1px solid #CCC !important; color: #111 !important; padding: 5px !important; }
            
            /* High Contrast Cards & Charts for Print */
            .card { 
                background: #F9FAFB !important; 
                border: 1px solid #D1D5DB !important; 
                border-left: 4px solid #111827 !important;
                padding: 1rem !important;
                margin: 2rem 0 !important;
                page-break-inside: avoid;
            }
            .terminal-chart { 
                background: #FFFFFF !important; 
                min-height: 250px !important;
            }
            
            /* Ensure Google Charts Text is Black in Print */
            svg text {
                fill: #000000 !important;
            }

            /* Hide status tags and extra footers */
            .status-tag { background: #F3F4F6 !important; color: #374151 !important; border: 1px solid #D1D5DB !important; }
            footer { display: none !important; }
        `;
        document.head.appendChild(style);
    });

    // Emulate standard print media
    await page.emulateMediaType('print');
    
    // Wait for internal network tasks and charts
    await new Promise(r => setTimeout(r, 4000));
}

async function generatePDFs() {
    const weeklyHtml = await getLatestFile(path.join(__dirname, '../articles/weekly'));
    
    if (!weeklyHtml) {
        console.log("No content to convert.");
        return;
    }

    const browser = await puppeteer.launch({ headless: "new" });
    const outputDir = '/Users/nandadulaldutta/.gemini/antigravity/brain/e6ec49bb-f90f-4b55-a43a-5dfcb780edf8';

    console.log("Generating Clean Weekly PDF from:", weeklyHtml);
    const page = await browser.newPage();
    // Use desktop viewport to ensure charts render wide
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
    
    await page.goto(`file://${weeklyHtml}`, { waitUntil: 'networkidle0', timeout: 60000 });
    
    await prepareForPrint(page);

    const outPath = path.join(outputDir, 'BlogsPro_Weekly_Briefing_Clean.pdf');
    await page.pdf({ 
        path: outPath, 
        format: 'A4', 
        printBackground: true, 
        preferCSSPageSize: true
    });
    console.log("Created", outPath);

    await browser.close();
}

generatePDFs().catch(console.error);
