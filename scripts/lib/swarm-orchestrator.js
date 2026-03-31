import { askAI } from "./ai-service.js";
import { 
  VERTICALS, 
  CONSENSUS_PERSONAS,
  getResearcherPrompt, 
  getDrafterPrompt, 
  getEditorPrompt, 
  getArticlePrompt,
  getExpertPersonaPrompt,
  getConsensusPrompt
} from "./prompts.js";
import { validateAndRepair } from "./fidelity-governor.js";

/**
 * BlogsPro Swarm 4.0: Hierarchical Multi-Swarm Orchestrator
 * ==========================================================
 * High-performance collaborative reasoning pipeline for 
 * ultra-high-density institutional manuscripts (up to 25k words).
 */

async function runConsensusDesk(frequency, semanticDigest, env) {
  console.log(`🤝 [MiroFish] Launching ${CONSENSUS_PERSONAS.length}-Agent Consensus Swarm...`);
  
  const simulations = await Promise.all(CONSENSUS_PERSONAS.map(async (persona) => {
    try {
      const result = await askAI(getExpertPersonaPrompt(persona, frequency, JSON.stringify(semanticDigest)), {
        role: 'generate',
        env,
        model: 'llama-3.1-8b-instant' // Use fast/cheap models for individual agents
      });
      return `[${persona.name}]: ${result}`;
    } catch (e) {
      console.warn(`⚠️ Persona ${persona.name} failed: ${e.message}`);
      return `[${persona.name}]: [FAILED_SIMULATION]`;
    }
  }));

  const synthesis = await askAI(getConsensusPrompt(simulations.join("\n\n"), frequency), {
    role: 'edit',
    env,
    model: 'claude-3.5-sonnet' // High-reasoning for final synthesis
  });

  // Affine Integration: Push consensus found to the sync bridge
  if (env.MIRO_SYNC) {
    try {
      await env.MIRO_SYNC.fetch("https://miro/push", {
        method: "POST",
        body: JSON.stringify({
          source: `MiroFish Swarm (${frequency.toUpperCase()})`,
          content: synthesis
        })
      });
      console.log("💎 [MiroFish] Consensus synchronized with Affine.");
    } catch (err) {
      console.warn("⚠️ Affine sync failed:", err.message);
    }
  }

  return synthesis;
}

export async function executeMultiAgentSwarm(frequency, semanticDigest, historicalData, type, env, jobId = null) {
  const isArticle = type === 'article';
  const targetVerticals = isArticle ? VERTICALS : [{ id: "consolidated", name: "Institutional Pulse" }];
  
  const id = jobId || `swarm-${Date.now()}`;
  const startTime = Date.now();
  console.log(`🐝 [Swarm] Starting Hierarchical Orchestration [ID: ${id}] [Scale: ${targetVerticals.length} Swarms]`);

  // --- 1. INITIALIZE DURABLE OBJECT ---
  let manuscriptDO = null;
  if (isArticle && env.MANUSCRIPT_DO) {
    const doId = env.MANUSCRIPT_DO.idFromName(id);
    manuscriptDO = env.MANUSCRIPT_DO.get(doId);
    
    await manuscriptDO.fetch(new Request("https://do/initialize", {
      method: "POST",
      body: JSON.stringify({ jobId: id, frequency, verticalIds: targetVerticals.map(v => v.id) })
    }));
  }
  
  let combinedChapters = "";

  for (const vertical of targetVerticals) {
    console.log(`🕵️ [Sub-Swarm] Analyzing Vertical: ${vertical.name}...`);
    
    // STAGE 1: THE RESEARCHER (Analytic Pass)
    const researchBrief = await askAI(getResearcherPrompt(frequency, semanticDigest, historicalData), {
      role: 'research',
      env,
      model: 'gemini-3.1-pro'
    });

    // STAGE 2: THE DRAFTER (Structural Pass)
    const chapterDraft = await askAI(getDrafterPrompt(frequency, researchBrief, vertical.name), {
      role: 'generate',
      env,
      model: 'llama-3.3-70b'
    });

    // UPDATE DURABLE OBJECT FOR PROGRESS
    if (manuscriptDO) {
      await manuscriptDO.fetch(new Request("https://do/update", {
        method: "POST",
        body: JSON.stringify({ verticalId: vertical.id, content: chapterDraft })
      }));
    }

    combinedChapters += `\n\n${chapterDraft}`;
  }

  // STAGE 2.5: THE CONSENSUS DESK (Strategic Drift)
  const consensusSummary = await runConsensusDesk(frequency, semanticDigest, env);
  combinedChapters = `<h2>SWARM CONSENSUS & TACTICAL SIMULATION</h2>\n${consensusSummary}\n\n${combinedChapters}`;

  // STAGE 3: THE CHIEF EDITOR (Harden & Merge)
  console.log("👔 [Swarm] Chief Editor: Merging and Hardening Industrial Pass...");
  const polishedManuscript = await askAI(getEditorPrompt(combinedChapters, frequency), {
    role: 'edit',
    env,
    model: 'claude-3.5-sonnet'
  });

  // STAGE 3.5: FIDELITY GOVERNOR (Validation & Repair)
  console.log("⚖️ [Swarm] Fidelity Governor: Validating Structural Integrity...");
  const fidelityResult = validateAndRepair(polishedManuscript);
  const finalManuscript = fidelityResult.content;

  // STAGE 4: TEMPLATE ENGINE (Bloomberg-Gold UI/UX Pass)
  console.log("🎨 [Swarm] Calling Template Engine for Industrial UI Transformation...");
  const templateRes = await env.TEMPLATE_ENGINE.fetch(new Request("https://templates/transform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `${frequency.toUpperCase()} Strategic Manuscript`,
      excerpt: semanticDigest.strategicLead || "Institutional Macro Drift Analysis.",
      content: finalManuscript,
      dateLabel: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      type,
      freq: frequency,
      fileName: `swarm-${frequency}-${Date.now()}.html`,
      rel: "../../",
      priceInfo: { last: "BLOOMBERG_LIVE", high: "N/A", low: "N/A" } // Placeholders for UI
    })
  }));

  const { html, wordCount } = await templateRes.json();
  const latency = Date.now() - startTime;
  console.log(`✅ [Swarm] Hierarchical Pass Complete. Total Words: ${wordCount} [Latency: ${latency}ms]`);

  // --- 5. LOG INSTITUTIONAL TELEMETRY ---
  if (env.ANALYTICS) {
    try {
      env.ANALYTICS.writeDataPoint({
        blobs: [id, frequency, type, isArticle ? "hierarchical" : "micro"],
        doubles: [wordCount, latency, 0], // Consensus score can be added later
        indexes: [id]
      });
      console.log("🛰 [Swarm] Telemetry Dispatched to Cloudflare Analytics Engine.");
    } catch (err) {
      console.warn("⚠️ Telemetry failed:", err.message);
    }
  }

  return {
    final: html,
    wordCount,
    raw: polishedManuscript,
    jobId: id
  };
}
