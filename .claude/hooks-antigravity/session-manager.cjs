#!/usr/bin/env node
/**
 * ECC Session Manager — Antigravity-Native
 * Rebuilt from everything-claude-code session-start-bootstrap.js + session-end.js
 * 
 * Usage:
 *   node .claude/hooks-antigravity/session-manager.cjs start
 *   node .claude/hooks-antigravity/session-manager.cjs end
 *   npm run ecc:session-start
 *   npm run ecc:session-end
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const STORE_DIR = path.join(PROJECT_ROOT, '.claude', 'hooks-antigravity', 'learning-store');
const SESSION_FILE = path.join(STORE_DIR, 'session-history.json');
const CONTEXT_FILE = path.join(STORE_DIR, 'last-context.json');

function ensureStore() {
    if (!fs.existsSync(STORE_DIR)) {
        fs.mkdirSync(STORE_DIR, { recursive: true });
    }
}

function loadJSON(filepath, fallback) {
    try {
        if (fs.existsSync(filepath)) {
            return JSON.parse(fs.readFileSync(filepath, 'utf8'));
        }
    } catch (e) { /* corrupted file, use fallback */ }
    return fallback;
}

function sessionStart() {
    ensureStore();
    const history = loadJSON(SESSION_FILE, { sessions: [] });
    const lastContext = loadJSON(CONTEXT_FILE, null);
    
    const session = {
        id: `session-${Date.now()}`,
        startedAt: new Date().toISOString(),
        endedAt: null,
        filesModified: [],
        toolCalls: 0,
        pipelineRuns: []
    };
    
    history.sessions.push(session);
    
    // Keep only last 50 sessions
    if (history.sessions.length > 50) {
        history.sessions = history.sessions.slice(-50);
    }
    
    fs.writeFileSync(SESSION_FILE, JSON.stringify(history, null, 2));
    
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  🚀 ECC Session Manager — Antigravity        ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  Session: ${session.id}`);
    console.log(`║  Started: ${session.startedAt}`);
    console.log(`║  Total sessions: ${history.sessions.length}`);
    
    if (lastContext) {
        console.log('║  📋 Previous context restored:');
        if (lastContext.lastFiles?.length > 0) {
            console.log(`║     Last modified: ${lastContext.lastFiles.slice(0, 5).join(', ')}`);
        }
        if (lastContext.lastPipeline) {
            console.log(`║     Last pipeline: ${lastContext.lastPipeline}`);
        }
        if (lastContext.observations?.length > 0) {
            console.log(`║     Learned patterns: ${lastContext.observations.length}`);
        }
    }
    
    console.log('╚══════════════════════════════════════════════╝');
    
    // Detect package manager
    const lockFiles = {
        'package-lock.json': 'npm',
        'yarn.lock': 'yarn',
        'pnpm-lock.yaml': 'pnpm',
        'bun.lockb': 'bun'
    };
    
    for (const [lockFile, pm] of Object.entries(lockFiles)) {
        if (fs.existsSync(path.join(PROJECT_ROOT, lockFile))) {
            console.log(`📦 Package manager detected: ${pm}`);
            break;
        }
    }
}

function sessionEnd() {
    ensureStore();
    const history = loadJSON(SESSION_FILE, { sessions: [] });
    
    if (history.sessions.length > 0) {
        const current = history.sessions[history.sessions.length - 1];
        current.endedAt = new Date().toISOString();
        
        // Scan for recently modified files (last 2 hours)
        const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
        const recentFiles = [];
        
        const scanDirs = ['scripts/lib', 'scripts', 'js', 'api', 'workers'];
        for (const dir of scanDirs) {
            const fullDir = path.join(PROJECT_ROOT, dir);
            if (!fs.existsSync(fullDir)) continue;
            try {
                const files = fs.readdirSync(fullDir);
                for (const file of files) {
                    const filePath = path.join(fullDir, file);
                    try {
                        const stat = fs.statSync(filePath);
                        if (stat.isFile() && stat.mtimeMs > twoHoursAgo) {
                            recentFiles.push(path.relative(PROJECT_ROOT, filePath));
                        }
                    } catch (e) { /* skip */ }
                }
            } catch (e) { /* skip */ }
        }
        
        current.filesModified = recentFiles;
        
        // Save context for next session
        const context = {
            lastFiles: recentFiles.slice(0, 10),
            lastPipeline: null,
            savedAt: new Date().toISOString(),
            observations: []
        };
        
        // Check for recent pipeline runs
        const pipelinePatterns = ['dist/swarm-daily-*.html', 'dist/swarm-hourly-*.html'];
        for (const pattern of ['daily', 'hourly', 'weekly', 'monthly']) {
            const distDir = path.join(PROJECT_ROOT, 'dist');
            if (!fs.existsSync(distDir)) continue;
            try {
                const files = fs.readdirSync(distDir)
                    .filter(f => f.includes(`swarm-${pattern}`) && f.endsWith('.html'))
                    .sort()
                    .reverse();
                if (files.length > 0) {
                    const stat = fs.statSync(path.join(distDir, files[0]));
                    if (stat.mtimeMs > twoHoursAgo) {
                        context.lastPipeline = `${pattern}: ${files[0]}`;
                        current.pipelineRuns.push(pattern);
                    }
                }
            } catch (e) { /* skip */ }
        }
        
        // Load learned observations
        const obsFile = path.join(STORE_DIR, 'observations.jsonl');
        if (fs.existsSync(obsFile)) {
            try {
                const lines = fs.readFileSync(obsFile, 'utf8').trim().split('\n').filter(Boolean);
                context.observations = lines.slice(-20).map(l => {
                    try { return JSON.parse(l); } catch { return null; }
                }).filter(Boolean);
            } catch (e) { /* skip */ }
        }
        
        fs.writeFileSync(SESSION_FILE, JSON.stringify(history, null, 2));
        fs.writeFileSync(CONTEXT_FILE, JSON.stringify(context, null, 2));
        
        const duration = current.endedAt && current.startedAt
            ? Math.round((new Date(current.endedAt) - new Date(current.startedAt)) / 1000 / 60)
            : '?';
        
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║  🏁 Session End — Context Persisted           ║');
        console.log('╠══════════════════════════════════════════════╣');
        console.log(`║  Duration: ${duration} minutes`);
        console.log(`║  Files modified: ${recentFiles.length}`);
        console.log(`║  Pipeline runs: ${current.pipelineRuns.join(', ') || 'none'}`);
        console.log('╚══════════════════════════════════════════════╝');
    }
}

const action = process.argv[2] || 'start';
if (action === 'start') {
    sessionStart();
} else if (action === 'end') {
    sessionEnd();
} else {
    console.error(`Unknown action: ${action}. Use 'start' or 'end'.`);
    process.exit(1);
}
