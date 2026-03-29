const fs = require('fs');
const path = require('path');

const LEDGER_PATH = path.join(__dirname, '../../knowledge/ai-feedback.json');

/**
 * 🧠 Reinforcement Ledger Manager
 * Tracks past AI failures to prevent them in future runs.
 */
class ReinforcementSystem {
    constructor() {
        this.ledger = [];
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(LEDGER_PATH)) {
                const data = fs.readFileSync(LEDGER_PATH, 'utf8');
                this.ledger = JSON.parse(data);
            }
        } catch (e) {
            console.error('🧠 [RL] Failed to load ledger:', e.message);
            this.ledger = [];
        }
    }

    save() {
        try {
            // Sliding window: keep last 50 events
            if (this.ledger.length > 50) this.ledger = this.ledger.slice(-50);
            
            // Ensure directory exists
            const dir = path.dirname(LEDGER_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            
            fs.writeFileSync(LEDGER_PATH, JSON.stringify(this.ledger, null, 2), 'utf8');
        } catch (e) {
            console.error('🧠 [RL] Failed to save ledger:', e.message);
        }
    }

    logFeedback(task, failures) {
        const entry = {
            timestamp: new Date().toISOString(),
            task: task,
            success: failures.length === 0,
            failures: failures || []
        };
        this.ledger.push(entry);
        this.save();
    }

    /**
     * Analyzes the ledger to find recurring issues.
     * Returns a string to be prepended to the AI prompt.
     */
    getReinforcementContext() {
        // Count failure types in the last 20 events
        const recent = this.ledger.slice(-20);
        const failureCounts = {};
        
        recent.forEach(entry => {
            entry.failures.forEach(f => {
                failureCounts[f] = (failureCounts[f] || 0) + 1;
            });
        });

        const topMistakes = Object.entries(failureCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([f, count]) => `⚠️ Frequency: ${count}x | Problem: ${f}`);

        if (topMistakes.length === 0) return "";

        return `
[REINFORCEMENT LEARNING — LESSONS FROM PREVIOUS SESSIONS]
In the most recent generation attempts, your outputs were REJECTED for these specific reasons.
DO NOT repeat these mistakes in the current task:
${topMistakes.map(m => `- ${m}`).join('\n')}

STRICT COMPLIANCE REQUIRED.
`;
    }
}

module.exports = new ReinforcementSystem();
