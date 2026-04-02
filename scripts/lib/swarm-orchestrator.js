import fs from "fs";
import { askAI } from "./ai-service.js";
import { 
  VERTICALS, 
  CONSENSUS_PERSONAS,
  getResearcherPrompt, 
  getDrafterPrompt, 
  getEditorPrompt, 
  getArticlePrompt,
  getExpertPersonaPrompt,
  getConsensusPrompt,
  getCriticPrompt,
  getRefinementPrompt,
  getManagerAuditPrompt,
  getManagerCorrectionPrompt
} from "./prompts.js";
import { calculateReward } from "./rl-metrics.js";
import { validateAndRepair } from "./fidelity-governor.js";
import { captureSwarmError, logSwarmBreadcrumb, logBlackboardMemo } from "./sentry-bridge.js";
import { detectAndAlert } from "./black-swan-alert.js";
import * as rules from "./rules-engine.js";
import { dispatchInstitutionalAlert } from "./social-utils.js";
import { fetchDynamicNews } from "./data-fetchers.js";
import rl from "./reinforcement.js";

/**
 * BlogsPro Swarm 5.0: Sequential-Hierarchical Blackboard Orchestrator
 * ===================================================================
 * High-performance collaborative reasoning pipeline for 
 * ultra-high-density institutional manuscripts (up to 25k words).
 */

export async function notifyProgress(env, jobId, data) {
  if (!env.MIRO_SYNC_DO) return;
  try {
    const id = env.MIRO_SYNC_DO.idFromName('global-swarm-bridge');
    const stub = env.MIRO_SYNC_DO.get(id);
    
    await stub.fetch("https://sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        source: "SWARM_PROGRESS", 
        jobId, 
        timestamp: new Date().toISOString(), 
        ...data 
      })
    });
    // [V5.3] 200ms delay to prevent DO rate-limiting in parallel fan-outs
    await new Promise(r => setTimeout(r, 200));
  } catch (e) {
    if (env.DEBUG) console.warn("⚠️ Telemetry Bridge Stalled:", e.message);
  }
}

/**
 * executeSingleVerticalSwarm
 * -------------------------
 * Executes a dedicated Researcher -> Drafter -> Auditor loop for a single vertical.
 * Used internally by both Parallel Fan-out and Consolidated Pulses.
 */
export async function executeSingleVerticalSwarm(vertical, index, frequency, semanticDigest, historicalData, env, id, extended, blackboardContext = "") {
  try {
    console.log(`🕵️ [Sub-Swarm] Analyzing Vertical: ${vertical.name}...`);
    const internetResearch = await fetchDynamicNews(vertical.name);
    
    // 0. LOAD REINFORCEMENT MEMORY
    const rlMemory = await rl.getReinforcementContext(env);

    // 1. RESEARCHER (Gemini Flash for high-volume extraction)
    const researchBrief = await askAI(getResearcherPrompt(frequency, semanticDigest, historicalData, internetResearch + blackboardContext, rlMemory), {
      role: 'research', env, model: 'gemini-1.5-flash', seed: index, extended
    });

    // 2. DRAFTER (with RL-Audit Loop)
    let chapterContent = "";
    let rlScore = 0;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && rlScore < 0.8) {
      attempts++;
      let currentPrompt = getDrafterPrompt(frequency, researchBrief, vertical.name, rlMemory);
      if (attempts > 1) {
        currentPrompt += `\n⚠️ REINFORCEMENT SIGNAL: Previous effort failed audit (Score: ${rlScore}). Increase data-density.\n`;
      }

      // Gemini Flash for high-speed drafting/regeneration
      chapterContent = await askAI(currentPrompt, { role: 'generate', env, model: 'gemini-1.5-flash', seed: index + attempts });
      rlScore = calculateReward(chapterContent, frequency === 'monthly' ? 1500 : 500);
      
      if (rlScore < 0.8 && attempts < maxAttempts) {
        await notifyProgress(env, id, { stage: "RL_PENALTY", message: `Fidelity failure in ${vertical.name}. Regenerating...` });
      }
    }

    // 3. DEEP-REFLECT (Extended Mode Only)
    if (extended) {
      const critique = await askAI(getCriticPrompt(researchBrief, chapterContent), { role: 'edit', env, model: 'gemini-1.5-pro' });
      const volumeCommand = "\n\nCRITICAL: Expand to >1,500 words for institutional depth.";
      chapterContent = await askAI(getRefinementPrompt(chapterContent, critique + volumeCommand, vertical.name), {
        role: 'generate', env, model: 'gemini-1.5-flash'
      });
    }

    // 4. MANAGER AUDIT (Independent High-Fidelity Pass)
    const auditRes = await askAI(getManagerAuditPrompt(chapterContent, vertical.name, env), { role: 'edit', env, model: 'gemini-1.5-pro' });
    let audit = { score: 0, status: "FAIL", guidance: "Malformed audit response. Retrying..." };
    try { 
      const cleaned = auditRes.replace(/```json\n?|```/g, '').trim();
      audit = JSON.parse(cleaned); 
    } catch (e) {
      console.warn(`⚠️ [Audit-Fail] Malformed JSON from Auditor for ${vertical.name}. Defaulting to repair pass.`);
    }

    if (audit.status === "FAIL" || audit.score < 80) {
      console.log(`🛠️ [Repair] Fidelity failure in ${vertical.name} (Score: ${audit.score}). Executing recovery pass...`);
      await rl.logFailure(vertical.name, audit.reason ? [audit.reason] : ['Fidelity Failure'], chapterContent, env);
      
      chapterContent = await askAI(getManagerCorrectionPrompt(chapterContent, audit.guidance), {
        role: 'generate', env, model: 'gemini-1.5-pro', seed: 99
      });
    } else {
      await rl.logSuccess(vertical.name, "Institutional alignment confirmed", chapterContent, env);
    }

    // 🛡️ $SHIELD POST-PROCESSING: Sanitize and Repair before final commit
    const sanitizedBody = rules.sanitizePayload(chapterContent);
    const repairedBody = rules.repairTables(sanitizedBody);
    const hardenedBody = rules.hardenJson(repairedBody, vertical.id);
    const visualBody = rules.injectVisuals(hardenedBody, vertical.name, vertical.id);
    const finalManuscript = rules.enforceInstitutionalSections(visualBody);

    return `<div id="sector-${vertical.id}" class="institutional-sector" data-vertical-id="${vertical.id}">\n<h2>${vertical.name.toUpperCase()}</h2>\n${finalManuscript}\n</div>`;
  } catch (err) {
    captureSwarmError(err, { vertical: vertical.name, jobId: id });
    return `<h3>${vertical.name}</h3><p>Audit Unavailable: ${err.message}</p>`;
  }
}

export async function runConsensusDesk(frequency, semanticDigest, env, jobId = null) {
  const simulations = await Promise.all(CONSENSUS_PERSONAS.map(async (persona) => {
    try {
      const result = await askAI(getExpertPersonaPrompt(persona, frequency, JSON.stringify(semanticDigest)), {
        role: 'generate', env, model: 'llama-3.1-8b-instant'
      });
      return `[${persona.name}]: ${result}`;
    } catch (e) { return `[${persona.name}]: [FAILED]`; }
  }));

  return await askAI(getConsensusPrompt(simulations.join("\n\n"), frequency), { role: 'edit', env, model: 'claude-3.5-sonnet' });
}

export async function persistLearning(verticalName, audit, status = "FAILURE") {
    // Learning ledger logic preserved
    try {
        const ledgerPath = "./knowledge/ai-feedback.json";
        const current = JSON.parse(fs.readFileSync(ledgerPath, 'utf8') || "[]");
        current.push({ type: status, timestamp: new Date().toISOString(), task: verticalName, score: audit.score });
        fs.writeFileSync(ledgerPath, JSON.stringify(current.slice(-1000), null, 2));
    } catch (e) {}
}

export async function executeMultiAgentSwarm(frequency, semanticDigest, historicalData, type, env, jobId = null) {
  const isArticle = type === 'article';
  const extended = !!env.EXTENDED_MODE;
  const targetVerticals = isArticle ? VERTICALS : [{ id: "consolidated", name: "Institutional Pulse" }];
  const id = jobId || `swarm-${Date.now()}`;
  
  await notifyProgress(env, id, { stage: "START", message: `Orchestrating ${targetVerticals.length} Vertical Swarms...` });

  const PRIORITY_VERTICAL_IDS = ['macro', 'reg', 'em', 'rates'];
  const sharedBlackboard = { strategicContext: semanticDigest.strategicLead, institutionalMemos: [], jobId: id, frequency };
  const allChapterContents = [];

  // 1. HIERARCHICAL EXECUTION (Articles Only)
  if (isArticle) {
    const priorityVerticals = targetVerticals.filter(v => PRIORITY_VERTICAL_IDS.includes(v.id));
    const sectorVerticals = targetVerticals.filter(v => !PRIORITY_VERTICAL_IDS.includes(v.id));

    for (const vertical of priorityVerticals) {
      console.log(`⚓ [Anchor] ${vertical.name}...`);
      const news = await fetchDynamicNews(vertical.name);
      const brief = await askAI(getResearcherPrompt(frequency, semanticDigest, historicalData, news), { role: 'research', env, model: 'llama-3.3-70b-versatile', extended: true });
      const memo = await askAI(`Summarize into a 150-word Strategic Telex Memo:\n\n${brief}`, { role: 'edit', env, model: 'llama-3.1-8b-instant' });
      const chapter = await askAI(getDrafterPrompt(frequency, brief, vertical.name), { role: 'generate', env, model: 'gemini-1.5-flash' });
      
      sharedBlackboard.institutionalMemos.push(`[FROM: ${vertical.name.toUpperCase()}]: ${memo}`);
      logBlackboardMemo(vertical.name, memo, { jobId: id, frequency });
      
      // 🛡️ $SHIELD POST-PROCESSING: Sanitize and Repair before final commit
      const sanitizedChapter = rules.sanitizePayload(chapter);
      const repairedChapter = rules.repairTables(sanitizedChapter);
      const visualChapter = rules.injectVisuals(repairedChapter, vertical.name, vertical.id);
      const finalChapter = rules.enforceInstitutionalSections(visualChapter);

      allChapterContents.push(`<div id="sector-${vertical.id}" class="institutional-sector"><h2>${vertical.name.toUpperCase()}</h2>${finalChapter}</div>`);
    }

    const blackboardContext = `\n📋 INSTITUTIONAL ANCHOR MEMOS:\n${sharedBlackboard.institutionalMemos.join("\n")}`;
    const sectorResults = await Promise.all(sectorVerticals.map(async (v, i) => executeSingleVerticalSwarm(v, i, frequency, semanticDigest, historicalData, env, id, extended, blackboardContext)));
    allChapterContents.push(...sectorResults);
  } else {
    // 2. FAST PULSE PATH (Consolidated)
    const pulseResult = await executeSingleVerticalSwarm(targetVerticals[0], 0, frequency, semanticDigest, historicalData, env, id, false, "");
    allChapterContents.push(pulseResult);
  }

  // 3. SYNTHESIS & GOVERNANCE
  let consensusSummary = "No strategic drift detected for hourly pulse.";
  if (frequency !== 'hourly') {
      consensusSummary = await runConsensusDesk(frequency, semanticDigest, env, id);
  }
  
  const executiveStrategy = await askAI(getEditorPrompt(consensusSummary, frequency), { role: 'edit', env, model: 'claude-3.5-sonnet' });

  const combinedManuscript = `<div id="strategic-pulse">${executiveStrategy}</div><hr>${allChapterContents.join("\n\n")}`;
  
  // 🛡️ FINAL $SHIELD AUDIT PASS: Purge all remaining jargon and prompts
  const finalManuscript = rules.sanitizePayload(combinedManuscript);
  const fidelityResult = validateAndRepair(finalManuscript);
  
  // 4. TEMPLATE ENGINE & DELIVERY (Safe-Fetch Handshake)
  let finalHtml = `<html><body>${fidelityResult.content}</body></html>`;
  let finalCount = fidelityResult.content.split(/\s+/).length;

  try {
    const templateRes = await env.TEMPLATE_ENGINE.fetch(new Request("https://templates/transform", {
      method: "POST", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        title: `${frequency.toUpperCase()} Strategic Manuscript`, 
        content: fidelityResult.content, 
        type, 
        freq: frequency 
      })
    }));

    if (templateRes.ok) {
      const { html, wordCount: wc } = await templateRes.json();
      finalHtml = html;
      finalCount = wc;
    } else {
      console.warn(`⚠️ [Template-Engine] Failed (HTTP ${templateRes.status}). Using raw fidelity output.`);
    }
  } catch (e) {
    console.warn("⚠️ [Template-Engine] Bindings uninitialized or crashed. Using raw fidelity output.", e.message);
  }

  if (extended) await detectAndAlert({ wordCount: finalCount, raw: finalManuscript, jobId: id }, frequency);

  return { final: finalHtml, wordCount: finalCount, raw: finalManuscript, jobId: id };
}

/**
 * finalizeManuscript
 * ------------------
 * Consolidates individual sector results into a cohesive institutional briefing.
 * Applies final $SHIELD audit and template transformation.
 */
export async function finalizeManuscript(allChapterContents, consensusSummary, frequency, type, env, id) {
  const executiveStrategy = await askAI(getEditorPrompt(consensusSummary, frequency), { 
    role: 'edit', env, model: 'claude-3.5-sonnet' 
  });

  const combinedManuscript = `<div id="strategic-pulse">${executiveStrategy}</div><hr>${allChapterContents.join("\n\n")}`;
  
  // 🛡️ FINAL $SHIELD AUDIT PASS
  const finalManuscript = rules.sanitizePayload(combinedManuscript);
  const fidelityResult = validateAndRepair(finalManuscript);
  
  let finalHtml = `<html><body>${fidelityResult.content}</body></html>`;
  let finalCount = fidelityResult.content.split(/\s+/).length;

  try {
    const templateRes = await env.TEMPLATE_ENGINE.fetch(new Request("https://templates/transform", {
      method: "POST", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        title: `${frequency.toUpperCase()} Strategic Manuscript`, 
        content: fidelityResult.content, 
        type, 
        freq: frequency 
      })
    }));

    if (templateRes.ok) {
      const { html, wordCount: wc } = await templateRes.json();
      finalHtml = html;
      finalCount = wc;
    }
  } catch (e) {
    console.warn("⚠️ [Template-Engine] Finalization fallback used.", e.message);
  }

  return { final: finalHtml, wordCount: finalCount, raw: finalManuscript, jobId: id };
}
