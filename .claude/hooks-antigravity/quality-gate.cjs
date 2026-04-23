#!/usr/bin/env node
/**
 * ECC Quality Gate — Antigravity-Native
 * Rebuilt from everything-claude-code quality-gate.js
 * 
 * Usage:
 *   node .claude/hooks-antigravity/quality-gate.js [path...]
 *   npm run ecc:quality-gate
 *   npm run ecc:quality-gate -- scripts/lib/
 * 
 * Checks:
 *   1. Console.log detection in JS/TS files
 *   2. TODO/FIXME/HACK counter
 *   3. Large file detection (>500 lines)
 *   4. Duplicate import detection
 *   5. .env leak detection
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const args = process.argv.slice(2);
const targetPaths = args.length > 0 ? args : ['.'];

const COLORS = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

let warnings = 0;
let errors = 0;

console.log(`${COLORS.cyan}${COLORS.bold}🛡️  ECC Quality Gate${COLORS.reset}\n`);

// Collect JS/TS files
function collectFiles(dir, extensions = ['.js', '.ts', '.jsx', '.tsx', '.mjs']) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.claude') continue;
      if (entry.isDirectory()) {
        results.push(...collectFiles(fullPath, extensions));
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  } catch (e) { /* skip unreadable dirs */ }
  return results;
}

for (const target of targetPaths) {
  const resolvedTarget = path.resolve(ROOT, target);
  const stat = fs.statSync(resolvedTarget, { throwIfNoEntry: false });
  if (!stat) { console.log(`${COLORS.yellow}⚠ Path not found: ${target}${COLORS.reset}`); continue; }

  const files = stat.isDirectory() ? collectFiles(resolvedTarget) : [resolvedTarget];

  for (const file of files) {
    const relPath = path.relative(ROOT, file);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    const issues = [];

    // Skip test files for console.log check
    const isTest = /\.(test|spec)\.|__tests__/.test(relPath);

    // 1. Console.log
    if (!isTest) {
      const consoleLogs = lines.reduce((acc, line, i) => {
        if (/console\.(log|debug|info)\(/.test(line) && !/\/\//.test(line.split('console')[0])) {
          acc.push(i + 1);
        }
        return acc;
      }, []);
      if (consoleLogs.length > 0) {
        issues.push(`${COLORS.yellow}console.log on lines: ${consoleLogs.join(', ')}${COLORS.reset}`);
        warnings += consoleLogs.length;
      }
    }

    // 2. TODO/FIXME/HACK
    const todos = lines.reduce((acc, line, i) => {
      if (/\b(TODO|FIXME|HACK|XXX)\b/.test(line)) acc.push(i + 1);
      return acc;
    }, []);
    if (todos.length > 3) {
      issues.push(`${COLORS.yellow}${todos.length} TODO/FIXME markers${COLORS.reset}`);
      warnings++;
    }

    // 3. Large file
    if (lines.length > 500 && !relPath.includes('package-lock') && !relPath.includes('.min.')) {
      issues.push(`${COLORS.yellow}Large file: ${lines.length} lines${COLORS.reset}`);
      warnings++;
    }

    // 4. Duplicate imports
    const imports = {};
    lines.forEach((line, i) => {
      const match = line.match(/(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/);
      if (match) {
        const mod = match[1];
        if (imports[mod]) {
          issues.push(`${COLORS.yellow}Duplicate import '${mod}' on lines ${imports[mod]} and ${i + 1}${COLORS.reset}`);
          warnings++;
        } else {
          imports[mod] = i + 1;
        }
      }
    });

    if (issues.length > 0) {
      console.log(`${COLORS.cyan}📄 ${relPath}${COLORS.reset}`);
      issues.forEach(issue => console.log(`   ${issue}`));
    }
  }
}

// 5. .env leak check
console.log(`\n${COLORS.cyan}[Env Check]${COLORS.reset}`);
try {
  const gitFiles = execSync('git ls-files', { encoding: 'utf8', cwd: ROOT }).trim().split('\n');
  const envFiles = gitFiles.filter(f => /^\.env$|^\.env\.(local|production|staging)$/.test(path.basename(f)));
  if (envFiles.length > 0) {
    console.log(`${COLORS.red}✗ .env files tracked by git: ${envFiles.join(', ')}${COLORS.reset}`);
    errors++;
  } else {
    console.log(`${COLORS.green}✓ No .env files tracked${COLORS.reset}`);
  }
} catch (e) {
  console.log(`${COLORS.yellow}⚠ Not a git repo, skipping .env check${COLORS.reset}`);
}

// Summary
console.log(`\n${COLORS.bold}━━━ Summary ━━━${COLORS.reset}`);
if (errors > 0) {
  console.log(`${COLORS.red}${COLORS.bold}✗ ${errors} error(s), ${warnings} warning(s)${COLORS.reset}`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`${COLORS.yellow}${COLORS.bold}⚠ ${warnings} warning(s), 0 errors${COLORS.reset}`);
  process.exit(0);
} else {
  console.log(`${COLORS.green}${COLORS.bold}✓ All checks passed${COLORS.reset}`);
  process.exit(0);
}
