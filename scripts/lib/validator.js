const fluffRegex = /In this chapter|As reported by|In conclusion|analysis suggests|discussed in the previous|anchor for this chapter|here is the|let's look at|dive into|delve into/i;

function validateContent(content) {
    const failures = [];
    
    // Structural Presence
    if (!/<h2/i.test(content)) failures.push("Missing exactly one <h2> header tag.");
    if (!/<details id="meta-excerpt"/i.test(content)) failures.push("Missing <details id=\"meta-excerpt\"> envelope.");
    if (!/\|.*Metric.*\|/.test(content)) failures.push("Missing the Markdown table with '| Metric | Observation | Alpha Impact |'.");
    
    // Data Density Check
    const tableRows = (content.match(/\|[^|]+\|[^|]+\|[^|]+\|/g) || []).length;
    if (tableRows < 3) failures.push(`Insufficient data density (Found ${tableRows} metrics, need at least 5 for terminal depth).`);

    // Institutional Cold Tone: Fluff Detection
    if (fluffRegex.test(content)) {
        const match = content.match(fluffRegex)[0];
        failures.push(`TONE VIOLATION: Excessive conversational fluff detected ("${match}"). Use raw institutional data blocks.`);
    }

    // Verification Check: Citations
    const citations = (content.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
    if (citations < 2) failures.push(`Verification failure (Found ${citations} hyperlinked citations, need at least 2 distinct sources).`);

    // Chart Data Extraction & Validation
    const chartMatch = content.match(/<chart-data>([\s\S]*?)<\/chart-data>/);
    if (!chartMatch) {
        failures.push("Missing <chart-data> JSON array tag at the very end.");
    } else {
        const raw = chartMatch[1].trim();
        try { JSON.parse(raw); } catch(e) { failures.push(`JSON_SYNTAX_ERROR: ${e.message}`); }
    }

    return failures;
}

module.exports = { validateContent };
