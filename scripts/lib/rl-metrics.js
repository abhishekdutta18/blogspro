/**
 * BlogsPro RL Metrics Engine (V1.0)
 * Calculates the 'Reward' score for institutional research chapters.
 */

function calculateReward(content, targetWords = 500) {
    if (!content) return 0;

    let score = 0;
    const actualWords = content.split(/\s+/).length;

    // 1. Length Reward (0.0 - 0.4)
    // We penalize heavily if under 50% of target
    const lengthRatio = actualWords / targetWords;
    if (lengthRatio >= 1) score += 0.4;
    else if (lengthRatio >= 0.8) score += 0.3;
    else if (lengthRatio >= 0.5) score += 0.1;

    // 2. Structural Component Bonus (0.0 - 0.4)
    if (content.includes('<table') || content.includes('| --- |')) score += 0.2; // Tables present
    if (content.includes('<chart-data>') || content.includes('terminal-chart')) score += 0.2; // Charts present

    // 3. Grounding Verification (0.0 - 0.2)
    if (content.includes('2026')) score += 0.1;
    if (content.includes('2025')) score += 0.1;

    // 4. Prompt Echo Penalty (Critical)
    const promptTokens = ["GLOBAL TEMPORAL GROUNDING", "INSTITUTIONAL_PERSONA", "QUANTITATIVE DRAFTER"];
    if (promptTokens.some(t => content.includes(t))) {
        console.warn("🚫 RL Penalty: Prompt Echo Detected.");
        return -1.0; 
    }

    return parseFloat(score.toFixed(2));
}

export { calculateReward };
