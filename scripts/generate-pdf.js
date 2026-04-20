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

    // [V16.2] Advanced Selection: Prioritize the manuscript matching the CURRENT workflow frequency
    let targetFiles = files;
    const requestedFreq = process.env.INPUT_FREQ || 'daily';
    
    const freqMatch = files.filter(f => f.name.includes(`swarm-${requestedFreq}-`));
    if (freqMatch.length > 0) {
        targetFiles = freqMatch;
        console.log(`📡 [PDF] Targeted Frequency Matched: ${requestedFreq}`);
    } else {
        console.log(`⚠️ [PDF] No exact match for ${requestedFreq}. Falling back to most recent swarm artifact.`);
    }

    const targetHtml = path.join(distDir, targetFiles[0].name);
    const frequency = targetHtml.includes('daily') ? 'daily' : 
                      targetHtml.includes('weekly') ? 'weekly' : 
                      targetHtml.includes('monthly') ? 'monthly' : requestedFreq;

    console.log(`🚀 [PDF] Found recent manuscript: ${targetFiles[0].name}. Commencing Production...`);
    
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
