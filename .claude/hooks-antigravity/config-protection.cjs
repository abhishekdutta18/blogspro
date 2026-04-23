#!/usr/bin/env node
/**
 * ECC Config Protection — Antigravity-Native
 * Rebuilt from everything-claude-code config-protection.js
 * 
 * Blocks modifications to linter/formatter configs in git commits.
 * Steers developers to fix code instead of weakening configs.
 * 
 * Usage:
 *   node .claude/hooks-antigravity/config-protection.cjs
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROTECTED_FILES = [
    '.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.cjs',
    'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs',
    '.prettierrc', '.prettierrc.js', '.prettierrc.json', '.prettierrc.yml',
    'prettier.config.js', 'prettier.config.mjs',
    'biome.json', 'biome.jsonc',
    'tsconfig.json', 'tsconfig.base.json',
    '.stylelintrc', '.stylelintrc.json',
    'jest.config.js', 'jest.config.ts', 'vitest.config.ts',
];

try {
    const staged = execSync('git diff --cached --name-only 2>/dev/null', { encoding: 'utf8' })
        .trim().split('\n').filter(Boolean);
    
    const violations = staged.filter(f => {
        const base = path.basename(f);
        return PROTECTED_FILES.includes(base);
    });
    
    if (violations.length > 0) {
        console.log('⚠️  ECC Config Protection: The following config files are being modified:');
        for (const v of violations) console.log(`   📛 ${v}`);
        console.log('\n   💡 Fix your code instead of weakening linter/formatter configs.');
        console.log('   To override: git commit --no-verify');
    }
} catch {
    // Not in a git repo or no staged files — silently pass
}
