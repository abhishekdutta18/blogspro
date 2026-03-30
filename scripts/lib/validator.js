/**
 * BlogsPro Institutional Content Auditor (validator.js)
 * ======================================================
 * Phase 1 of the 3-system quality pipeline:
 *
 *   [1] AUDITOR (this file)  — Finds failures, logs to RL
 *   [2] QA GATE (corrector)  — Auto-fixes failures, logs to RL
 *   [3] RE-AUDIT             — Confirms fixes, logs final result to RL
 *
 * Communicates with:
 *   → reinforcement.js : logs every failure/success into ai-feedback.json
 *
 * Used by:
 *   ← content-corrector.js  : calls validateContent() for pre- and post-fix checks
 *   ← generate-briefing.js  : calls in the executeAuditedBriefing loop
 *   ← generate-article.js   : calls in the executeAuditedGeneration loop
 */

import rl from './reinforcement.js';

const fluffRegex = /In this chapter|As reported by|In conclusion|analysis suggests|discussed in the previous|anchor for this chapter|here is the|let's look at|dive into|delve into/i;

/**
 * Validates content against all institutional quality standards.
 * @param {string} content - Raw AI-generated article text
 * @param {object} options - { logToRL: bool, task: string }
 * @returns {string[]} Array of failure strings (empty = pass)
 */
function validateContent(content, options = {}) {
    const { logToRL = false, task = 'AUDITOR_VALIDATION' } = options;
    const failures = [];

    // ── RULE 1: Structural Presence ───────────────────────────────────────────
    if (!/<h2/i.test(content)) failures.push("Missing exactly one <h2> header tag.");
    if (!/<details id="meta-excerpt"/i.test(content)) failures.push("Missing <details id=\"meta-excerpt\"> envelope.");
    if (!/\|.*Metric.*\|/.test(content)) failures.push("Missing the Markdown table with '| Metric | Observation | Alpha Impact |'.");

    // ── RULE 2: Data Density ──────────────────────────────────────────────────
    const tableRows = (content.match(/\|[^|]+\|[^|]+\|[^|]+\|/g) || []).length;
    if (tableRows < 3) failures.push(`Insufficient data density (Found ${tableRows} metrics, need at least 5 for terminal depth).`);

    // ── RULE 3: Institutional Tone — No Conversational Fluff ─────────────────
    if (fluffRegex.test(content)) {
        const match = content.match(fluffRegex)[0];
        failures.push(`TONE VIOLATION: Excessive conversational fluff detected ("${match}"). Use raw institutional data blocks.`);
    }

    // ── RULE 4: Citation Integrity — Min 2 distinct hyperlinked sources ───────
    const citations = (content.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
    if (citations < 2) failures.push(`Verification failure (Found ${citations} hyperlinked citations, need at least 2 distinct sources).`);

    // ── RULE 5: Chart Data Presence & JSON Validity ───────────────────────────
    const chartMatch = content.match(/<chart-data>([\s\S]*?)<\/chart-data>/);
    if (!chartMatch) {
        failures.push("Missing <chart-data> JSON array tag at the very end.");
    } else {
        const raw = chartMatch[1].trim();
        try { JSON.parse(raw); } catch(e) { failures.push(`JSON_SYNTAX_ERROR: ${e.message}`); }
    }

    // ── RULE 6: System Artifact Leakage ──────────────────────────────────────
    if (/<rule-check>/i.test(content)) failures.push("QA_SYSTEM_ARTIFACT: <rule-check> tag found in output.");
    if (/JSON must use DOUBLE QUOTES/i.test(content)) failures.push("QA_SYSTEM_ARTIFACT: System prompt instructions leaked into article body.");

    // ── RL FEEDBACK ───────────────────────────────────────────────────────────
    if (logToRL) {
        if (failures.length > 0) {
            rl.logFailure(task, failures);
        } else {
            rl.logSuccess(task, 'All 6 institutional quality rules passed.');
        }
    }

    return failures;
}

/**
 * Quick pass/fail check without RL logging (used for re-audit after correction).
 * @param {string} content
 * @returns {boolean}
 */
function isContentClean(content) {
    return validateContent(content, { logToRL: false }).length === 0;
}

export { validateContent, isContentClean };
export default { validateContent, isContentClean };
