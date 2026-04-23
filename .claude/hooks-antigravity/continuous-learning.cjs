#!/usr/bin/env node
/**
 * ECC Continuous Learning v2 — Antigravity-Native
 * Rebuilt from everything-claude-code skills/continuous-learning-v2/hooks/observe.sh
 * 
 * Captures observations from tool use and extracts reusable patterns.
 * 
 * Usage:
 *   node .claude/hooks-antigravity/continuous-learning.cjs observe "description"
 *   node .claude/hooks-antigravity/continuous-learning.cjs extract
 *   node .claude/hooks-antigravity/continuous-learning.cjs report
 *   npm run ecc:learn -- observe "Fixed model 404 by using -latest aliases"
 *   npm run ecc:learn -- report
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const STORE_DIR = path.join(PROJECT_ROOT, '.claude', 'hooks-antigravity', 'learning-store');
const OBS_FILE = path.join(STORE_DIR, 'observations.jsonl');
const PATTERNS_FILE = path.join(STORE_DIR, 'patterns.json');

function ensureStore() {
    if (!fs.existsSync(STORE_DIR)) {
        fs.mkdirSync(STORE_DIR, { recursive: true });
    }
}

function observe(description) {
    ensureStore();
    
    const observation = {
        timestamp: new Date().toISOString(),
        description: description,
        cwd: PROJECT_ROOT,
        // Capture git context
        branch: (() => {
            try {
                const { execSync } = require('child_process');
                return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd: PROJECT_ROOT }).trim();
            } catch { return 'unknown'; }
        })(),
        // Capture recently modified files
        recentFiles: (() => {
            try {
                const { execSync } = require('child_process');
                return execSync('git diff --name-only HEAD 2>/dev/null || echo "none"', { encoding: 'utf8', cwd: PROJECT_ROOT })
                    .trim().split('\n').filter(f => f && f !== 'none').slice(0, 10);
            } catch { return []; }
        })()
    };
    
    fs.appendFileSync(OBS_FILE, JSON.stringify(observation) + '\n');
    console.log(`📝 Observation recorded: "${description}"`);
    console.log(`   Branch: ${observation.branch}`);
    console.log(`   Files in flight: ${observation.recentFiles.length}`);
}

function extract() {
    ensureStore();
    
    if (!fs.existsSync(OBS_FILE)) {
        console.log('No observations to extract patterns from.');
        return;
    }
    
    const lines = fs.readFileSync(OBS_FILE, 'utf8').trim().split('\n').filter(Boolean);
    const observations = lines.map(l => {
        try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
    
    if (observations.length === 0) {
        console.log('No valid observations found.');
        return;
    }
    
    // Pattern extraction: group by file type and description keywords
    const patterns = loadPatterns();
    const keywords = {};
    
    for (const obs of observations) {
        const desc = obs.description.toLowerCase();
        
        // Extract action keywords
        const actionWords = ['fix', 'add', 'remove', 'update', 'refactor', 'debug', 'patch', 'harden', 'migrate', 'optimize'];
        for (const word of actionWords) {
            if (desc.includes(word)) {
                if (!keywords[word]) keywords[word] = [];
                keywords[word].push({
                    description: obs.description,
                    timestamp: obs.timestamp,
                    files: obs.recentFiles
                });
            }
        }
        
        // Track file patterns
        for (const file of (obs.recentFiles || [])) {
            const ext = path.extname(file);
            const dir = path.dirname(file);
            const key = `${dir}/*${ext}`;
            if (!patterns.filePatterns) patterns.filePatterns = {};
            if (!patterns.filePatterns[key]) patterns.filePatterns[key] = 0;
            patterns.filePatterns[key]++;
        }
    }
    
    patterns.actionPatterns = keywords;
    patterns.totalObservations = observations.length;
    patterns.lastExtracted = new Date().toISOString();
    
    fs.writeFileSync(PATTERNS_FILE, JSON.stringify(patterns, null, 2));
    console.log(`🧠 Extracted patterns from ${observations.length} observations:`);
    console.log(`   Action categories: ${Object.keys(keywords).length}`);
    console.log(`   File patterns: ${Object.keys(patterns.filePatterns || {}).length}`);
}

function report() {
    ensureStore();
    
    const patterns = loadPatterns();
    const obsCount = (() => {
        try {
            if (!fs.existsSync(OBS_FILE)) return 0;
            return fs.readFileSync(OBS_FILE, 'utf8').trim().split('\n').filter(Boolean).length;
        } catch { return 0; }
    })();
    
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  🧠 ECC Continuous Learning — Report          ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  Total observations: ${obsCount}`);
    console.log(`║  Last extracted: ${patterns.lastExtracted || 'never'}`);
    
    if (patterns.filePatterns) {
        const sorted = Object.entries(patterns.filePatterns)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        console.log('║');
        console.log('║  📁 Most frequently modified paths:');
        for (const [pattern, count] of sorted) {
            console.log(`║     ${count}x  ${pattern}`);
        }
    }
    
    if (patterns.actionPatterns) {
        console.log('║');
        console.log('║  🔧 Action categories:');
        for (const [action, items] of Object.entries(patterns.actionPatterns)) {
            console.log(`║     ${action}: ${items.length} occurrences`);
        }
    }
    
    console.log('╚══════════════════════════════════════════════╝');
}

function loadPatterns() {
    try {
        if (fs.existsSync(PATTERNS_FILE)) {
            return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
        }
    } catch { /* use fallback */ }
    return { filePatterns: {}, actionPatterns: {}, totalObservations: 0 };
}

const action = process.argv[2] || 'report';
const description = process.argv.slice(3).join(' ');

switch (action) {
    case 'observe':
        if (!description) {
            console.error('Usage: continuous-learning.cjs observe "description of what was done"');
            process.exit(1);
        }
        observe(description);
        break;
    case 'extract':
        extract();
        break;
    case 'report':
        report();
        break;
    default:
        console.error(`Unknown action: ${action}. Use 'observe', 'extract', or 'report'.`);
        process.exit(1);
}
