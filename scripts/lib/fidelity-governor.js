/**
 * BlogsPro Swarm 4.0: Fidelity Governor
 * =====================================
 * An industrial-grade validation layer that intercepts AI-generated
 * content to ensure structural integrity and standard compliance.
 */

function extractChartData(content) {
    const regex = /<chart-data>([\s\S]*?)<\/chart-data>/gi;
    const matches = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
        matches.push({ raw: match[0], data: match[1].trim() });
    }
    return matches;
}

/**
 * Self-Heal common LLM JSON errors:
 * 1. Missing quotes on keys
 * 2. Single quotes instead of double
 * 3. Trailing commas
 * 4. Markdown backticks in JSON
 */
function selfHealJSON(jsonStr) {
    let healed = jsonStr
        .replace(/```json\n?|```/g, '') // Strip backticks
        .replace(/'/g, '"')             // Convert single quotes
        .replace(/,\s*([\}\]])/g, '$1') // Remove trailing commas
        .trim();
    
    // Add missing quotes to keys if needed
    healed = healed.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');
    
    return healed;
}

export function validateAndRepair(content) {
    let status = "success";
    let repairedContent = content;
    const errors = [];

    // 1. CHART DATA FIDELITY
    const charts = extractChartData(content);
    for (const chart of charts) {
        try {
            JSON.parse(chart.data);
        } catch (e) {
            console.warn("⚠️ [Governor] Malformed Chart JSON detected. Attempting Self-Heal...");
            const healedJson = selfHealJSON(chart.data);
            try {
                JSON.parse(healedJson);
                repairedContent = repairedContent.replace(chart.data, healedJson);
                status = status === "success" ? "repaired" : status;
                console.log("✅ [Governor] Chart JSON repaired successfully.");
            } catch (e2) {
                console.error("❌ [Governor] Critical Chart JSON failure. Masking block.");
                repairedContent = repairedContent.replace(chart.raw, `<!-- FIDELITY_ERROR: ${e2.message} -->`);
                status = "error";
                errors.push(`Chart JSON Failure: ${e2.message}`);
            }
        }
    }

    // 2. HEADER CONSISTENCY
    // Ensure all <h2> follow the standard BlogsPro Nexus formatting if not present
    // (This is light sanitization - don't over-repair)

    // 3. MARKDOWN POLLUTION
    if (repairedContent.includes("```")) {
        console.warn("⚠️ [Governor] Markdown backticks detected in final output. Stripping...");
        repairedContent = repairedContent.replace(/```[a-z]*\n?|```/gi, '');
        status = "repaired";
    }

    return {
        status,
        content: repairedContent.trim(),
        errors
    };
}

export default { validateAndRepair };
