#!/usr/bin/env node
/**
 * ECC Secret Scanner — Antigravity-Native
 * Rebuilt from everything-claude-code secret detection hooks.
 * 
 * Usage:
 *   node .claude/hooks-antigravity/secret-scanner.js [path...]
 *   npm run ecc:secret-scan
 * 
 * Scans files for hardcoded API keys, tokens, and secrets.
 * Returns exit code 1 if any secrets are found.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const args = process.argv.slice(2);
const targetPaths = args.length > 0 ? args : ['.'];

const COLORS = {
  red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m',
  cyan: '\x1b[36m', bold: '\x1b[1m', reset: '\x1b[0m',
};

const SECRET_PATTERNS = [
  { name: 'OpenAI/Anthropic Key', pattern: /sk-[a-zA-Z0-9]{20,}/ },
  { name: 'GitHub PAT', pattern: /ghp_[a-zA-Z0-9]{36}/ },
  { name: 'GitHub App Token', pattern: /ghs_[a-zA-Z0-9]{36}/ },
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'Resend API Key', pattern: /re_[a-zA-Z0-9]{20,}/ },
  { name: 'Sentry Token', pattern: /sntrys_[a-zA-Z0-9]{20,}/ },
  { name: 'Slack Bot Token', pattern: /xoxb-[0-9]{10,}/ },
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Stripe Live Key', pattern: /sk_live_[a-zA-Z0-9]{24,}/ },
  { name: 'SendGrid Key', pattern: /SG\.[a-zA-Z0-9_-]{22}\./ },
  { name: 'Firebase Key', pattern: /firebase[a-zA-Z]*['":\s]*AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Private Key Block', pattern: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/ },
  { name: 'JWT Token', pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\./ },
  { name: 'Telegram Bot Token', pattern: /[0-9]{8,10}:[a-zA-Z0-9_-]{35}/ },
];

const SKIP_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.gz', '.tar'];
const SKIP_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.env.example', 'secret-scanner.js'];
const SKIP_DIRS = ['node_modules', '.git', 'dist', '.claude/hooks-antigravity'];

let totalSecrets = 0;

console.log(`${COLORS.cyan}${COLORS.bold}🔍 ECC Secret Scanner${COLORS.reset}\n`);

function scanDir(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(ROOT, fullPath);

      if (SKIP_DIRS.some(d => relPath.startsWith(d) || entry.name === d)) continue;

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else {
        if (SKIP_EXTENSIONS.some(ext => entry.name.endsWith(ext))) continue;
        if (SKIP_FILES.includes(entry.name)) continue;

        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            for (const { name, pattern } of SECRET_PATTERNS) {
              if (pattern.test(lines[i])) {
                // Skip if it's a pattern reference (like in comments/docs about the pattern)
                if (/pattern|regex|example|test|mock|fake|dummy/i.test(lines[i])) continue;
                // Skip env var references (${VAR} style)
                if (/\$\{[A-Z_]+\}/.test(lines[i])) continue;

                console.log(`${COLORS.red}✗ ${name}${COLORS.reset}`);
                console.log(`  ${COLORS.cyan}File: ${relPath}:${i + 1}${COLORS.reset}`);
                const preview = lines[i].trim().substring(0, 80);
                console.log(`  ${preview}${lines[i].trim().length > 80 ? '...' : ''}`);
                console.log('');
                totalSecrets++;
              }
            }
          }
        } catch (e) { /* skip unreadable files */ }
      }
    }
  } catch (e) { /* skip unreadable dirs */ }
}

for (const target of targetPaths) {
  const resolved = path.resolve(ROOT, target);
  const stat = fs.statSync(resolved, { throwIfNoEntry: false });
  if (!stat) continue;
  if (stat.isDirectory()) scanDir(resolved);
  else scanDir(path.dirname(resolved)); // scan just the file's dir
}

console.log(`${COLORS.bold}━━━ Result ━━━${COLORS.reset}`);
if (totalSecrets > 0) {
  console.log(`${COLORS.red}${COLORS.bold}✗ ${totalSecrets} potential secret(s) found${COLORS.reset}`);
  process.exit(1);
} else {
  console.log(`${COLORS.green}${COLORS.bold}✓ No secrets detected${COLORS.reset}`);
  process.exit(0);
}
