const { askAI } = require("./ai-service.js");

/**
 * MiroFish AI-Persona Swarm (Serverless Version)
 * Replaces the Python CLI dependency with a high-fidelity multi-agent LLM simulation.
 */

const SWARM_SYSTEM_PROMPT = `
You are the MiroFish Intelligence Swarm, a consensus-driven engine consisting of 5 Virtual Institutional Agents:
1. BULL: Optimized for growth catalysts and liquidity expansion.
2. BEAR: Optimized for systemic risks and technical breakdowns.
3. MACRO: Integrated global policy, rates, and secondary market impacts.
4. QUANT: Statistical volatility, arbitrage flow, and gamma pivots.
5. GEOPOLITICAL: Supply chain friction, sovereign risk, and energy security.

TASK:
Analyze the provided Market Context. 
Each agent must provide a brief INTERNAL CRITIQUE, followed by a FINAL CONSENSUS FORECAST.

FORMAT:
- AGENT CRITIQUES: (Internal-only logic drift)
- CONSENSUS SCORE: [0-100] (0 = Systemic Collapse, 100 = Parabolic Expansion)
- FORECAST: (authoritative, high-density terminal briefing block)
`;

async function generateMiroForecast(marketContext, env = null) {
  console.log("🚀 [Serverless Swarm] Simulating MiroFish Consensus...");
  
  const prompt = `
${SWARM_SYSTEM_PROMPT}

MARKET CONTEXT:
${marketContext}

Generate the Swarm forecast now. Focus on GIFT City and India Domestic institutional pivots.
`;

  try {
    const result = await askAI(prompt, { role: 'generate', env });
    
    // Extract the forecast portion (Simple implementation: return the whole thing or split)
    // We want to return a professional block that fits into the main briefing.
    return result;
  } catch (e) {
    console.error("❌ Swarm Simulation Failed:", e.message);
    return "MiroFish Intelligence: Swarm consensus temporarily decoupled. Standard institutional monitoring active.";
  }
}

module.exports = { generateMiroForecast };
