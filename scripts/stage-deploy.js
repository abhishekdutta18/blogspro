import fs from 'node:fs';
import path from 'node:path';

/**
 * 🏺 [V8.4] BlogsPro Institutional Staging Script
 * Copies root web assets to 'public/' for Firebase Hosting deployment.
 */

const root = process.cwd();
const publicDir = path.join(root, 'public');

// 1. Ensure public/ exists
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    console.log('📂 Created public/ directory');
}

// 2. Assets to copy
const filesToCopy = [
    'admin.html',
    'index.html',
    'login.html',
    'dashboard.html',
    'logo-crop.png',
    'logo.svg',
    'favicon.ico',
    'favicon.png',
    'favicon.svg',
    'manifest.json'
];

const dirsToCopy = [
    'js',
    'css'
];

function copyFolderSync(from, to) {
    if (!fs.existsSync(from)) return;
    if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
    
    fs.readdirSync(from).forEach(element => {
        const stat = fs.lstatSync(path.join(from, element));
        if (stat.isFile()) {
            fs.copyFileSync(path.join(from, element), path.join(to, element));
        } else if (stat.isDirectory()) {
            copyFolderSync(path.join(from, element), path.join(to, element));
        }
    });
}

console.log('🚀 [Staging] Starting asset synchronization...');

filesToCopy.forEach(file => {
    const src = path.join(root, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(publicDir, file));
        console.log(`  ✓ Copied ${file}`);
    } else {
        console.warn(`  ⚠ Skip: ${file} not found`);
    }
});

dirsToCopy.forEach(dir => {
    const src = path.join(root, dir);
    if (fs.existsSync(src)) {
        copyFolderSync(src, path.join(publicDir, dir));
        console.log(`  ✓ Synced ${dir}/ directory`);
    } else {
        console.warn(`  ⚠ Skip: ${dir} not found`);
    }
});

// 3. Dynamic Configuration Injection (V8.5 Hardening)
console.log('📡 [Staging] Generating dynamic production configuration...');
const envPath = path.join(root, '.env');
let configData = {};

if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    raw.split('\n').forEach(line => {
        const [key, ...val] = line.split('=');
        if (key && val.length > 0) {
            const k = key.trim();
            const v = val.join('=').trim().replace(/^'|'$/g, "").replace(/^"|"$/g, "");
            if (['INNGEST_EVENT_KEY', 'INNGEST_URL', 'FIREBASE_PROJECT_ID'].includes(k)) {
                configData[k] = v;
            }
        }
    });
}

const configJs = `/** 🏺 BlogsPro Institutional Production Config (Generated) */
window.DISPATCH_CONFIG = {
    inngestEventKey: "${configData.INNGEST_EVENT_KEY || 'MISSING'}",
    inngestUrl: "${configData.INNGEST_URL || 'https://inn.blogspro.in/e/'}",
    firebaseProjectId: "${configData.FIREBASE_PROJECT_ID || 'blogspro-ai'}",
    generatedAt: "${new Date().toISOString()}"
};
`;

const jsDir = path.join(publicDir, 'js');
if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });
fs.writeFileSync(path.join(jsDir, 'config.js'), configJs);
console.log('  ✓ Generated public/js/config.js');

console.log('✅ [Staging] Assets ready in public/ for deployment');
