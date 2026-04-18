import fs from 'fs';
import path from 'path';
import { generatePDF } from './lib/pdf-service.js';

/**
 * Institutional PDF Dispatcher (V1.0)
 * Scans for generated manuscripts and produces high-fidelity PDFs.
 */
async function run() {
    const distDir = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(distDir)) {
        console.error("❌ [PDF] 'dist' directory not found. Aborting.");
        process.exit(1);
    }

    // Get the most recent .html file in dist
    const files = fs.readdirSync(distDir)
        .filter(f => f.startsWith('swarm-') && f.endsWith('.html'))
        .map(f => ({ name: f, time: fs.statSync(path.join(distDir, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);

    if (files.length === 0) {
        console.warn("⚠️ [PDF] No institutional manuscripts found in 'dist'.");
        process.exit(0);
    }

    const targetHtml = path.join(distDir, files[0].name);
    const frequency = targetHtml.includes('daily') ? 'daily' : 
                      targetHtml.includes('weekly') ? 'weekly' : 
                      targetHtml.includes('monthly') ? 'monthly' : 'daily';

    console.log(`🚀 [PDF] Found recent manuscript: ${files[0].name}. Commencing Production...`);
    
    try {
        const pdfPath = await generatePDF(targetHtml, frequency);
        if (pdfPath && fs.existsSync(pdfPath)) {
            console.log(`✅ [PDF] Production Complete: ${path.basename(pdfPath)}`);
            
            // Emit GITHUB_OUTPUT for artifact archival
            if (process.env.GITHUB_OUTPUT) {
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `pdf_file=${pdfPath}\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `pdf_name=${path.basename(pdfPath)}\n`);
            }
        }
    } catch (err) {
        console.error(`❌ [PDF] Production Failed:`, err.message);
        process.exit(1);
    }
}

run();
