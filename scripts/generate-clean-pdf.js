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

async function extractAndCleanHtml(sourceHtmlPath) {
    const rawHtml = fs.readFileSync(sourceHtmlPath, 'utf8');
    
    // We will use basic regex to extract the main content parts
    const titleMatch = rawHtml.match(/<h1>(.*?)<\/h1>/i);
    const excerptMatch = rawHtml.match(/<div class="excerpt">(.*?)<\/div>/i);
    const bodyMatch = rawHtml.match(/<div class="manuscript-body">([\s\S]*?)<footer/i);
    
    if (!bodyMatch) throw new Error("Could not find manuscript-body");

    let title = titleMatch ? titleMatch[1] : "Strategic Pulse";
    let excerpt = excerptMatch ? excerptMatch[1] : "";
    let body = bodyMatch[1];

    // Aggressively clean the body of all the AI hallucinations and charts
    body = body
        .replace(/<script[\s\S]*?<\/script>/gi, '') // Remove all scripts
        .replace(/<svg[\s\S]*?<\/svg>/gi, '')       // Remove all SVGs
        .replace(/<div[^>]*id="chart_[^>]*>[\s\S]*?<\/div>/gi, '') // Remove chart containers
        .replace(/<div class="card">\s*<\/div>/gi, '') // Remove empty cards
        .replace(/<div class="card">\s*<p>\s*<\/p>\s*<\/div>/gi, '')
        .replace(/<div class="card">[\s]*<\/div>/gi, '')
        // unwrapping broken p tags around block elements
        .replace(/<p>\s*(<div|<ul|<h2|<h3|<section)/gi, '$1')
        .replace(/(<\/div>|<\/ul>|<\/h2>|<\/h3>|<\/section>)\s*<\/p>/gi, '$1')
        .replace(/<p><\/p>/gi, '');

    // Now wrap it in a pure, responsive, print-friendly markdown-like HTML structure
    const cleanDoc = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@300;400;700&family=Inter:wght@400;600&display=swap');
            @page { margin: 1in; }
            body {
                font-family: 'Inter', sans-serif;
                color: #111827;
                line-height: 1.6;
                font-size: 11pt;
                max-width: 800px;
                margin: 0 auto;
                padding: 2em;
                background: #FFFFFF;
            }
            h1 { font-family: 'Merriweather', serif; font-size: 24pt; color: #111827; margin-bottom: 0.5em; line-height: 1.2; }
            h2, h3 { font-family: 'Inter', sans-serif; color: #1F2937; margin-top: 2em; margin-bottom: 0.5em; page-break-after: avoid; border-bottom: 2px solid #E5E7EB; padding-bottom: 5px; }
            .excerpt { font-size: 13pt; font-style: italic; color: #4B5563; border-left: 4px solid #3B82F6; padding-left: 1em; margin-bottom: 2em; }
            p, li { orphans: 3; widows: 3; margin-bottom: 1em; }
            ul { margin-bottom: 1em; padding-left: 2em; }
            table { width: 100%; border-collapse: collapse; margin: 1.5em 0; page-break-inside: avoid; }
            th { text-align: left; padding: 10px; background-color: #F3F4F6; border-bottom: 2px solid #D1D5DB; font-weight: 600; }
            td { padding: 10px; border-bottom: 1px solid #E5E7EB; }
            strong { font-weight: 600; }
            .institutional-section { margin-bottom: 3em; }
        </style>
    </head>
    <body>
        <h1>${title}</h1>
        <div class="excerpt">${excerpt}</div>
        ${body}
    </body>
    </html>
    `;

    const tempPath = path.join(__dirname, '../articles/weekly/temp_clean_print.html');
    fs.writeFileSync(tempPath, cleanDoc);
    return tempPath;
}

async function generatePDFs() {
    const weeklyHtml = await getLatestFile(path.join(__dirname, '../articles/weekly'));
    
    if (!weeklyHtml) {
        console.log("No content to convert.");
        return;
    }

    // 1. Extract and Clean HTML into a temporary pristine file
    const cleanHtmlPath = await extractAndCleanHtml(weeklyHtml);

    // 2. Render PDF from the perfectly clean HTML
    const browser = await puppeteer.launch({ headless: "new" });
    const outputDir = '/Users/nandadulaldutta/.gemini/antigravity/brain/e6ec49bb-f90f-4b55-a43a-5dfcb780edf8';

    console.log("Generating Unbreakable Clean Weekly PDF from:", cleanHtmlPath);
    const page = await browser.newPage();
    await page.goto(`file://${cleanHtmlPath}`, { waitUntil: 'networkidle0' });
    
    await page.emulateMediaType('print');
    
    const outPath = path.join(outputDir, 'BlogsPro_Weekly_Briefing_Clean.pdf');
    await page.pdf({ 
        path: outPath, 
        format: 'A4', 
        printBackground: true
    });
    console.log("Created", outPath);

    await browser.close();
    
    // Cleanup temp
    fs.unlinkSync(cleanHtmlPath);
}

generatePDFs().catch(console.error);
