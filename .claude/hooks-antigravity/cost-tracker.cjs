#!/usr/bin/env node
/**
 * ECC Cost Tracker — Antigravity-Native
 * Rebuilt from everything-claude-code cost-tracker.js
 * 
 * Tracks session duration, file changes, and pipeline runs as cost proxies.
 * 
 * Usage:
 *   node .claude/hooks-antigravity/cost-tracker.cjs [record|report]
 *   npm run ecc:cost-tracker
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const STORE = path.join(ROOT, '.claude', 'hooks-antigravity', 'learning-store');
const COST_FILE = path.join(STORE, 'cost-metrics.jsonl');

function ensure() { if (!fs.existsSync(STORE)) fs.mkdirSync(STORE, { recursive: true }); }

function record() {
    ensure();
    const { execSync } = require('child_process');
    
    // Count recently modified files
    let modifiedFiles = 0;
    try {
        modifiedFiles = execSync('git diff --name-only 2>/dev/null | wc -l', { encoding: 'utf8', cwd: ROOT }).trim();
    } catch {}
    
    // Count lines changed
    let linesChanged = 0;
    try {
        const stat = execSync('git diff --shortstat 2>/dev/null', { encoding: 'utf8', cwd: ROOT }).trim();
        const nums = stat.match(/\d+/g) || [];
        linesChanged = nums.reduce((s, n) => s + parseInt(n, 10), 0);
    } catch {}
    
    const entry = {
        timestamp: new Date().toISOString(),
        filesModified: parseInt(modifiedFiles, 10) || 0,
        linesChanged,
        distFiles: (() => {
            try { return fs.readdirSync(path.join(ROOT, 'dist')).filter(f => f.endsWith('.html')).length; } catch { return 0; }
        })()
    };
    
    fs.appendFileSync(COST_FILE, JSON.stringify(entry) + '\n');
    console.log(`📊 Cost metric recorded: ${entry.filesModified} files, ${entry.linesChanged} lines, ${entry.distFiles} manuscripts`);
}

function report() {
    ensure();
    if (!fs.existsSync(COST_FILE)) { console.log('No cost metrics recorded.'); return; }
    
    const entries = fs.readFileSync(COST_FILE, 'utf8').trim().split('\n').filter(Boolean)
        .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    
    const totalFiles = entries.reduce((s, e) => s + e.filesModified, 0);
    const totalLines = entries.reduce((s, e) => s + e.linesChanged, 0);
    const totalManuscripts = entries.reduce((s, e) => s + e.distFiles, 0);
    
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  📊 ECC Cost Tracker — Report                 ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  Sessions tracked: ${entries.length}`);
    console.log(`║  Total files modified: ${totalFiles}`);
    console.log(`║  Total lines changed: ${totalLines}`);
    console.log(`║  Manuscripts generated: ${totalManuscripts}`);
    if (entries.length > 0) {
        console.log(`║  First tracked: ${entries[0].timestamp}`);
        console.log(`║  Last tracked: ${entries[entries.length - 1].timestamp}`);
    }
    console.log('╚══════════════════════════════════════════════╝');
}

const action = process.argv[2] || 'report';
if (action === 'record') record(); else if (action === 'report') report();
else { console.error(`Use 'record' or 'report'.`); process.exit(1); }
