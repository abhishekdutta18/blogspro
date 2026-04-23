#!/usr/bin/env node
/**
 * ECC Design Quality Check — Antigravity-Native
 * Rebuilt from everything-claude-code design-quality-check.js
 * 
 * Warns when frontend edits drift toward generic template-looking UI.
 * 
 * Usage:
 *   node .claude/hooks-antigravity/design-quality-check.cjs [path...]
 *   npm run ecc:design-check
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const ANTI_PATTERNS = [
    { name: 'Generic Bootstrap color', pattern: /(?:btn-primary|btn-danger|btn-success|btn-warning|bg-primary|bg-danger)/gi, weight: 2 },
    { name: 'Lorem ipsum placeholder', pattern: /lorem\s+ipsum/gi, weight: 5 },
    { name: 'Default border-radius (no design system)', pattern: /border-radius:\s*(?:3px|4px|5px|0\.25rem|0\.3rem)\s*;/g, weight: 1 },
    { name: 'Unstyled form (no custom CSS)', pattern: /<form[^>]*>(?:(?!class=)[^<])*<input/gi, weight: 3 },
    { name: 'Stock placeholder image', pattern: /(?:via\.placeholder\.com|placehold\.it|picsum\.photos|placeholder\.com)/gi, weight: 4 },
    { name: 'Generic "Click here" text', pattern: />\s*click\s+here\s*</gi, weight: 2 },
    { name: 'Default system font', pattern: /font-family:\s*(?:Arial|Helvetica|Times New Roman|serif|sans-serif)\s*;/gi, weight: 1 },
];

function checkFile(filePath) {
    const findings = [];
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const rel = path.relative(ROOT, filePath);
        
        for (const ap of ANTI_PATTERNS) {
            const re = new RegExp(ap.pattern.source, ap.pattern.flags);
            let match;
            while ((match = re.exec(content)) !== null) {
                const line = content.substring(0, match.index).split('\n').length;
                findings.push({
                    file: rel, line, name: ap.name,
                    weight: ap.weight, snippet: match[0].substring(0, 40)
                });
            }
        }
    } catch {}
    return findings;
}

let targets = process.argv.slice(2);
if (targets.length === 0) targets = ['index.html', 'css', 'js'];

const files = [];
for (const t of targets) {
    const full = path.resolve(ROOT, t);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (stat.isFile() && /\.(html|css|js|jsx|tsx|vue|svelte)$/.test(full)) {
        files.push(full);
    } else if (stat.isDirectory()) {
        const walk = (d) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const f = path.join(d, e.name);
                if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') walk(f);
                else if (e.isFile() && /\.(html|css|js|jsx|tsx|vue|svelte)$/.test(e.name)) files.push(f);
            }
        };
        walk(full);
    }
}

let totalScore = 0;
const all = [];
for (const f of files) {
    const findings = checkFile(f);
    all.push(...findings);
    totalScore += findings.reduce((s, f) => s + f.weight, 0);
}

console.log('🎨 ECC Design Quality Check\n');
if (all.length === 0) {
    console.log('✅ No generic template anti-patterns detected.');
} else {
    console.log(`⚠️ Found ${all.length} design anti-patterns (score: ${totalScore}):\n`);
    for (const f of all.slice(0, 20)) {
        console.log(`   ${'⚠️'.repeat(Math.min(f.weight, 3))} ${f.file}:${f.line} — ${f.name}`);
    }
    if (totalScore > 15) {
        console.log('\n   🔴 HIGH template drift — consider a design review.');
    }
}
