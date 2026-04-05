import { askAI } from "./ai-service.js";
import { pushTelemetryLog } from "./storage-bridge.js";

/**
 * MiroFish AI-Persona Swarm (Serverless V4.0)
 * ===========================================
 * High-fidelity 10-Agent Institutional Consensus Engine.
 * Replaces simple single-persona simulations with a deep multi-role spectrum.
 */

const MIROFISH_SWARM_PERSONAS = [
  { id: "bull", role: "Growth/Liquidity Strategist", focus: "Catalysts and expansion" },
  { id: "bear", role: "Tail Risk Analyst", focus: "Systemic breakdowns and technical failures" },
  { id: "macro", role: "Global Macro Analyst", focus: "Monetary policy and secondary market rates" },
  { id: "quant", role: "Derivative & Vol Strategist", focus: "Flow dynamics and gamma pivots" },
  { id: "geopolitical", role: "Sovereign Risk Specialist", focus: "Sanctions, supply chains, and energy" },
  { id: "cio", role: "Chief Investment Officer", focus: "Strategic Asset Allocation (SAA) and duration" },
  { id: "risk", role: "Stress-Test Manager", focus: "Liquidity VaR and counterparty solvency" },
  { id: "retail", role: "Sentiment & Flow Analyst", focus: "MF inflows and retail euphoria/capitulation" },
  { id: "gift", role: "Offshore Hub Specialist", focus: "GIFT City arbitrage and basis compression" },
  { id: "fintech", role: "Digital Rails Analyst", focus: "UPI, Cards, and Payment ecosystem throughput" },
  { id: "coder", role: "Principal Software Architect", focus: "Semantic HTML5, CSS layout stability, and PDF rendering compatibility" }
];

const MIROFISH_PROTOCOL = `
You are the MiroFish Institutional Consensus Engine. 
MISSION: Conduct a simulated 10-Agent swarm review to identify strategic alpha.

PROCEDURE:
1. INTERNAL DEBATE: Each of the 11 following agents must critique the market pulse:
   - Bull, Bear, Macro, Quant, Geopolitical, CIO, Risk, Retail, GIFT City, Fintech, and Coder.
2. CONSENSUS FILTER: Aggregate their findings into a single 'MiroFish Strategic Outlook'.

OUTPUT FORMAT:
- CONSENSUS SCORE: [0-100]
- DRIFT: [Extremely Bullish | Neutral | Risk-Off | Defensive]
- FORECAST: (authoritative, high-density terminal briefing block)
`;

async function generateMiroForecast(marketContext, env = null, ctx = null) {
  console.log("🚀 [MiroFish 4.0] Executing 10-Agent Consensus Swarm...");
  
  const prompt = `
${MIROFISH_PROTOCOL}

MARKET CONTEXT:
${marketContext}

Generate the final consolidated forecast now. Be cold, authoritative, and data-dense.
`;

  try {
    const result = await askAI(prompt, { 
      role: 'generate', 
      env,
      model: 'node-research' // Utilization of high-fidelity institutional terminal (Cerebras/Gemini)
    });
    
    if (ctx) {
        ctx.waitUntil(pushTelemetryLog("PERSONA_ALIGNMENT", {
            frequency: "pulse",
            status: "success",
            message: `Consensus swarm complete for market context.`,
            details: { contextLength: marketContext.length }
        }, env));
    }
    
    return result;
  } catch (e) {
    console.error("❌ MiroFish Swarm Failed:", e.message);
    return "MiroFish Intelligence: Swarm consensus temporarily decoupled. Standard institutional monitoring active.";
  }
}

export { generateMiroForecast, MIROFISH_SWARM_PERSONAS };
