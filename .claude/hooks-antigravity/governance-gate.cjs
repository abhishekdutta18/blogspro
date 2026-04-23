#!/usr/bin/env node
/**
 * ECC Governance Gate — Antigravity-Native
 * Rebuilt from everything-claude-code governance-capture.js
 * 
 * Usage:
 *   node .claude/hooks-antigravity/governance-gate.cjs [scan|report]
 *   npm run ecc:governance
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const STORE = path.join(ROOT, '.claude', 'hooks-antigravity', 'learning-store');
const LOG = path.join(STORE, 'governance-events.jsonl');

const SECRETS = [
    { n: 'AWS Key', p: /AKIA[0-9A-Z]{16}/g },
    { n: 'GitHub Token', p: /ghp_[A-Za-z0-9_]{36,}/g },
    { n: 'Google API Key', p: /AIza[0-9A-Za-z_-]{35}/g },
    { n: 'Slack Token', p: /xox[bpors]-[0-9A-Za-z-]{10,}/g },
    { n: 'Stripe Key', p: /sk_live_[0-9a-zA-Z]{24,}/g },
    { n: 'Private Key', p: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
    { n: 'Sentry DSN', p: /https:\/\/[a-f0-9]{32}@[a-z0-9]+\.ingest\.sentry\.io\/[0-9]+/g },
    { n: 'Resend Key', p: /re_[A-Za-z0-9]{20,}/g },
    { n: 'Generic Secret', p: /(?:password|secret|token|api_key)\s*[=:]\s*["'][^"']{8,}["']/gi },
    { n: 'Bearer Token', p: /Bearer\s+[A-Za-z0-9_-]{20,}/g },
];

function ensure() { if (!fs.existsSync(STORE)) fs.mkdirSync(STORE, { recursive: true }); }

function scanFile(fp) {
    const findings = [];
    try {
        const content = fs.readFileSync(fp, 'utf8');
        const rel = path.relative(ROOT, fp);
        for (const { n, p } of SECRETS) {
            const re = new RegExp(p.source, p.flags);
            let m;
            while ((m = re.exec(content)) !== null) {
                const line = content.substring(0, m.index).split('\n').length;
                findings.push({ type: 'secret', severity: 'critical', name: n, file: rel, line, snippet: m[0].substring(0, 20) + '...' });
            }
        }
    } catch {}
    return findings;
}

function scan() {
    ensure();
    console.log('🔍 ECC Governance Gate — Scanning...\n');
    let files = [];
    for (const dir of ['scripts', 'api', 'workers', 'js']) {
        const d = path.join(ROOT, dir);
        if (!fs.existsSync(d)) continue;
        const walk = (p) => {
            for (const e of fs.readdirSync(p, { withFileTypes: true })) {
                const f = path.join(p, e.name);
                if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') walk(f);
                else if (e.isFile() && /\.(js|mjs|cjs|ts|json|html|py)$/.test(e.name)) files.push(f);
            }
        };
        walk(d);
    }
    console.log(`Scanning ${files.length} source files...`);
    const all = [];
    for (const f of files) all.push(...scanFile(f));
    ensure();
    fs.appendFileSync(LOG, JSON.stringify({ timestamp: new Date().toISOString(), filesScanned: files.length, findings: all.length, details: all.slice(0, 30) }) + '\n');
    if (all.length === 0) { console.log('✅ No governance violations.'); }
    else {
        console.log(`⚠️ Found ${all.length} issues:\n`);
        for (const f of all.slice(0, 20)) console.log(`   ${f.severity === 'critical' ? '🔴' : '🟡'} ${f.file}:${f.line} — ${f.name}`);
    }
}

function report() {
    ensure();
    if (!fs.existsSync(LOG)) { console.log('No governance events.'); return; }
    const events = fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    console.log(`🛡️ Governance: ${events.length} scans | Last: ${events[events.length-1]?.timestamp || 'n/a'}`);
}

const action = process.argv[2] || 'scan';
if (action === 'scan') scan(); else if (action === 'report') report();
else { console.error(`Use 'scan' or 'report'.`); process.exit(1); }
