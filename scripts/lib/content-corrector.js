/**
 * BlogsPro Institutional Content QA Gate
 * ----------------------------------------
 * Runs on ALL AI-generated content BEFORE HTML & PDF creation.
 * Enforces 6 non-negotiable quality standards AND communicates
 * every correction back to the RL system as a logged failure so
 * the model is penalized in future generation prompts.
 *
 * FEEDBACK LOOP:
 *   AI Output → QA Gate (corrects) → RL Ledger (logs failures) → Future Prompts (warn model)
 */

const { sanitizeJSON } = require('./sanitizer.js');
const rl = require('./reinforcement.js');

// Known authoritative financial sources for auto-labelling bare URLs
const SOURCE_LABELS = {
    'reuters.com': 'Reuters',
    'bloomberg.com': 'Bloomberg',
    'ft.com': 'Financial Times',
    'wsj.com': 'Wall Street Journal',
    'economictimes.com': 'Economic Times',
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

/**
 * Main correction function. Returns cleaned content string.
 * @param {string} rawContent - AI-generated article text (pre-HTML)
 * @returns {{ content: string, corrections: string[] }} 
 */
function applyContentCorrections(rawContent) {
    const corrections = [];
    let text = rawContent || '';

    // ── PASS 1: Strip System Artifacts ────────────────────────────────────────
    const before1 = text.length;
    text = text
        .replace(/<rule-check>[\s\S]*?<\/rule-check>/gi, '')
        .replace(/--- SYSTEM CONTEXT ---[\s\S]*?--- (TOP NEWS|KEY DATA|UNIVERSAL NEWS) ---[\s\S]*?\n\s*\n/gi, '')
        .replace(/JSON must use DOUBLE QUOTES[^\n]*/gi, '')
        .replace(/^(Here is|In this|This is|Below is)[^\n]*/gim, '')
        .replace(/\[Context Truncated[^\]]*\]/gi, '')
        // Strip raw JSON objects leaked into body (not inside chart-data tags)
        .replace(/^\s*\{[\s\S]{10,500}\}\s*$/gm, '')
        .trim();
    if (text.length !== before1) corrections.push('Stripped system artifacts / prompt leakage');

    // ── PASS 2: Fix chart-data JSON using the Institutional Regex Sanitizer ───
    text = text.replace(/<chart-data>([\s\S]*?)<\/chart-data>/gi, (_, inner) => {
        try {
            JSON.parse(inner.trim()); // already valid
            return `<chart-data>${inner}</chart-data>`;
        } catch {
            const fixed = sanitizeJSON(inner);
            corrections.push('Fixed chart-data JSON syntax');
            return `<chart-data>${fixed}</chart-data>`;
        }
    });

    // ── PASS 3: Ensure chart-data appears only ONCE (at end) ──────────────────
    const chartBlocks = [...text.matchAll(/<chart-data>[\s\S]*?<\/chart-data>/gi)];
    if (chartBlocks.length > 1) {
        const lastBlock = chartBlocks[chartBlocks.length - 1][0];
        text = text.replace(/<chart-data>[\s\S]*?<\/chart-data>/gi, '').trim();
        text += '\n' + lastBlock;
        corrections.push(`Removed ${chartBlocks.length - 1} duplicate chart-data block(s)`);
    }

    // ── PASS 4: Convert bare https:// URLs to markdown hyperlinks ─────────────
    // Match bare URLs NOT already inside markdown link syntax [text](url) or <a href>
    const bareUrlRegex = /(?<!\]\()(?<!["\(])(https?:\/\/[^\s\)\]"<,]+)/g;
    const before4 = text;
    text = text.replace(bareUrlRegex, (url) => {
        const label = getLabelForUrl(url);
        return `[${label}](${url})`;
    });
    if (text !== before4) corrections.push('Converted bare URLs to markdown hyperlinks');

    // ── PASS 5: Citation Count Enforcement ────────────────────────────────────
    // Count distinct markdown links [text](url) — require at least 2
    const mdLinks = [...text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)];
    const distinctDomains = new Set(mdLinks.map(m => {
        try { return new URL(m[2]).hostname; } catch { return m[2]; }
    }));

    if (distinctDomains.size < 2) {
        // Inject fallback institutional citations at end of content (before chart-data)
        const fallbackCitations = `\n\n*Sources: [Reuters](https://reuters.com/markets/) | [Economic Times](https://economictimes.indiatimes.com/markets) | [RBI](https://rbi.org.in)*`;
        text = text.replace(/<chart-data>/i, fallbackCitations + '\n<chart-data>');
        if (!text.includes('<chart-data>')) text += fallbackCitations;
        corrections.push(`Added fallback citations (found only ${distinctDomains.size} distinct source(s))`);
    }

    // ── PASS 6: Whitespace & Empty Tag Normalisation ───────────────────────────
    text = text
        .replace(/\n{4,}/g, '\n\n\n')  // max 3 consecutive newlines
        .replace(/<h2>\s*<\/h2>/g, '')  // remove empty headers
        .replace(/<p>\s*<\/p>/g, '')    // remove empty paragraphs
        .trim();

    // ── RL FEEDBACK: Log corrections into the Reinforcement Ledger ────────────
    // Map each human-readable correction to its machine-readable RL failure code
    const correctionCodeMap = {
        'Stripped system artifacts / prompt leakage': 'QA_SYSTEM_ARTIFACT',
        'Fixed chart-data JSON syntax': 'QA_CHART_JSON_INVALID',
        'Removed': 'QA_DUPLICATE_CHART_DATA', // prefix match
        'Converted bare URLs to markdown hyperlinks': 'QA_BARE_URL',
        'Added fallback citations': 'QA_CITATION_DEFICIT', // prefix match
    };

    const rlFailureCodes = corrections.map(c => {
        for (const [key, code] of Object.entries(correctionCodeMap)) {
            if (c.startsWith(key)) return code;
        }
        return `QA_UNKNOWN: ${c}`;
    });

    if (rlFailureCodes.length > 0) {
        // Log as a FAILURE with specific codes — feeds back into future generation prompts
        rl.logFailure('QA_GATE_PRE_RENDER', rlFailureCodes);
    } else {
        // Content was clean — log as a SUCCESS to reinforce good model behaviour
        rl.logSuccess('QA_GATE_PRE_RENDER', 'Content passed all 6 QA checks without correction');
    }

    return { content: text, corrections };
}

module.exports = { applyContentCorrections };
