const fs = require('fs');
const path = require('path');

const LEDGER_PATH = path.join(__dirname, '../../knowledge/ai-feedback.json');
const HEARTBEAT_PATH = path.join(__dirname, '../../knowledge/rl-heartbeat.json');
const MAX_ENTRIES = 1500;

class ReinforcementSystem {
    constructor() {
        this.ledger = [];
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(LEDGER_PATH)) {
                this.ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
            }
        } catch (e) {
            this.ledger = [];
        }
    }

    save() {
        try {
            if (this.ledger.length > MAX_ENTRIES) this.ledger = this.ledger.slice(-MAX_ENTRIES);
            const dir = path.dirname(LEDGER_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(LEDGER_PATH, JSON.stringify(this.ledger, null, 2), 'utf8');
        } catch (e) {}
    }

    updateHeartbeat(current, total, totalSuccess, totalFail) {
        try {
            const hb = {
                active: true,
                timestamp: new Date().toISOString(),
                current,
                total,
                totalSuccess,
                totalFail,
                rate: total > 0 ? ((totalSuccess / current) * 100).toFixed(1) : 0
            };
            const dir = path.dirname(HEARTBEAT_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(HEARTBEAT_PATH, JSON.stringify(hb, null, 2), 'utf8');
        } catch (e) {}
    }

    stopHeartbeat() {
        try {
            if (fs.existsSync(HEARTBEAT_PATH)) {
                const hb = JSON.parse(fs.readFileSync(HEARTBEAT_PATH, 'utf8'));
                hb.active = false;
                fs.writeFileSync(HEARTBEAT_PATH, JSON.stringify(hb, null, 2), 'utf8');
            }
        } catch (e) {}
    }

    logSuccess(task, pattern, output) {
        this.ledger.push({
            type: 'SUCCESS',
            timestamp: new Date().toISOString(),
            task,
            pattern: pattern || 'Perfect structural execution',
            preview: output ? output.substring(0, 500) : null
        });
        this.save();
    }

    logFailure(task, failures, output) {
        this.ledger.push({
            type: 'FAILURE',
            timestamp: new Date().toISOString(),
            task,
            failures: failures || [],
            preview: output ? output.substring(0, 500) : null
        });
        this.save();
    }

    getGoldStandard() {
        return `
[GOLD STANDARD EXAMPLE - COPY THIS STRUCTURE]
<h2>Global Macro Drift</h2>
<details id="meta-excerpt" style="display:none">DXY volatility pivots as Fed signals termination of the tightening cycle, triggering institutional capital rotation.</details>

The current macro-economic landscape reflects a significant systemic shift...

| Metric | Observation | Alpha Impact |
|:-------|:------------|:-------------|
| DXY Index | 104.2 (Consolidating) | Bearish for EM FX |
| US 10Y Yield | 4.25% (Yield Drift) | Tightening Credit Spreads |
| FII Inflow | $2.4B (Weekly) | Nifty Liquidity Support |
| Brent Crude | $82.5 (Stable) | Inflationary Moderation |
| India GDP | 7.2% (Institutional) | Sovereign Premium Hike |

SENTIMENT_SCORE: 82 | POLL: Best hedge? | OPTIONS: Gold, USD, BTC
<chart-data>[["DXY", 104.0], ["10Y", 4.25], ["GDP", 7.20]]</chart-data>
`;
    }

    getReinforcementContext() {
        const recent = this.ledger.slice(-500);
        const failureCounts = {};
        const successes = [];

        recent.forEach(entry => {
            if (entry.type === 'FAILURE') {
                entry.failures.forEach(f => {
                    failureCounts[f] = (failureCounts[f] || 0) + 1;
                });
            } else {
                successes.push(entry.task);
            }
        });

        const topMistakes = Object.entries(failureCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        let context = "\n[REINFORCEMENT LEARNING: SYSTEM MEMORY]\n";
        
        if (topMistakes.length > 0) {
            context += "CRITICAL MISTAKES TO AVOID (Based on recent rejections):\n";
            topMistakes.forEach(([f, count]) => {
                let formattedF = f;
                if (f.includes('JSON_SYNTAX_ERROR')) {
                    formattedF = "INVALID JSON_SYNTAX: You are using single quotes or missing double quotes around labels (e.g., use [[\"Label\", 10]] not [[Label, 10]]). Use strictly valid JSON.";
                }
                context += `- REJECTED ${count}x recently for: ${formattedF}\n`;
            });
        }

        context += this.getGoldStandard();

        // HARD-CODED INSTITUTIONAL LESSONS (From PDF QA Inspection, 2026-03-29)
        context += `
[CRITICAL PRODUCTION RULES - NON-NEGOTIABLE]:
1. NEVER include <rule-check> tags in your output. These are internal system tags only.
2. NEVER output raw JSON objects like {"sentiment": [...]} in the article body. Chart data ONLY goes inside <chart-data> tags at the very end.
3. The <chart-data> block MUST appear only ONCE, at the very end of your output, after all prose.
4. DO NOT copy or repeat any system prompt text ("JSON must use DOUBLE QUOTES") into the article.
5. All markdown hyperlinks [text](url) MUST be used for citations. Do not embed raw URLs.
`;

        return context;
    }
}

module.exports = new ReinforcementSystem();
