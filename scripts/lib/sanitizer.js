/**
 * Institutional JSON & Content Sanitizer (BlogsPro V4.20)
 * Specialized for stripping LLM "echoes" and fixing chart-data syntax.
 */
function sanitizeInstitutionalContent(content) {
    if (!content) return "";
    
    // 1. Strip LLM "Echoes" (Common in Free Tier Models like Gemini 1.5 Flash)
    let clean = content
        .replace(/^(ROLE|TASK|TASK DESCRIPTION|MANDATORY|INSTRUCTION|SYSTEM|USER|RESEARCH INPUT):.*$/gim, "")
        .replace(/--- (SYSTEM CONTEXT|UNIVERSAL NEWS|TOP NEWS) ---[\s\S]*?--- (END|CLOSE) ---/gi, "")
        .replace(/^(Here is|In this|This is|Clean this|As an institutional)[^\n]*/gim, "")
        .replace(/⚠️ ABSOLUTE WORD MINIMUM:.*$/gim, "")
        .replace(/MANDATORY (CHAPTER|STRUCTURAL|OUTPUT) (STRUCTURE|REQUIREMENT):.*$/gim, "")
        .replace(/1\. EXECUTIVE SUMMARY \(150\+ words\):.*$/gim, "")
        .replace(/2\. CURRENT POSITIONING ANALYSIS \(400\+ words\):.*$/gim, "")
        .replace(/3\. INSTITUTIONAL FLOW DYNAMICS \(300\+ words\):.*$/gim, "")
        .replace(/4\. QUANTITATIVE DATA TABLE:.*$/gim, "")
        .replace(/5\. RISK VECTORS \(300\+ words\):.*$/gim, "")
        .replace(/6\. STRATEGIC OUTLOOK.*$/gim, "")
        .replace(/7\. ACTIONABLE INTELLIGENCE.*$/gim, "")
        .replace(/\[SOURCE \| Title\]\(URL\) format.*$/gim, "")
        .trim();

    // 2. Fix common AI syntax errors in <chart-data> blocks
    const chartRegex = /<chart-data>([\s\S]*?)<\/chart-data>/g;
    clean = clean.replace(chartRegex, (match, raw) => {
        let fixed = raw.trim();
        // Fix missing quotes around labels & text values
        fixed = fixed.replace(/\[\s*([a-zA-Z0-9$%\/][a-zA-Z0-9\s\-_&$.\/%()]*)\s*,/g, '["$1",');
        fixed = fixed.replace(/,\s*([a-zA-Z0-9$%\/\.][a-zA-Z0-9\s\-_&$.\/%()]*)\s*\]/g, ', "$1"]');
        // Standard cleanup
        fixed = fixed.replace(/'/g, '"'); // Single quotes to double quotes
        fixed = fixed.replace(/,\s*\]/g, ']'); // Trailing commas in arrays
        fixed = fixed.replace(/,\s*\}/g, '}'); // Trailing commas in objects
        return `<chart-data>${fixed}</chart-data>`;
    });

    return clean;
}

export { sanitizeInstitutionalContent as sanitizeJSON };
