#!/usr/bin/env node
/**
 * ECC Desktop Notify — Antigravity-Native
 * Rebuilt from everything-claude-code desktop-notify.js
 * 
 * Sends macOS desktop notification when pipeline tasks complete.
 * 
 * Usage:
 *   node .claude/hooks-antigravity/desktop-notify.cjs "Title" "Message"
 *   npm run ecc:notify -- "Pipeline Complete" "Daily pulse generated"
 */

const { execSync } = require('child_process');

const title = process.argv[2] || 'BlogsPro ECC';
const message = process.argv[3] || 'Task completed.';

try {
    // macOS native notification
    const escaped = message.replace(/"/g, '\\"').replace(/'/g, "\\'");
    const titleEsc = title.replace(/"/g, '\\"').replace(/'/g, "\\'");
    execSync(`osascript -e 'display notification "${escaped}" with title "${titleEsc}" sound name "Glass"'`);
    console.log(`🔔 Notification sent: "${title}" — ${message}`);
} catch (e) {
    // Fallback: terminal bell
    process.stdout.write('\x07');
    console.log(`🔔 ${title}: ${message} (desktop notify unavailable)`);
}
