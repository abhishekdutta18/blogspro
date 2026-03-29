const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const LEDGER_PATH = path.join(__dirname, '../knowledge/ai-feedback.json');

function pushLearning() {
    console.log("📤 Preparing to push institutional reinforcement learning to GitHub...");
    
    if (!fs.existsSync(LEDGER_PATH)) {
        console.error("❌ Error: No learning ledger found at " + LEDGER_PATH);
        process.exit(1);
    }

    try {
        // Configure git (local repo scope)
        execSync('git config user.name "BlogsPro Bot"', { stdio: 'inherit' });
        execSync('git config user.email "bot@blogspro.in"', { stdio: 'inherit' });

        // Stage the learning
        execSync(`git add ${LEDGER_PATH}`, { stdio: 'inherit' });
        
        // Commit
        const date = new Date().toISOString().split('T')[0];
        execSync(`git commit -m "chore: update ai-feedback ledger ${date} [skip ci]"`, { stdio: 'inherit' });

        // Push
        console.log("🚀 Pushing to origin main...");
        execSync('git pull --rebase origin main', { stdio: 'inherit' });
        execSync('git push origin main', { stdio: 'inherit' });

        console.log("✅ Learning successfully synchronized with GitHub.");
    } catch (e) {
        if (e.message.indexOf('nothing to commit') > -1) {
            console.log("ℹ️ No new learning to commit.");
        } else {
            console.error("❌ Git operations failed:", e.message);
            process.exit(1);
        }
    }
}

pushLearning();
