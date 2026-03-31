import { calculateReward } from "./lib/rl-metrics.js";

/**
 * 2026 RL Metric Test: Institutional Purity Check
 */
function testMetrics() {
    console.log("💎 BLOGSPRO RL METRIC VERIFICATION START (2025-2026 Grounding)");

    const samples = [
        {
            name: "High-Fidelity Sample (2026)",
            content: "In March 2026, the institutional drift peaked at 14.2%. <table><tr><td>2025 LFY</td><td>12.1%</td></tr></table>. Chart: <chart-data>[[\"March\", 14.2]]</chart-data>. Deep liquidity velocity remains high.",
            target: 20
        },
        {
            name: "Prompt-Echo Sample (Leakage)",
            content: "ROLE: STRATEGIST TASK: GENERATE CHAPTER... PROMPT: Analysis...",
            target: 1500
        },
        {
            name: "Under-Density Sample (Prose Only)",
            content: "The market is moving very fast today. We are seeing many changes in the sectors. Institutional investors are cautious but optimistic.",
            target: 100
        }
    ];

    samples.forEach(s => {
        const reward = calculateReward(s.content, s.target);
        console.log(`[Metric Result] ${s.name}: Reward=${reward.toFixed(2)}`);
        
        if (s.name.includes("High-Fidelity") && reward > 0.8) console.log("✅ High-Fidelity Correctly Scored.");
        if (s.name.includes("Prompt-Echo") && reward < 0.1) console.log("✅ Prompt-Echo Correctly Penalized.");
        if (s.name.includes("Under-Density") && reward < 0.8) console.log("✅ Under-Density Correctly Scored.");
    });
}

testMetrics();
