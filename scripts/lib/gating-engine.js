import { askAI } from "./ai-service.js";
import { getSemanticGatingPrompt } from "./prompts.js";

/**
 * BlogsPro V7.0 - Tick-by-Tick Signal Gating Engine
 * Filters market noise to ensure high-fidelity researcher focus.
 */

export function gateSignal(rawData, threshold = 0.001) {
    if (!rawData || !Array.isArray(rawData)) return { filtered: [], noiseCount: 0 };

    console.log(`📡 [Gating-Engine] Processing ${rawData.length} market ticks...`);
    
    let noiseCount = 0;
    const filtered = rawData.filter(item => {
        // TradingView format: [close, change, description]
        const change = Math.abs(item.d?.[1] || 0);
        
        // Gating Logic: If change is below threshold (e.g. 0.1%), mark as noise
        // UNLESS it's a high-priority ticker (VIX, DXY, 10Y Yields)
        const desc = (item.d?.[2] || "").toUpperCase();
        const isPriority = desc.includes("VIX") || desc.includes("DXY") || desc.includes("10Y") || desc.includes("NIFTY");

        if (change < (threshold * 100) && !isPriority) {
            noiseCount++;
            return false;
        }
        return true;
    });

    console.log(`✅ [Gating-Engine] Noise Filtered: ${noiseCount} ticks. Signals Passed: ${filtered.length}.`);
    
    return {
        filtered,
        noiseCount,
        integrityScore: filtered.length > 0 ? 100 : 0,
        summary: `Gating complete. ${filtered.length} active signals identified after purging ${noiseCount} legacy noise clusters.`
    };
}

/**
 * V7.0 Hybrid Gating: Rules-based + AI-driven semantic filter
 */
export async function hybridGateSignal(rawData, env, threshold = 0.001) {
  // 1. Rules-based pass (Hyper-fast)
  const { filtered: rulesFiltered, noiseCount: rulesNoise } = gateSignal(rawData, threshold);
  if (rulesFiltered.length === 0) return { filtered: [], noiseCount: rulesNoise, summary: "All signals gated by rules-engine." };

  // 2. AI-driven semantic pass
  try {
    console.log("🧠 [Gating-Engine] Executing AI semantic audit...");
    const aiRes = await askAI(getSemanticGatingPrompt(rulesFiltered.slice(0, 20)), { 
      role: 'research', env, model: 'llama-3.1-8b-instant' 
    });
    
    const cleaned = aiRes.replace(/```json\n?|```/g, '').trim();
    const aiVerdict = JSON.parse(cleaned);
    
    const finalSignals = rulesFiltered.filter(item => {
      const ticker = item.d?.[2] || "";
      const verdict = aiVerdict.signals?.find(s => ticker.includes(s.ticker));
      return verdict ? verdict.keep : true; // Default to keep if AI is unsure
    });

    const aiNoise = rulesFiltered.length - finalSignals.length;
    return {
      filtered: finalSignals,
      noiseCount: rulesNoise + aiNoise,
      summary: `Hybrid Gating Complete. Rules Purged: ${rulesNoise}. AI Purged: ${aiNoise}. Final: ${finalSignals.length}.`
    };
  } catch (e) {
    console.warn("⚠️ [Gating-Engine] AI pass failed, falling back to rules-only results.");
    return { filtered: rulesFiltered, noiseCount: rulesNoise, summary: `Rules-only Gating Complete. Purged: ${rulesNoise}.` };
  }
}

export function detectVolatilitySpike(rawData, spikeThreshold = 0.02) {
    return rawData.filter(item => Math.abs(item.d?.[1] || 0) > (spikeThreshold * 100));
}
