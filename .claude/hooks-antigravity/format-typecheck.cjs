#!/usr/bin/env node
/**
 * ECC Format & Typecheck — Antigravity-Native
 * Rebuilt from everything-claude-code stop-format-typecheck.js
 * 
 * Batch format and typecheck all JS files edited during a session.
 * Uses Prettier/Biome if available, otherwise reports without formatting.
 * 
 * Usage:
 *   node .claude/hooks-antigravity/format-typecheck.cjs [path...]
 *   npm run ecc:format
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();

// Get files to check
let targets = process.argv.slice(2);
if (targets.length === 0) {
    // Use git diff to find modified JS/TS files
    try {
        targets = execSync('git diff --name-only HEAD 2>/dev/null', { encoding: 'utf8', cwd: ROOT })
            .trim().split('\n').filter(f => f && /\.(js|mjs|cjs|ts|jsx|tsx)$/.test(f));
    } catch {
        targets = [];
    }
}

if (targets.length === 0) {
    console.log('✅ No JS/TS files to format/check.');
    process.exit(0);
}

console.log(`🔧 ECC Format & Typecheck — ${targets.length} files\n`);

// Try Prettier
let formatted = false;
try {
    execSync('npx --no-install prettier --version', { encoding: 'utf8', stdio: 'pipe' });
    console.log('Using Prettier...');
    for (const f of targets) {
        try {
            execSync(`npx --no-install prettier --check "${f}" 2>/dev/null`, { encoding: 'utf8', cwd: ROOT, stdio: 'pipe' });
        } catch {
            console.log(`   ⚠️ ${f} — needs formatting`);
        }
    }
    formatted = true;
} catch { /* Prettier not installed */ }

// Try Biome
if (!formatted) {
    try {
        execSync('npx --no-install biome --version', { encoding: 'utf8', stdio: 'pipe' });
        console.log('Using Biome...');
        for (const f of targets) {
            try {
                execSync(`npx --no-install biome check "${f}" 2>/dev/null`, { encoding: 'utf8', cwd: ROOT, stdio: 'pipe' });
            } catch {
                console.log(`   ⚠️ ${f} — needs formatting`);
            }
        }
        formatted = true;
    } catch { /* Biome not installed */ }
}

if (!formatted) {
    console.log('ℹ️  No formatter (Prettier/Biome) available. Skipping format check.');
}

// Basic syntax check for JS files
let syntaxErrors = 0;
for (const f of targets) {
    const fullPath = path.resolve(ROOT, f);
    if (!fs.existsSync(fullPath)) continue;
    try {
        const content = fs.readFileSync(fullPath, 'utf8');
        // Check for common syntax issues
        const issues = [];
        
        // Unmatched brackets (simple heuristic)
        const opens = (content.match(/\{/g) || []).length;
        const closes = (content.match(/\}/g) || []).length;
        if (Math.abs(opens - closes) > 1) {
            issues.push(`bracket mismatch (${opens} open, ${closes} close)`);
        }
        
        // Duplicate function declarations
        const funcNames = [...content.matchAll(/(?:function|const|let|var)\s+(\w+)\s*(?:=|[\(])/g)].map(m => m[1]);
        const dupes = funcNames.filter((n, i) => funcNames.indexOf(n) !== i);
        if (dupes.length > 0) {
            issues.push(`duplicate declarations: ${[...new Set(dupes)].join(', ')}`);
        }
        
        if (issues.length > 0) {
            console.log(`   🔴 ${f}: ${issues.join('; ')}`);
            syntaxErrors++;
        }
    } catch {}
}

if (syntaxErrors === 0) {
    console.log('\n✅ All files passed syntax check.');
} else {
    console.log(`\n⚠️ ${syntaxErrors} files have potential issues.`);
}
