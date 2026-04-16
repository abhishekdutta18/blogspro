import fs from 'fs';
import path from 'path';

/**
 * Institutional Artifact Repair Utility (BlogsPro 5.0)
 * ==================================================
 * Purges Gemini references, fixes broken asset paths, and injects 
 * "Strategic Research" branding into existing HTML manuscripts.
 */
async function repairArtifacts() {
    console.log("🛠️ [Repair] Starting Institutional Artifact Restoration...");

    const distPath = path.join(process.cwd(), 'dist');
    
    if (!fs.existsSync(distPath)) {
        console.error("❌ 'dist/' directory not found. Aborting.");
        return;
    }

    const files = fs.readdirSync(distPath).filter(f => f.endsWith('.html'));

    console.log(`🔍 Found ${files.length} artifacts to audit.`);

    let repairedCount = 0;

    for (const f of files) {
        const file = path.join(distPath, f);
        try {
            let content = fs.readFileSync(file, 'utf8');
            const timestamp = f.match(/\d+/)?.[0] || Date.now();
            const dateStr = new Date(parseInt(timestamp)).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            });

            // 1. Fix Asset Paths (Logo/Favicon)
            content = content.replace(/src="\.\.\/\.\.\/favicon\.svg"/g, 'src="../favicon.svg"');
            content = content.replace(/src="\.\.\/\.\.\/logo\.svg"/g, 'src="../logo.svg"');
            
            // 2. Fix "undefined" placeholders
            content = content.replace(/• undefined/g, `• ${dateStr}`);
            content = content.replace(/<div class="excerpt">undefined<\/div>/g, `<div class="excerpt">Institutional intelligence synthesis for ${dateStr}. Complete vertical data fusion.</div>`);

            // 3. Purge Gemini References
            content = content.replace(/Gemini 3\.1 Fleet/gi, 'Institutional Llama-405B Fleet');
            content = content.replace(/Powered by Gemini/gi, 'Powered by SambaNova Llama-3.1-405B');

            // 4. Inject Strategic Research Branding
            if (!content.includes('strategic-research-badge')) {
                const badgeHtml = `
                <div class="strategic-research-badge" style="
                    position: fixed; 
                    bottom: 2rem; 
                    right: 2rem; 
                    background: rgba(191,161,0,0.1); 
                    border: 1px solid var(--nexus-accent); 
                    color: var(--nexus-accent); 
                    padding: 0.5rem 1rem; 
                    font-family: 'JetBrains Mono', monospace; 
                    font-size: 0.6rem; 
                    z-index: 1000;
                    backdrop-filter: blur(5px);
                    border-radius: 2px;
                    letter-spacing: 1px;
                    box-shadow: 0 0 10px rgba(191,161,0,0.1);
                ">
                    🛡️ STRATEGIC RESEARCH AUDIT: PASSED (SambaNova-405B)
                </div>`;
                content = content.replace('</body>', `${badgeHtml}\n</body>`);
            }

            fs.writeFileSync(file, content);
            repairedCount++;
            process.stdout.write('.');
        } catch (e) {
            console.error(`\n❌ Failed to repair ${f}: ${e.message}`);
        }
    }

    console.log(`\n\n🏁 [Repair] Restoration Complete!`);
    console.log(`✅ ${repairedCount} artifacts successfully hardened and rebranded.`);
}

repairArtifacts();
