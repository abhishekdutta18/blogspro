/**
 * BlogsPro Reinforcement Learning System (reinforcement.js)
 * ==========================================================
 * Phase 3 of the 3-system quality pipeline:
 *
 *   [1] AUDITOR (validator.js)   — validates content, logs failures HERE
 *   [2] QA GATE (corrector.js)   — auto-corrects, logs correction codes HERE
 *   [3] THIS FILE (RL ledger)    — aggregates all events, surfaces top mistakes
 *                                   into every future AI generation prompt
 *
 * This creates a self-improving loop: the more generations run,
 * the more specific the model warnings become, until QA corrections → 0.
 */

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
                if (f.includes('JSON_SYNTAX_ERROR') || f === 'QA_CHART_JSON_INVALID') {
                    formattedF = 'CHART-DATA JSON SYNTAX: Your <chart-data> blocks contain invalid JSON (single quotes, missing quotes, trailing commas). Use ONLY double-quoted strings: [["Label", 10]] not \'Label\' or [Label, 10].';
                } else if (f === 'QA_SYSTEM_ARTIFACT') {
                    formattedF = 'SYSTEM ARTIFACT LEAKAGE: You included <rule-check> tags, raw JSON objects {}, or system prompt instructions in the article body. These are NEVER to appear in output.';
                } else if (f === 'QA_BARE_URL') {
                    formattedF = 'BARE URL: You included a raw URL (https://...) without a markdown label. ALWAYS use [Source Name](url) format e.g. [Reuters](https://reuters.com/...)';
                } else if (f === 'QA_CITATION_DEFICIT') {
                    formattedF = 'CITATION DEFICIT: Your article had fewer than 2 distinct hyperlinked sources. Include at least 2 markdown citations from DIFFERENT domains e.g. [Reuters](...) and [RBI](...)';
                } else if (f === 'QA_DUPLICATE_CHART_DATA') {
                    formattedF = 'DUPLICATE CHART-DATA: You emitted <chart-data> blocks more than once. Place exactly ONE <chart-data> block at the very end of your response.';
                }
                context += `- AUTO-CORRECTED ${count}x by QA Gate for: ${formattedF}\n`;
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
    /**
     * Returns a quick pipeline health summary from the last N ledger entries.
     * Used by generators to log/report QA Gate effectiveness.
     */
    getAuditSummary(lookback = 50) {
        const recent = this.ledger.slice(-lookback);
        const qaCycles = recent.filter(e => e.task && e.task.includes('QA_GATE'));
        const passes = qaCycles.filter(e => e.type === 'SUCCESS').length;
        const fails  = qaCycles.filter(e => e.type === 'FAILURE').length;
        const total  = passes + fails;
        return {
            total,
            passes,
            fails,
            passRate: total > 0 ? ((passes / total) * 100).toFixed(1) + '%' : 'N/A',
            ledgerSize: this.ledger.length
        };
    }
}

module.exports = new ReinforcementSystem();
