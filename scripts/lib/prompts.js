/**
 * BlogsPro Intelligence Terminal - Centralized Writing Logic (V6.42)
 * All institutional personas, structural requirements, and frequency-specific 
 * prompts are managed here to ensure a unified "Single Source of Truth."
 */

const INSTITUTIONAL_PERSONA = `You are a Lead Quant Strategist for BlogsPro Intelligence Terminal. 
Your tone is cold, authoritative, high-density, and Bloomberg-style. 
You avoid conversational filler, "Here is your report," or "In conclusion."`;

const STRUCTURAL_RULES = `
1. Tone: Sharp, authoritative, data-driven.
2. Formatting: 
   - Start with exactly one <h2> tag.
   - 1-sentence analytical excerpt wrapped in <details id="meta-excerpt" style="display:none">.
   - MANDATORY: Include a Markdown table with at least 5 rows: "| Metric | Observation | Alpha Impact |".
   - NO MARKDOWN CODE BLOCKS. Output pure HTML body snippets only.
3. Metadata:
   - End with "SENTIMENT_SCORE: [0-100]" and "PRICE_INFO: [Last, High, Low]".
   - Include a poll: "Question: [Text]" and "Options: [Opt1, Opt2, Opt3]".
`;

const CHART_SYNC_RULE = `
DATA-NARRATIVE SYNC:
- You MUST propose data series for our terminal charts that explicitly reflect the trends, volatility, and quantitative claims you make in your analysis.
- If you mention "a 15% surge" or "moderate consolidation," the values MUST reflect that.
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

STRATEGIC REQUIREMENTS:
${STRUCTURAL_RULES}
- ${focus}
- Grounding: You MUST reference specific news items from the feeds above to back your analysis.
- Sentiment Mapping: Map how global greed/fear correlates with Indian FPI/DII flows.

${CHART_SYNC_RULE}
- Output 3 separate data series (Sentiment, Macro, Multi-Asset) at the very end inside a single <chart-data> tag as a JSON object:
  <chart-data>{ "sentiment": [[L,V],[L,V],[L,V],[L,V]], "macro": [[L,V],[L,V],[L,V],[L,V]], "multi_asset": [[L,V],[L,V],[L,V],[L,V]] }</chart-data>

DATASET: ${marketContext}
    `;
}

/**
 * Returns the centralized prompt for Strategic Articles (Weekly/Monthly)
 */
function getArticlePrompt(frequency, verticalName, vData, macroSummary, news, lastSummary) {
    const wordCount = frequency === 'monthly' ? '2,500-3,000' : '1,500-2,000';
    
    return `
${INSTITUTIONAL_PERSONA}
CONTEXT:
- Data Flux: ${vData}
- Anchor: ${macroSummary}
- Global News: ${news || "Systemic drift mapping via macro context."}
- Flow: ${lastSummary}

STRICT INSTRUCTION:
1. Write a ${wordCount} word chapter for '${verticalName}'.
2. Formatting: Use <h2> for '${verticalName}'. Insert <div class="card"><div id="chart_${verticalName.toLowerCase().replace(/[^a-z]+/g, '_')}"></div></div>.
${CHART_SYNC_RULE}
- Output it at the very END of the chapter inside a <chart-data> tag as a JSON array of arrays:
  <chart-data>[["Label1", Value1], ["Label2", Value2], ["Label3", Value3], ["Label4", Value4]]</chart-data>
  (Values should be numbers representing the % Delta or Drift).
3. NO MARKDOWN CODE BLOCKS. Output pure HTML body snippets only.
    `.replace('chart_global_macro_drift', 'chart_macro') // Fix for specific chart IDs if needed
     .replace('chart_equities_alpha', 'chart_equities'); 
}

/**
 * Standard Sanitization Prompt
 */
function getSanitizerPrompt(content) {
    return `Clean this institutional market report for terminal delivery.
- REMOVE all markdown backticks (\`\`\`).
- Fix mismatching tags and invalid HTML.
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
