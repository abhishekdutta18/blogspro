/**
 * BlogsPro Intelligence Terminal - Centralized Writing Logic (V6.42)
 * All institutional personas, structural requirements, and frequency-specific 
 * prompts are managed here to ensure a unified "Single Source of Truth."
 */

const INSTITUTIONAL_PERSONA = `You are a Lead Quant Strategist for BlogsPro Intelligence Terminal. 
Your tone is COLD, AUTHORITATIVE, and HIGH-DENSITY.
ZERO TOLERANCE for conversational filler: 
- BANNED: "In this chapter," "As reported by," "As previously discussed," "In conclusion," "This analysis suggests."
- MANDATORY: Open directly with the data or high-level strategic drift.
- MANDATORY: Use precise technical terms (e.g., "Institutional Consolidation," "Gamma Squeeze," "Regulatory Friction").`;

const STRUCTURAL_RULES = `
1. Tone: Cold, analytical, Bloomberg-style blocks.
2. Mandatory Structural Layout:
   - PILLAR 1: YOU MUST INCLUDE exactly one <h2>GLOBAL MACRO STRATEGY</h2>.
   - PILLAR 2: YOU MUST INCLUDE exactly one <h2>INDIA DOMESTIC PULSE</h2>.
   - DATA METADATA: IMMEDIATELY FOLLOW THE FIRST H2 with <details id="meta-excerpt" style="display:none">Executive Abstract: High-density institutional summary (max 300 chars). NO FILLER.</details>.
   - DATA SUMMARY: YOU MUST INCLUDE exactly one Markdown table: "| Metric | Observation | Alpha Impact |" with at least 5 data-driven rows (using the expanded Mega-Pool data).
   - Headers/Lists format: [SOURCE | Title](URL).
   - NO MARKDOWN CODE BLOCKS. Output pure HTML body snippets only.
3. Citations:
   - You MUST include hyperlink citations in [SOURCE | Title](URL) format.
   - Each pillar must contain at least 2 distinct source citations.
4. Strategic Anchors:
   - End with: SENTIMENT_SCORE: [0-100] | POLL: [Question] | OPTIONS: [Opt1, Opt2, Opt3].
`;

const CHART_SYNC_RULE = `
CHART SYNCHRONIZATION:
- Propose exactly one <chart-data> block at the very end.
- Labels must be plain text (No HTML tags).
- Values must be numbers representing % Delta or Institutional Drift.
`;

/**
 * Returns the centralized prompt for Briefings (Hourly/Daily)
 */
function getBriefingPrompt(frequency, marketContext, mktInfo) {
    const temporalGuidance = `
TEMPORAL GUIDANCE:
- Current DOW is ${mktInfo.day}. Status: ${mktInfo.status}.
${mktInfo.isWeekend ? "- IMPORTANT: Markets are CLOSED. Focus on WEEKEND WRAP and WEEKLY PREP. Do NOT suggest intraday long/short trades." : "- Markets are ACTIVE. Focus on LIVE EXECUTION and PIVOTS."}
    `;

    const focus = frequency === 'hourly' 
        ? 'Focus on volatility pivots, technical liquidity, and global macro drifts.' 
        : 'Focus on session transitions, sectoral rotation, and institutional catalysts.';

    return `
${INSTITUTIONAL_PERSONA}
Write a high-fidelity ${frequency} market pulse (HTML).

${temporalGuidance}

STRATEGIC ANALYSIS DATASET: 
${marketContext}

${focus}
- Sentiment Mapping: Map how global greed/fear correlates with institutional capital flows and risk-on/risk-off transitions.
- Multi-Asset Mega-Pool: Analyze correlations across the Big 50 pool (AAPL, Reliance, Gold, Brent, DXY, US10Y, BTC, ETH).

--- MANDATORY STRUCTURAL OUTPUT REQUIREMENTS ---
${STRUCTURAL_RULES}
- Grounding: You MUST reference specific news items using the [SOURCE | Title](URL) hyperlink format.

--- FINAL MANDATORY TAGS (MUST BE AT THE VERY END) ---
${CHART_SYNC_RULE}
- Output 3 separate data series (Sentiment, Macro, Multi-Asset) at the very end inside a single <chart-data> tag as a JSON object:
  <chart-data>{ "sentiment": [[L,V],[L,V],[L,V],[L,V]], "macro": [[L,V],[L,V],[L,V],[L,V]], "multi_asset": [[L,V],[L,V],[L,V],[L,V]] }</chart-data>
- DO NOT wrap the JSON inside markdown code blocks.
`;
}

/**
 * Returns the centralized prompt for Strategic Articles (Weekly/Monthly)
 */
function getArticlePrompt(frequency, verticalName, verticalId, vData, macroSummary, news, lastSummary) {
    const wordCount = frequency === 'monthly' ? '2,500-3,000' : '1,500-2,000';
    
    return `
${INSTITUTIONAL_PERSONA}
CONTEXT DATA:
- Data Flux: ${vData}
- Anchor: ${macroSummary}
- Global News: ${news || "Systemic drift mapping via macro context."}
- Flow: ${lastSummary}

--- MANDATORY CHAPTER STRUCTURE ---
1. Write a ${wordCount} word chapter for '${verticalName}'.
2. Layout:
   - START with exactly one (1) <h2>${verticalName}</h2> tag. No preamble.
   - Insert <div class="card terminal-chart" id="chart_${verticalId}"></div> exactly once in the body.
3. CITATION MANDATE: [Institutional Source](URL).
4. TABLE MANDATE: Include exactly one Markdown table: "| Phase | Observation | Implications |" with 5+ rows.

--- FINAL MANDATORY CHART DATA (Literal Last Token) ---
${CHART_SYNC_RULE}
- Output inside a <chart-data> tag as a JSON array of arrays:
  <chart-data>[["Label1", Value1], ["Label2", Value2], ["Label3", Value3], ["Label4", Value4]]</chart-data>
- DO NOT wrap in markdown backticks.
- Pure HTML snippets only. NO Markdown code blocks.
`;
}

/**
 * Standard Sanitization Prompt
 */
function getSanitizerPrompt(content) {
    return `Clean this institutional market report for terminal delivery.
- REMOVE all markdown backticks (\`\`\`).
- Fix mismatching tags and invalid HTML.
- MANDATORY: Preserve the <chart-data> JSON tag at the very end. DO NOT REMOVE IT.
- MANDATORY: Preserve all hyperlinked citations [Source Name](URL) in the body.
- Ensure the ID 'chart_*' is preserved in the div cards.
- Tone: Cold, Bloomberg-style institutional blocks.

CONTENT:
${content}`;
}

module.exports = {
    getBriefingPrompt,
    getArticlePrompt,
    getSanitizerPrompt
};
