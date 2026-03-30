/**
 * BlogsPro Reinforcement Learning System (Serverless Version)
 * ==========================================================
 * Aggregates all quality events into Cloudflare KV ledger.
 */

const MAX_ENTRIES = 500;
const COLLECTION = 'ai_reinforcement_ledger';

class ReinforcementSystem {
    constructor() {
        this.ledger = [];
    }

    /**
     * Sync a single entry to Firestore (REST)
     */
    async syncEntry(entry, env) {
        if (!env || !env.FIREBASE_PROJECT_ID) return;
        
        const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${COLLECTION}`;
        
        // Transform to Firestore format
        const fields = {
            type: { stringValue: entry.type },
            timestamp: { timestampValue: entry.timestamp },
            task: { stringValue: entry.task },
            pattern: { stringValue: entry.pattern || "" },
            preview: { stringValue: entry.preview ? entry.preview.substring(0, 1000) : "" }
        };

        if (entry.failures && Array.isArray(entry.failures)) {
            fields.failures = { arrayValue: { values: entry.failures.map(f => ({ stringValue: f })) } };
        }

        try {
            await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fields })
            });
        } catch (e) {
            console.error("⚠️ RL Sync Fail:", e.message);
        }
    }

    /**
     * Load recent ledger entries from Firestore (REST runQuery)
     */
    async load(env = null) {
        if (!env || !env.FIREBASE_PROJECT_ID) return;

        const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;
        const query = {
            structuredQuery: {
                from: [{ collectionId: COLLECTION }],
                orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }],
                limit: MAX_ENTRIES
            }
        };

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(query)
            });
            const results = await res.json();
            
            this.ledger = (results || [])
                .filter(r => r.document)
                .map(r => {
                    const fields = r.document.fields;
                    return {
                        type: fields.type?.stringValue,
                        timestamp: fields.timestamp?.timestampValue,
                        task: fields.task?.stringValue,
                        pattern: fields.pattern?.stringValue,
                        failures: fields.failures?.arrayValue?.values?.map(v => v.stringValue) || [],
                        preview: fields.preview?.stringValue
                    };
                });
        } catch (e) {
            console.error("⚠️ RL Load Fail:", e.message);
        }
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
                }
                context += `- AUTO-CORRECTED ${count}x by QA Gate for: ${formattedF}\n`;
            });
        }

        context += this.getGoldStandard();
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
