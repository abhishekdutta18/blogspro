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
        document.querySelectorAll('.manuscript-body svg:not([aria-label="A chart."])').forEach(el => el.remove());

        // 3. Remove duplicate chart divisions but KEEP the real ones
        // Real charts injected by the pipeline have class "terminal-chart"
        document.querySelectorAll('.manuscript-body div[id^="chart_"]').forEach(el => {
            if (!el.classList.contains('terminal-chart')) {
                // This is a fake AI hallucinated duplicate container, remove it.
                el.remove(); 
            } else {
                // This is the real terminal chart container. Ensure it's empty so SDK can draw there.
                // Note: Google Charts usually removes existing children, but let's be safe.
                if (el.children.length > 0 && el.children[0].tagName === 'SVG') {
                    // Do nothing, SDK already rendered here
                } else {
                    el.innerHTML = ''; 
                }
            }
        });

        // 4. Cleanup Empty P tags resulting from parsed HTML layout breaks
        document.querySelectorAll('p').forEach(p => {
            if (!p.textContent.trim() && p.children.length === 0) {
                p.remove();
            }
        });
        
        // 5. Inject Print-Friendly Standardized Styling
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
            h1, h3, h4, strong { color: #000000 !important; page-break-after: avoid; }
            h2 { color: #000000 !important; page-break-before: always; page-break-after: avoid; margin-top: 2rem !important; }
            p, li { color: #333333 !important; orphans: 3; widows: 3; line-height: 1.5; }
            
            /* High Contrast Cards & Charts for Print */
            .card { 
                background: #FFFFFF !important; 
                border: 0 !important;
                padding: 0 !important;
                margin: 2rem 0 !important;
                page-break-inside: avoid;
            }
            .terminal-chart { 
                background: #FFFFFF !important; 
                min-height: 250px !important;
                page-break-inside: avoid;
            }
            
            /* Table Formatting for Print */
            .table-container { margin: 1.5rem 0 !important; page-break-inside: avoid; }
            table { width: 100% !important; border-collapse: collapse !important; color: #000 !important; }
            th { border-bottom: 2px solid #000 !important; color: #000 !important; padding: 8px !important; text-align: left !important; background-color: #F8FAFC !important; }
            td { border-bottom: 1px solid #E5E7EB !important; color: #111 !important; padding: 8px !important; }

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
}

async function generatePDFs() {
    const inputDir = process.env.INPUT_DIR || path.join(__dirname, '../articles/weekly');
    const outputDir = process.env.OUTPUT_DIR || path.join(__dirname, '../artifacts');
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const weeklyHtml = await getLatestFile(inputDir);
    
    if (!weeklyHtml) {
        console.log("No content to convert in:", inputDir);
        return;
    }

    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for many CI environments
    });

    console.log("Generating Unbreakable HTML+Charts Weekly PDF from:", weeklyHtml);
    const page = await browser.newPage();
    // Use desktop viewport to ensure charts render wide
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
    
    // Wait for network idle to ensure Google Charts SDK completely finishes drawing
    await page.goto(`file://${weeklyHtml}`, { waitUntil: 'networkidle0', timeout: 60000 });
    
    await prepareForPrint(page);
    
    // Safety sleep just to make absolutely sure any chart animations finish
    await new Promise(r => setTimeout(r, 5000));

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
