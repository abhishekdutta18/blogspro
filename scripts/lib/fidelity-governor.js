/**
 * BlogsPro Swarm 4.0: Fidelity Governor
 * =====================================
 * An industrial-grade validation layer that intercepts AI-generated
 * content to ensure structural integrity and standard compliance.
 */

function extractChartData(content) {
    // Also support <chart-data json="..."> variants if they appear
    const regex = /<chart-data>([\s\S]*?)<\/chart-data>/gi;
    const matches = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
        matches.push({ raw: match[0], data: match[1].trim() });
    }
    return matches;
}

function selfHealJSON(jsonStr) {
    let healed = jsonStr
        .replace(/```json\n?|```/g, '') // Strip backticks
        .replace(/\\n/g, ' ')           // Clean newlines
        .replace(/'/g, '"')             // Convert single quotes
        .replace(/,\s*([\}\]])/g, '$1') // Remove trailing commas
        .trim();
    
    // Add missing quotes to keys
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

    // 4. ECHO & STRAY SYSTEM CODES (Harden for Swarm 4.2)
    const echoes = ["INSTITUTIONAL_PERSONA", "QUANTITATIVE DRAFTER", "BUREAU CHIEF", "GLOBAL TEMPORAL GROUNDING", "TASK:", "ROLE:"];
    echoes.forEach(token => {
        if (repairedContent.includes(token)) {
            console.warn(`⚠️ [Governor] System token '${token}' detected. Attempting deep-sanitize...`);
            const regex = new RegExp(`^.*${token}.*$`, 'gm');
            repairedContent = repairedContent.replace(regex, '');
            status = "repaired";
        }
    });

    // 5. ROBOTIC FILLER (Human-Readability Pass)
    const filler = [
        "In this chapter,", "As an AI,", "Certainly!", "I will now generate", 
        "In this analysis,", "As documented in", "According to the provided"
    ];
    filler.forEach(phrase => {
        if (repairedContent.includes(phrase)) {
            console.warn(`⚠️ [Governor] Robotic filler '${phrase}' detected. Stripping...`);
            repairedContent = repairedContent.replace(new RegExp(phrase, 'gi'), '');
            status = "repaired";
        }
    });

    return {
        status,
        content: repairedContent.trim().replace(/\n{3,}/g, '\n\n'), // Clean whitespace
        errors
    };
}

export default { validateAndRepair };
