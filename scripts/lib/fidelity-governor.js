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
        .trim();
    
    // 1. Thousand Separator Removal in Numbers (e.g. 25,000 -> 25000)
    // Only within digits, not if it's a comma between elements
    healed = healed.replace(/(\d),(\d{3})/g, '$1$2');

    // 2. Add missing quotes to unquoted keys
    healed = healed.replace(/([{,]\s*)([a-zA-Z0-9_$]+)(\s*:)/g, '$1"$2"$3');
    
    // 3. Convert single quotes to double quotes for values
    healed = healed.replace(/:\s*'([^']*)'/g, ': "$1"');

    // 4. Handle trailing commas
    healed = healed.replace(/,\s*([\}\]])/g, '$1');

    // 5. BRACKET BALANCING: Count pairs and append missing closers
    const openBraces = (healed.match(/\{/g) || []).length;
    const closeBraces = (healed.match(/\}/g) || []).length;
    const openBrackets = (healed.match(/\[/g) || []).length;
    const closeBrackets = (healed.match(/\]/g) || []).length;

    for (let i = 0; i < (openBraces - closeBraces); i++) healed += '}';
    for (let i = 0; i < (openBrackets - closeBrackets); i++) healed += ']';
    
    return healed;
}

function validateDensity(content, threshold = 500) {
    // 🛡️ STRIP INSTITUTIONAL OVERHEAD: 
    // We only count the word density of the actual analytical narrative.
    const narrativeOnly = content
        .replace(/<section class="institutional-abstract">[\s\S]*?<\/section>/gi, '')
        .replace(/<section class="institutional-glossary">[\s\S]*?<\/section>/gi, '')
        .replace(/<span class="institutional-citation">[\s\S]*?<\/span>/gi, '')
        .replace(/<chart-data>[\s\S]*?<\/chart-data>/gi, '')
        .replace(/<div class="card terminal-chart"[\s\S]*?<\/div>/gi, '')
        .trim();

    const wordCount = narrativeOnly.split(/\s+/).filter(w => w.length > 0).length;
    return { ok: wordCount >= threshold, count: wordCount };
}

export function validateAndRepair(content, options = { threshold: 500 }) {
    let status = "success";
    let repairedContent = content;
    const errors = [];

    // 1. DENSITY SENTINEL (Final Fallback)
    const density = validateDensity(content, options.threshold);
    if (!density.ok) {
        console.warn(`⚠️ [Governor] Critical Density Failure: ${density.count}/${options.threshold} words.`);
        status = "warning";
        errors.push(`Density Alert: ${density.count}/${options.threshold} (Low fidelity)`);
        repairedContent += `\n<!-- DENSITY_ALERT: Word count ${density.count} is below institutional threshold. -->`;
    } else {
        repairedContent += `\n<!-- DENSITY_SUCCESS: ${density.count} words. -->`;
    }

    // 2. CHART DATA FIDELITY
    const charts = extractChartData(repairedContent);
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

    // 4. ECHO & STRAY SYSTEM CODES (Harden for Swarm 5.0)
    const echoes = [
        "INSTITUTIONAL_PERSONA", "QUANTITATIVE DRAFTER", "BUREAU CHIEF", 
        "GLOBAL TEMPORAL GROUNDING", "TASK:", "ROLE:", "I hope this analysis",
        "As an AI,", "Certainly!", "In conclusion,"
    ];
    echoes.forEach(token => {
        if (repairedContent.includes(token)) {
            console.warn(`⚠️ [Governor] System token/filler '${token}' detected. Sanitizing...`);
            const regex = new RegExp(`^.*${token}.*$`, 'gmi');
            repairedContent = repairedContent.replace(regex, '');
            status = "repaired";
        }
    });

    return {
        status,
        content: repairedContent.trim().replace(/\n{3,}/g, '\n\n'),
        wordCount: density.count,
        errors
    };
}

export default { validateAndRepair };
