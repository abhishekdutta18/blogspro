import { askAI } from "./ai-service.js";
import { 
  VERTICALS, 
  getResearcherPrompt, 
  getDrafterPrompt, 
  getEditorPrompt, 
  getArticlePrompt 
} from "./prompts.js";

/**
 * BlogsPro Swarm 4.0: Hierarchical Multi-Swarm Orchestrator
 * ==========================================================
 * High-performance collaborative reasoning pipeline for 
 * ultra-high-density institutional manuscripts (up to 25k words).
 */

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

  // STAGE 3: THE CHIEF EDITOR (Harden & Merge)
  console.log("👔 [Swarm] Chief Editor: Merging and Hardening Industrial Pass...");
  const polishedManuscript = await askAI(getEditorPrompt(combinedChapters, frequency), {
    role: 'edit',
    env,
    model: 'claude-3.5-sonnet'
  });

  // STAGE 4: TEMPLATE ENGINE (Bloomberg-Gold UI/UX Pass)
  console.log("🎨 [Swarm] Calling Template Engine for Industrial UI Transformation...");
  const templateRes = await env.TEMPLATE_ENGINE.fetch(new Request("https://templates/transform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `${frequency.toUpperCase()} Strategic Manuscript`,
      excerpt: semanticDigest.strategicLead || "Institutional Macro Drift Analysis.",
      content: polishedManuscript,
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
