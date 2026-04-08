import fs from 'fs';
import path from 'path';

/**
 * BlogsPro V5.4 - HTML Repair Utility
 * Migrates legacy HTML files to the clean 2-column aesthetic.
 */

const directoriesToScan = ['dist', 'briefings/daily', 'briefings/weekly', 'briefings/monthly'];

function repairHtmlFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;

    // 1. Remove Sidebar
    if (content.includes('id="sidebar"')) {
        content = content.replace(/<div id="sidebar">[\s\S]*?<\/div>\s*<!-- End Sidebar -->/g, '');
        // Generic fallback if comments aren't used
        content = content.replace(/<div id="sidebar"(?:(?!<\/div>)[\s\S])*<\/div>/g, '');
        modified = true;
    }

    // 2. Fix Smooth Scrolling (Remove Hash Routes)
    if (content.includes('href="#') && !content.includes('href="#"')) {
        content = content.replace(/href="#([a-zA-Z0-9_-]+)"/g, 'onclick="document.getElementById(\'$1\').scrollIntoView({behavior: \'smooth\'}); return false;" href="#"');
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(filePath, content);
        console.log(`✅ Repaired: ${filePath}`);
    }
}

function scanAndRepair() {
    console.log("🛠️ Starting BlogsPro HTML Repair...");
    const rootDir = process.cwd();

    directoriesToScan.forEach(dir => {
        const fullPath = path.join(rootDir, dir);
        if (fs.existsSync(fullPath)) {
            const files = fs.readdirSync(fullPath);
            files.forEach(file => {
                if (file.endsWith('.html')) {
                    repairHtmlFile(path.join(fullPath, file));
                }
            });
        }
    });
    console.log("🏁 Repair Complete.");
}

scanAndRepair();
