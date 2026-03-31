import { askAI } from "./lib/ai-service.js";
import { initWorkerSentry, captureSwarmError, logSwarmBreadcrumb } from "./lib/sentry-bridge.js";

/**
 * BlogsPro Relevance Worker (V1.0)
 * =================================
 * Semantic Filtering Tier.
 * Responsible for:
 * 1. News Impact Scoring (0-100).
 * 2. Semantic Distillation of market telemetry.
 * 3. Categorization of "The Lead".
 */

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("Use POST for digestion.", { status: 405 });

    // 0. Security Handshake
    const token = request.headers.get("X-Swarm-Token");
    if (!token || token !== env.SWARM_INTERNAL_TOKEN) {
      console.error("❌ [Relevance] Unauthorized Swarm Access attempt.");
      return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403 });
    }

    const sentry = initWorkerSentry(request, env);
    try {
      const data = await request.json();
      logSwarmBreadcrumb(`Semantic Digesting: ${data.frequency}`, { token: token.substring(0, 8) }, sentry);
      console.log(`🧠 [Relevance] Digesting ${data.frequency} snapshot...`);

      // 1. Distill News into Impactful Segments
      const newsDigest = await distillNews(data.news, env);

      // 2. Score Macro-Economic Drift
      const macroDrift = await analyzeDrift(data.macro, data.sentiment, env);

      const digest = {
        frequency: data.frequency,
        timestamp: Date.now(),
        strategicLead: newsDigest.lead,
        scoredNews: newsDigest.scored,
        macroFocus: macroDrift,
        marketContext: data.marketInfo
      };

      return new Response(JSON.stringify(digest), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      captureSwarmError(e, { stage: 'relevance_digestion' }, sentry);
      return new Response(JSON.stringify({ error: e.message }), { 
        status: 500, headers: { "Content-Type": "application/json" } 
      });
    }
  }
};

async function distillNews(rawNews, env) {
  const prompt = `
ROLE: LEAD SEMANTIC ANALYST
TASK: Analyze these institutional news headlines. 
1. Score each for Institutional Impact (0-100). Prioritize 2025/2026 fiscal metrics.
2. Categorize by Vertical (Macro, Tech, India, Asia).
3. Identify "The Strategic Lead" (The single most important headline for the 2026 outlook).

HEADLINES:
${rawNews}

OUTPUT: JSON object format:
{ "lead": "headline", "scored": [ { "headline": "...", "score": 85, "cat": "Macro" }, ... ] }
`;

  const res = await askAI(prompt, { 
    role: 'relevance', 
    env,
    model: 'llama-3.1-8b-instant' // Fast inference
  });

  try {
    // Basic JSON cleanup if LLM leaks meta-talk
    const jsonStr = res.match(/\{[\s\S]*\}/)[0];
    return JSON.parse(jsonStr);
  } catch (e) {
    return { lead: "Systemic Drift Monitoring Active.", scored: [] };
  }
}

async function analyzeDrift(macro, sentiment, env) {
  return `Macro Pulse: India GDP/US CPI correlation with ${sentiment.summary}. Focused on Liquidity Pivots.`;
}
