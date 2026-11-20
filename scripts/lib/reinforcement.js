import { listDocuments, saveDocument } from './vps-store.js';

const MAX_ENTRIES = 500;
const COLLECTION = 'ai_reinforcement_ledger';
const PREVIEW_LIMIT = 1000;

/**
 * Reinforcement ledger: every validator success/failure is stored in the
 * ai_reinforcement_ledger collection on the BlogsPro API, and the newest
 * MAX_ENTRIES are loaded back to steer later generations.
 */
class ReinforcementSystem {
    constructor() {
        this.ledger = [];
    }

    async syncEntry(entry, env = {}) {
        await saveDocument(COLLECTION, {
            type: entry.type,
            timestamp: entry.timestamp,
            task: entry.task,
            pattern: entry.pattern || "",
            failures: Array.isArray(entry.failures) ? entry.failures : [],
            preview: entry.preview ? String(entry.preview).substring(0, PREVIEW_LIMIT) : ""
        }, env, null);
    }

    async load(env = {}) {
        const entries = await listDocuments(COLLECTION, { orderBy: 'timestamp desc', limit: MAX_ENTRIES }, env);
        if (entries.length > 0) this.ledger = entries;
    }


    async logSuccess(task, pattern, output, env = null) {
        const entry = {
            type: 'SUCCESS',
            timestamp: new Date().toISOString(),
            task,
            pattern: pattern || 'Perfect structural execution',
            preview: output ? output.substring(0, 1000) : null
        };
        this.ledger.push(entry);
        if (env) await this.syncEntry(entry, env);
    }

    async logFailure(task, failures, output, env = null) {
        const entry = {
            type: 'FAILURE',
            timestamp: new Date().toISOString(),
            task,
            failures: failures || [],
            preview: output ? output.substring(0, 1000) : null
        };
        this.ledger.push(entry);
        if (env) await this.syncEntry(entry, env);
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

    async getReinforcementContext(env = null) {
        await this.load(env);
        const recent = this.ledger.slice(-500);
        const failureCounts = {};

        recent.forEach(entry => {
            if (entry.type === 'FAILURE') {
                (entry.failures || []).forEach(f => {
                    failureCounts[f] = (failureCounts[f] || 0) + 1;
                });
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
                } else if (f === 'QA_COLOR_VIOLATION') {
                    formattedF = 'COLOR CONSTRAINT VIOLATION: You used colors outside the approved 3-color palette (Gold, Slate, Muted Gray). DO NOT use red, green, or blue in tables or text.';
                } else if (f === 'QA_TABLE_MALFORMATION') {
                    formattedF = 'TABLE MALFORMATION: Your markdown tables are missing pipes or consistent columns. Use strict | Column 1 | Column 2 | format to ensure visual repair works.';
                }
                context += `- AUTO-CORRECTED ${count}x by QA Gate for: ${formattedF}\n`;
            });
        }

        context += this.getGoldStandard();
        context += `
[CRITICAL PRODUCTION RULES - NON-NEGOTIABLE]:
1. TOTAL-FIDELITY JSON: Your <chart-data> MUST use "double quotes" for categories and values (e.g. [["USA", 10]] not [USA, 10]). NO trailing commas.
2. 3-COLOR INSTITUTIONAL AESTHETIC: Strictly use Gold (#BFA100) for headers/deltas, Slate (#F8FAFC) for importance, and Muted Carbon (#94A3B8) for narrative. NO OTHER COLORS.
3. TABLE RESILIENCE: Headers must be clearly piped. Even if data is sparse, maintain the | col | col | structure.
4. 16-VERTICAL HIERARCHY: Each chapter must start with exactly one <h2> title from the approved list of 16 verticals.
5. NEVER include <rule-check> tags or system prompt artifacts in the prose.
6. The <chart-data> block MUST appear only ONCE, at the very end of your response.
`;
        return context;
    }

    async getAuditSummary(lookback = 50, env = null) {
        await this.load(env);
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

const rl = new ReinforcementSystem();
export { rl as default, ReinforcementSystem };
