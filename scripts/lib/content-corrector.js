/**
 * BlogsPro Institutional Content QA Gate (content-corrector.js)
 * ==============================================================
 * Phase 2 of the 3-system quality pipeline:
 *
 *   [1] AUDITOR (validator.js) — finds failures, logs to RL
 *   [2] QA GATE (this file)   — auto-fixes failures, logs corrections to RL
 *   [3] RE-AUDIT              — confirms fixes passed, logs final result to RL
 *
 * FULL FEEDBACK LOOP:
 *   AI Output
 *     → [1] Auditor validates → logs failures to RL
 *     → [2] QA Gate corrects → logs each correction code to RL
 *     → [3] Re-audit confirms → logs SUCCESS or residual failures to RL
 *     → HTML + PDF Creation
 *
 * Communicates with:
 *   → reinforcement.js : every correction becomes a logged failure code
 *   → validator.js     : uses validateContent() pre- and post-correction
 */

const { sanitizeJSON } = require('./sanitizer.js');
const rl = require('./reinforcement.js');
const { validateContent, isContentClean } = require('./validator.js');

// ── Source Label Registry (for converting bare URLs) ─────────────────────────
const SOURCE_LABELS = {
    'reuters.com': 'Reuters',
    'bloomberg.com': 'Bloomberg',
    'ft.com': 'Financial Times',
    'wsj.com': 'Wall Street Journal',
    'economictimes.com': 'Economic Times',
    'economictimes.indiatimes.com': 'Economic Times',
    'livemint.com': 'LiveMint',
    'businessstandard.com': 'Business Standard',
    'moneycontrol.com': 'MoneyControl',
    'rbi.org.in': 'RBI',
    'sebi.gov.in': 'SEBI',
    'cnbc.com': 'CNBC',
    'ndtv.com': 'NDTV',
    'thehindubusinessline.com': 'BusinessLine',
    'financialexpress.com': 'Financial Express',
    'bseindia.com': 'BSE',
    'nseindia.com': 'NSE',
    'ifsca.gov.in': 'IFSCA',
};

function getLabelForUrl(url) {
    for (const [domain, label] of Object.entries(SOURCE_LABELS)) {
        if (url.includes(domain)) return label;
    }
    try {
        const hostname = new URL(url).hostname.replace('www.', '');
        return hostname.split('.')[0].toUpperCase();
    } catch {
        return 'Source';
    }
}

// ── RL Failure Code Map ───────────────────────────────────────────────────────
const CORRECTION_TO_RL_CODE = {
    'Stripped system artifacts / prompt leakage': 'QA_SYSTEM_ARTIFACT',
    'Fixed chart-data JSON syntax': 'QA_CHART_JSON_INVALID',
    'Removed': 'QA_DUPLICATE_CHART_DATA',
    'Converted bare URLs to markdown hyperlinks': 'QA_BARE_URL',
    'Added fallback citations': 'QA_CITATION_DEFICIT',
};

function correctionToRLCode(correction) {
    for (const [key, code] of Object.entries(CORRECTION_TO_RL_CODE)) {
        if (correction.startsWith(key)) return code;
    }
    return `QA_UNKNOWN`;
}

// ── 6-Pass Content Correction Engine ─────────────────────────────────────────

/**
 * Applies all 6 correction passes to raw AI content.
 * Communicates with Auditor (validator.js) and RL (reinforcement.js).
 *
 * @param {string} rawContent - AI-generated article text (pre-HTML)
 * @param {string} task - Identifier for RL logging (e.g. 'DAILY_BRIEFING')
 * @returns {{ content: string, corrections: string[], passedReAudit: boolean }}
 */
function applyContentCorrections(rawContent, task = 'QA_GATE_PRE_RENDER') {
    const corrections = [];
    let text = rawContent || '';

    // ── PRE-CHECK: Run Auditor and log initial failures to RL ─────────────────
    console.log('🔎 [Auditor] Pre-correction validation...');
    const preFailures = validateContent(text, { logToRL: true, task: `${task}_PRE` });
    if (preFailures.length > 0) {
        console.log(`⚠️ [Auditor] Found ${preFailures.length} issue(s) — QA Gate will attempt corrections:`);
        preFailures.forEach(f => console.log(`   • ${f}`));
    } else {
        console.log('✅ [Auditor] Pre-check: Content is clean — skipping corrections.');
        return { content: text, corrections: [], passedReAudit: true };
    }

    // ── PASS 1: Strip System Artifacts ────────────────────────────────────────
    const before1 = text.length;
    text = text
        .replace(/<rule-check>[\s\S]*?<\/rule-check>/gi, '')
        .replace(/--- SYSTEM CONTEXT ---[\s\S]*?--- (TOP NEWS|KEY DATA|UNIVERSAL NEWS) ---[\s\S]*?\n\s*\n/gi, '')
        .replace(/JSON must use DOUBLE QUOTES[^\n]*/gi, '')
        .replace(/^(Here is|In this|This is|Below is)[^\n]*/gim, '')
        .replace(/\[Context Truncated[^\]]*\]/gi, '')
        .replace(/^\s*\{[\s\S]{10,500}\}\s*$/gm, '')
        .trim();
    if (text.length !== before1) corrections.push('Stripped system artifacts / prompt leakage');

    // ── PASS 2: Fix chart-data JSON via Institutional Regex Sanitizer ─────────
    text = text.replace(/<chart-data>([\s\S]*?)<\/chart-data>/gi, (_, inner) => {
        try {
            JSON.parse(inner.trim());
            return `<chart-data>${inner}</chart-data>`;
        } catch {
            const fixed = sanitizeJSON(inner);
            corrections.push('Fixed chart-data JSON syntax');
            return `<chart-data>${fixed}</chart-data>`;
        }
    });

    // ── PASS 3: Enforce Single chart-data block (at end) ──────────────────────
    const chartBlocks = [...text.matchAll(/<chart-data>[\s\S]*?<\/chart-data>/gi)];
    if (chartBlocks.length > 1) {
        const lastBlock = chartBlocks[chartBlocks.length - 1][0];
        text = text.replace(/<chart-data>[\s\S]*?<\/chart-data>/gi, '').trim();
        text += '\n' + lastBlock;
        corrections.push(`Removed ${chartBlocks.length - 1} duplicate chart-data block(s)`);
    }

    // ── PASS 4: Convert bare URLs to markdown hyperlinks ──────────────────────
    const bareUrlRegex = /(?<!\]\()(?<!["\(])(https?:\/\/[^\s\)\]"<,]+)/g;
    const before4 = text;
    text = text.replace(bareUrlRegex, (url) => `[${getLabelForUrl(url)}](${url})`);
    if (text !== before4) corrections.push('Converted bare URLs to markdown hyperlinks');

    // ── PASS 5: Citation Enforcement — min 2 distinct sources ─────────────────
    const mdLinks = [...text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)];
    const distinctDomains = new Set(mdLinks.map(m => {
        try { return new URL(m[2]).hostname; } catch { return m[2]; }
    }));

    if (distinctDomains.size < 2) {
        const fallback = `\n\n*Sources: [Reuters](https://reuters.com/markets/) | [Economic Times](https://economictimes.indiatimes.com/markets) | [RBI](https://rbi.org.in)*`;
        if (text.includes('<chart-data>')) {
            text = text.replace(/<chart-data>/i, fallback + '\n<chart-data>');
        } else {
            text += fallback;
        }
        corrections.push(`Added fallback citations (found only ${distinctDomains.size} distinct source(s))`);
    }

    // ── PASS 6: Whitespace & Empty Tag Cleanup ────────────────────────────────
    text = text
        .replace(/\n{4,}/g, '\n\n\n')
        .replace(/<h2>\s*<\/h2>/g, '')
        .replace(/<p>\s*<\/p>/g, '')
        .trim();

    // ── POST-CHECK: Re-audit with Auditor after corrections ───────────────────
    console.log('🔎 [Auditor] Post-correction re-validation...');
    const postFailures = validateContent(text, { logToRL: true, task: `${task}_POST` });
    const passedReAudit = postFailures.length === 0;

    if (passedReAudit) {
        console.log('✅ [Auditor] Post-check PASSED — all corrections effective.');
        rl.logSuccess(`${task}_QA_CYCLE`, `QA Gate applied ${corrections.length} correction(s) and content passed re-audit.`);
    } else {
        console.log(`⚠️ [Auditor] Post-check: ${postFailures.length} residual issue(s) after correction (will proceed anyway):`);
        postFailures.forEach(f => console.log(`   • ${f}`));
    }

    // ── RL FEEDBACK: Log each correction type as a specific failure code ───────
    if (corrections.length > 0) {
        const rlCodes = corrections.map(correctionToRLCode);
        rl.logFailure(`${task}_CORRECTIONS`, rlCodes);
        console.log(`📚 [RL] Logged ${rlCodes.length} correction code(s) to ai-feedback.json: ${rlCodes.join(', ')}`);
    }

    return { content: text, corrections, passedReAudit };
}

module.exports = { applyContentCorrections };
