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

export async function executeMultiAgentSwarm(frequency, semanticDigest, historicalData, type, env) {
  const isArticle = type === 'article';
  
  // 1. SELECT SCALE (Hierarchical vs Single-Shot)
  // If Article (Weekly/Monthly), execute 16 specialized sub-swarms.
  // If Briefing (Hourly/Daily), execute a single consolidated micro-swarm.
  const targetVerticals = isArticle ? VERTICALS : [{ id: "consolidated", name: "Institutional Pulse" }];
  
  console.log(`🐝 [Swarm] Starting Hierarchical Orchestration [Scale: ${targetVerticals.length} Swarms]`);
  
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
  console.log(`✅ [Swarm] Hierarchical Pass Complete. Total Words: ${wordCount}`);

  return {
    final: html,
    wordCount,
    raw: polishedManuscript,
    research: "Summarized in Manuscript"
  };
}
