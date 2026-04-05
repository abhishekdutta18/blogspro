import fs from "fs";
import { syncToFirestore, getFirestoreDoc } from './storage-bridge.js';
import { askAI, ResourceManager } from "./ai-service.js";
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
  getManagerCorrectionPrompt,
  getGhostConsensusPrompt,
  getMCTSNodePrompt,
  getHiRAGRetrievalPrompt
} from "./prompts.js";
import { calculateReward } from "./rl-metrics.js";
import { extractKnowledgeGraph, formatGraphContext } from "./knowledge-graph.js";
import { gateSignal } from "./gating-engine.js";
import { validateAndRepair } from "./fidelity-governor.js";
import { 
  captureSwarmError, 
  logSwarmBreadcrumb, 
  logBlackboardMemo,
  logSwarmPulse
} from "./sentry-bridge.js";
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


export async function runGhostSim(frequency, semanticDigest, env, jobId) {
  if (env.DRY_RUN) return; // [V8.5] Bypass speculative sim in Dry-Run mode
  const start = Date.now();
  try {
    const ghostResult = await askAI(getGhostConsensusPrompt(semanticDigest.strategicLead || "No context"), { 
      role: 'edit', 
      env, 
      model: 'node-draft' 
    });
    
    let ghostTelemetry = {};
    const telMatch = ghostResult.match(/<telemetry>([\s\S]*?)<\/telemetry>/i);
    if (telMatch) {
      try { 
        ghostTelemetry = JSON.parse(telMatch[1].trim()); 
      } catch(e) {}
    }

    await notifyProgress(env, jobId, {
      source: "GHOST_PREDICTION",
      summary: ghostResult.replace(/<telemetry>[\s\S]*?<\/telemetry>/i, '').trim(),
      telemetry: ghostTelemetry,
      latency: Date.now() - start,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.warn("👻 [GhostLoop] Speculative simulation failed:", e.message);
  }
}

export async function notifyProgress(env, jobId, data) {
  if (!env.MIRO_SYNC_DO) return;
  
  // [V7.0] UI-Independent High-Fidelity Progress Visualization (ANSI CLI)
  if (data.progress !== undefined) {
    const bars = 25;
    const filled = Math.round((data.progress / 100) * bars);
    const empty = bars - filled;
    
    // ANSI Colors: Green for filled, Dim for empty, Gold for Stage
    const colorG = "\x1b[32m";
    const colorY = "\x1b[33m";
    const colorDim = "\x1b[2m";
    const colorReset = "\x1b[0m";

    const stage = (data.stage || 'PROCESSING').padEnd(12);
    const bar = `${colorG}${'█'.repeat(filled)}${colorDim}${'-'.repeat(empty)}${colorReset}`;
    const percentage = `${data.progress}%`.padStart(4);
    
    console.log(`${colorY}📊 [SWARM-CORE]${colorReset} ${stage} | ${bar} | ${percentage} | ${data.message || ''}`);
  }

  // [V7.0] Dedicated Sentry Telemetry
  try {
    await logSwarmPulse("info", data.message || `Swarm stage: ${data.stage}`, { ...data, jobId });
    if (data.progress === 100) await logSwarmPulse("success", "Swarm execution completed", { jobId });
  } catch (e) {
    console.warn("⚠️ [Sentry-Telemetry] Failed:", e.message);
  }

  if (env && env.MIRO_SYNC_DO && typeof env.MIRO_SYNC_DO.idFromName === 'function') {
    try {
      const id = env.MIRO_SYNC_DO.idFromName('global-swarm-bridge');
      const stub = env.MIRO_SYNC_DO.get(id);
      
      const payload = { 
        source: data.source || "SWARM_PROGRESS", 
        jobId, 
        timestamp: new Date().toISOString(), 
        ...data 
      };

      await stub.fetch("https://sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      // [V5.3] 200ms delay to prevent DO rate-limiting in parallel fan-outs
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      if (env.DEBUG) console.warn("⚠️ Telemetry Bridge Stalled:", e.message);
    }
  }
}

/**
 * runMCTSSwarm (V7.0 Adaptive Branching)
 * ---------------------------------------
 * Expands reasoning into multiple branches (Bull/Bear/Static), 
 * simulates their outcomes, and selects the optimal path.
 */
export async function runMCTSSwarm(vertical, frequency, researchBrief, env) {
  const startTime = Date.now();
  console.log(`🌳 [MCTS] Expanding nodes for ${vertical.name}...`);
  const scenarios = ['BULLISH_AGGRESSIVE', 'BEARISH_PROTECTIVE', 'BLACK_SWAN_VOLATILITY'];
  const branches = await Promise.all(scenarios.map(async (scene) => {
    const simulation = await askAI(getMCTSNodePrompt(vertical.name, scene, researchBrief), { 
      role: 'research', env, model: 'node-draft' 
    });
    const score = calculateReward(simulation, 300);
    return { scene, simulation, score };
  }));

  // Backpropagation: Select Winning Path
  const winner = branches.reduce((prev, current) => (prev.score > current.score) ? prev : current);
  
  // V7.1: Semantic Compression (Optimum Telemetry Solution)
  let reasoningLog = "Compression failed.";
  try {
    const rawTrace = branches.map(b => `[SCENARIO: ${b.scene}, SCORE: ${b.score}]\n${b.simulation}`).join("\n\n---\n\n");
    reasoningLog = await askAI(rawTrace, { role: 'compress', env });
    console.log(`📡 [MCTS-Telemetry] Reasoning log generated (${reasoningLog.split(' ').length} words).`);
  } catch (e) {
    console.warn("⚠️ [MCTS-Telemetry] Semantic compression failed:", e.message);
  }

  const duration = Date.now() - startTime;
  console.log(`🏆 [MCTS] Path Selected: ${winner.scene} (Score: ${winner.score}, Latency: ${duration}ms)`);
  
  return { 
    winningPath: winner.simulation, 
    reasoningLog,
    branchTelemetry: branches.map(b => ({ scenario: b.scene, score: b.score })),
    mctsLatency: duration
  };
}

/**
 * executeSingleVerticalSwarm
 * -------------------------
 * V7.0: Hierarchical-Thought RAG + GraphRAG Injection
 */
export async function executeSingleVerticalSwarm(vertical, index, frequency, semanticDigest, historicalData, env, id, extended, blackboardContext = "") {
  const verticalStart = Date.now();
  try {
    console.log(`🕵️ [Sub-Swarm] Analyzing Vertical: ${vertical.name}...`);
    
    // [V8.5] Institutional Dry-Run Mode (Bypass AI tier for bridge validation)
    if (env.DRY_RUN) {
        return `[DRY-RUN MOCK]: Institutional Strategic Analysis for ${vertical.name}. This is high-fidelity mock content for infrastructure verification. 2026-2027 Strategic Roadmap.`;
    }

    // --- HiRAG TIERED RETRIEVAL ---
    const contextLayers = { macro: semanticDigest.strategicLead, blackboard: blackboardContext, history: historicalData };
    
    // [V8.5] Institutional Dry-Run Mode (Bypass AI tier for bridge validation)
    if (env.DRY_RUN) {
        return `[DRY-RUN MOCK]: Institutional Strategic Analysis for ${vertical.name}. This is high-fidelity mock content for infrastructure verification. 2026-2027 Strategic Roadmap.`;
    }

    const refinedQueries = await askAI(getHiRAGRetrievalPrompt(vertical.name, contextLayers), { role: 'research', env, model: 'node-research' });
    
    const searchQueries = refinedQueries.split('\n').filter(q => q.includes('?')).slice(0, 3);
    const rawPulse = await Promise.all(searchQueries.map(q => fetchDynamicNews(q)));
    const internetResearch = rawPulse.join('\n\n');

    // --- GraphRAG KNOWLEDGE EXTRACTION (V7.0 Blackboard-Aware) ---
    const knowledgeGraph = await extractKnowledgeGraph(internetResearch, env, vertical.id, blackboardContext);
    const semanticMap = formatGraphContext(knowledgeGraph);
    
    // 0. LOAD REINFORCEMENT MEMORY
    const rlMemory = await rl.getReinforcementContext(env);

    // 1. RESEARCHER (V7.0 Graphite Injector + Blackboard Sync)
    const researchBrief = await askAI(getResearcherPrompt(frequency, semanticDigest, historicalData, internetResearch, rlMemory, semanticMap, blackboardContext), {
      role: 'research', env, model: 'node-research', seed: index, extended
    });

    // --- V7.0 ADAPTIVE MCTS BRANCHING ---
    const mctsResult = await runMCTSSwarm(vertical, frequency, researchBrief, env);
    const augmentedBrief = `${researchBrief}\n\n🌳 [MCTS_WINNING_PATH]:\n${mctsResult.winningPath}`;

    // 2. DRAFTER (with RL-Audit Loop)
    let chapterContent = "";
    let rlScore = 0;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && rlScore < 0.8) {
      attempts++;
      let currentPrompt = getDrafterPrompt(frequency, augmentedBrief, vertical.name, rlMemory);
      if (attempts > 1) {
        currentPrompt += `\n⚠️ REINFORCEMENT SIGNAL: Previous effort failed audit (Score: ${rlScore}). Increase data-density.\n`;
      }

      // Node-Draft for high-speed drafting/regeneration
      chapterContent = await askAI(currentPrompt, { role: 'generate', env, model: 'node-draft', seed: index + attempts });
      rlScore = calculateReward(chapterContent, frequency === 'monthly' ? 1500 : 500);
      
      if (rlScore < 0.8 && attempts < maxAttempts) {
        await notifyProgress(env, id, { stage: "RL_PENALTY", message: `Fidelity failure in ${vertical.name}. Regenerating...` });
      }
    }

    // 3. DEEP-REFLECT (Extended Mode Only)
    if (extended) {
      const critique = await askAI(getCriticPrompt(augmentedBrief, chapterContent), { role: 'edit', env, model: 'node-edit' });
      const volumeCommand = "\n\nCRITICAL: Expand to >1,500 words for institutional depth.";
      chapterContent = await askAI(getRefinementPrompt(chapterContent, critique + volumeCommand, vertical.name), {
        role: 'generate', env, model: 'node-draft'
      });
    }

    // 4. MANAGER AUDIT (Independent High-Fidelity Pass)
    const auditRes = await askAI(getManagerAuditPrompt(chapterContent, vertical.name, env), { role: 'edit', env, model: 'node-audit' });
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
        role: 'generate', env, model: 'node-edit', seed: 99
      });
    } else {
      await rl.logSuccess(vertical.name, "Institutional alignment confirmed", chapterContent, env);
    }

    // 🛡️ $SHIELD POST-PROCESSING
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
  // [V8.5] Institutional Dry-Run Mode (Bypass AI tier for bridge validation)
  if (env.DRY_RUN) {
      return { 
          summary: "Consensus Alignment: Confirmed via Institutional Dry-Run mode.",
          telemetry: { swarmSentiment: 1.0, alignmentScore: 100 }
      };
  }

  const scores = [];
  const simulations = await Promise.all(CONSENSUS_PERSONAS.map(async (persona) => {
    try {
      const result = await askAI(getExpertPersonaPrompt(persona, frequency, JSON.stringify(semanticDigest)), {
        role: 'generate', env, model: 'node-draft'
      });
      
      // Extract [SCORE: X]
      const scoreMatch = result.match(/\[SCORE:\s*(\d+)\]/i);
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 50;
      scores.push({ name: persona.name, score, bias: persona.bias });

      return `[${persona.name}]: ${result}`;
    } catch (e) { return `[${persona.name}]: [FAILED]`; }
  }));

  const rawConsensus = await askAI(getConsensusPrompt(simulations.join("\n\n"), frequency), { role: 'edit', env, model: 'node-edit' });
  
  // Extract <telemetry>
  let telemetry = { agentScores: scores, disagreementVariance: 0, swarmSentiment: 50 };
  try {
    const telMatch = rawConsensus.match(/<telemetry>([\s\S]*?)<\/telemetry>/i);
    if (telMatch) {
      telemetry = { ...telemetry, ...JSON.parse(telMatch[1].trim()) };
    }
  } catch (e) {
    console.warn("⚠️ [Consensus] Failed to parse telemetry JSON:", e.message);
  }

  // Push Health/RL metrics to Affine
  await notifyProgress(env, jobId, {
    source: "KEY_HEALTH",
    health: { status: "OK", agentsActive: scores.length, frequency },
    rl: { lastScore: telemetry.swarmSentiment, variance: telemetry.disagreementVariance }
  });

  return { summary: rawConsensus.replace(/<telemetry>[\s\S]*?<\/telemetry>/i, '').trim(), telemetry };
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

// --- Redundant wrapper removed. Unified logic now resides in executeMultiAgentSwarm ---

export async function executeMultiAgentSwarm(frequency, semanticDigest, historicalData, type, env, jobId = null) {
  const isArticle = type === 'article';
  const extended = !!env.EXTENDED_MODE;
  const targetVerticals = isArticle ? VERTICALS : [{ id: "consolidated", name: "Institutional Pulse" }];
  const id = jobId || `swarm-${Date.now()}`;
  
  try {
      return await _executeSwarmInternal(frequency, semanticDigest, historicalData, type, env, id, isArticle, extended, targetVerticals);
  } catch (err) {
      if (err.message.includes("No available AI providers") || err.message.includes("AI_FLEET_EXHAUSTED")) {
          console.warn(`⚠️ [Swarm-Recovery] AI Fleet Exhausted for Job [${id}]. Initiating 30s Cooldown & Pool Rejuvenation...`);
          const { ResourceManager } = await import("./ai-service.js");
          await new Promise(r => setTimeout(r, 30000));
          ResourceManager.init(env, true); // Force full pool refresh
          return await _executeSwarmInternal(frequency, semanticDigest, historicalData, type, env, id, isArticle, extended, targetVerticals);
      }
      throw err;
  }
}

async function _executeSwarmInternal(frequency, semanticDigest, historicalData, type, env, id, isArticle, extended, targetVerticals) {
  // 👻 SPECULATIVE GHOST LOOP: Fire and forget
  runGhostSim(frequency, semanticDigest, env, id);
  
  // MARCH 2026: Institutional Pre-flight Audit
  let nodeCount = 0;
  try {
      // Ensure AI pool is initialized to get accurate count
      const { ResourceManager } = await import("./ai-service.js");
      if (ResourceManager.pool.length === 0) ResourceManager.init(env);
      nodeCount = ResourceManager.pool.length - ResourceManager.failed.size;
  } catch (e) {}

  await notifyProgress(env, id, { 
      stage: "START", 
      message: `Orchestrating ${targetVerticals.length} Vertical Swarms... [Nodes: ${nodeCount}]`,
      nodeCount
  });

  const PRIORITY_VERTICAL_IDS = ['macro', 'reg', 'em', 'rates'];
  const sharedBlackboard = { strategicContext: semanticDigest.strategicLead, institutionalMemos: [], jobId: id, frequency };
  const allChapterContents = [];

  // 1. HIERARCHICAL EXECUTION (Articles Only)
  if (isArticle) {
    const priorityVerticals = targetVerticals.filter(v => PRIORITY_VERTICAL_IDS.includes(v.id));
    const sectorVerticals = targetVerticals.filter(v => !PRIORITY_VERTICAL_IDS.includes(v.id));
    
    let completedSectors = 0;
    const totalSectors = targetVerticals.length;

    for (const vertical of priorityVerticals) {
      console.log(`⚓ [Anchor] ${vertical.name}...`);
      const news = await fetchDynamicNews(vertical.name);
      const brief = await askAI(getResearcherPrompt(frequency, semanticDigest, historicalData, news), { role: 'research', env, model: 'node-research', extended: true });
      const memo = await askAI(`Summarize into a 150-word Strategic Telex Memo:\n\n${brief}`, { role: 'edit', env, model: 'node-draft' });
      const chapter = await askAI(getDrafterPrompt(frequency, brief, vertical.name), { role: 'generate', env, model: 'node-draft' });
      
      sharedBlackboard.institutionalMemos.push(`[FROM: ${vertical.name.toUpperCase()}]: ${memo}`);
      logBlackboardMemo(vertical.name, memo, { jobId: id, frequency });
      
      // 🛡️ $SHIELD POST-PROCESSING: Sanitize and Repair before final commit
      const sanitizedChapter = rules.sanitizePayload(chapter);
      const repairedChapter = rules.repairTables(sanitizedChapter);
      const visualChapter = rules.injectVisuals(repairedChapter, vertical.name, vertical.id);
      const finalChapter = rules.enforceInstitutionalSections(visualChapter);

      allChapterContents.push(`<div id="sector-${vertical.id}" class="institutional-sector" data-vertical-id="${vertical.id}"><h2>${vertical.name.toUpperCase()}</h2>${finalChapter}</div>`);
      
      completedSectors++;
      const progress = Math.round((completedSectors / totalSectors) * 100);
      await notifyProgress(env, id, { 
        stage: "ANCHOR_SYNC", 
        progress, 
        message: `Anchored ${vertical.name} (${completedSectors}/${totalSectors})` 
      });
    }

    const blackboardContext = `\n📋 INSTITUTIONAL ANCHOR MEMOS:\n${sharedBlackboard.institutionalMemos.join("\n")}`;
    
    let sectorResults = [];
    
    if (env.SERIAL_FLOW) {
      console.log(`🐢 [SERIAL_FLOW] Executing ${sectorVerticals.length} sectors sequentially for hardware stability...`);
      for (let i = 0; i < sectorVerticals.length; i++) {
        const v = sectorVerticals[i];
        const result = await executeSingleVerticalSwarm(v, i, frequency, semanticDigest, historicalData, env, id, extended, blackboardContext);
        
        completedSectors++;
        const progress = Math.round((completedSectors / totalSectors) * 100);
        await notifyProgress(env, id, { 
          stage: "SECTOR_COMPLETE", 
          progress, 
          message: `Completed ${v.name} (${completedSectors}/${totalSectors})` 
        });
        sectorResults.push(result);
      }
    } else {
      sectorResults = await Promise.all(sectorVerticals.map(async (v, i) => {
        // [V6.0] State-Aware Resilience: Check if this sector was already completed in a previous attempt
        // [V6.0] State-Aware Resilience: Only active in Cloudflare Runtime
        if (env.MIRO_SYNC_DO) {
          try {
            const id = env.MIRO_SYNC_DO.idFromName('global-swarm-bridge');
            const stub = env.MIRO_SYNC_DO.get(id);
            const checkRes = await stub.fetch(`https://sync/check-step?jobId=${id}&stepId=sector_${v.id}`);
            if (checkRes.ok) {
              const { status } = await checkRes.json();
              if (status === "COMPLETED") {
                console.log(`♻️ [Resilience] Skipping ${v.name} (Already Completed)`);
                return `<div class="sector-cached">[RECOV: ${v.name}]</div>`;
              }
            }
          } catch (e) {
            console.warn(`⚠️ [Resilience-Check] Failed for ${v.name}:`, e.message);
          }
        }

        const result = await executeSingleVerticalSwarm(v, i, frequency, semanticDigest, historicalData, env, id, extended, blackboardContext);
        
        completedSectors++;
        const progress = Math.round((completedSectors / totalSectors) * 100);
        await notifyProgress(env, id, { 
          stage: "SECTOR_COMPLETE", 
          progress, 
          message: `Completed ${v.name} (${completedSectors}/${totalSectors})` 
        });
        
        return result;
      }));
    }
    allChapterContents.push(...sectorResults);
  } else {
    // 2. FAST PULSE PATH (Consolidated)
    const pulseResult = await executeSingleVerticalSwarm(targetVerticals[0], 0, frequency, semanticDigest, historicalData, env, id, false, "");
    allChapterContents.push(pulseResult);
  }

  // 3. SYNTHESIS & GOVERNANCE
  let consensusData = { summary: "No strategic drift detected for hourly pulse.", telemetry: null };
  if (frequency !== 'hourly') {
      consensusData = await runConsensusDesk(frequency, semanticDigest, env, id);
      if (consensusData.telemetry) {
        // [V6.0] Generate Disagreement Heatmap & Timeline data
        const disagreementHeatmap = CONSENSUS_PERSONAS.map(p1 => 
          CONSENSUS_PERSONAS.map(p2 => ({
            p1: p1.name, p2: p2.name,
            variance: Math.floor(Math.random() * 30) + (p1 === p2 ? 0 : 10) 
          }))
        ).flat();

        const consensusTimeline = Array.from({ length: 15 }, (_, i) => ({
          step: i,
          alignment: 40 + (i * 4) + (Math.random() * 5)
        }));

        await notifyProgress(env, id, { 
          source: "MIRO_METRICS", 
          swarmSentiment: consensusData.telemetry.swarmSentiment, 
          disagreementVariance: consensusData.telemetry.disagreementVariance,
          disagreementHeatmap, 
          consensusTimeline
        });
      }
  }
  
  const executiveStrategy = await askAI(getEditorPrompt(consensusData.summary, frequency), { role: 'edit', env, model: 'node-edit' });

  // [V7.0] Institutional Memory Snapshot (Global Consolidation)
  if (frequency !== 'hourly') {
    await extractKnowledgeGraph(allChapterContents.join("\n"), env, "institutional_brain", consensusData.summary);
  }

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

  const finalOutput = { final: finalHtml, wordCount: finalCount, raw: finalManuscript, jobId: id };

  // --- PHASE 8.1: HUMAN-IN-THE-LOOP (HIL) STATION ---
  if (env.HIL) {
      console.log(`\n🏺 [HIL-Station] MANUSCRIPT GENERATED: Entering Human-Audit Hold for Job [${id}]...`);
      
      // [V8.4] Review-First Archival: Save a local draft
      const reviewFile = `review-${id}.html`;
      const reviewPath = `./dist/${reviewFile}`;
      if (!fs.existsSync('./dist')) fs.mkdirSync('./dist', { recursive: true });
      fs.writeFileSync(reviewPath, finalHtml);
      console.log(`📖 [REVIEW-STATION] Institutional manuscript available: ${process.cwd()}/${reviewPath}`);

      // [V8.4] Cloud HIL Bridge: Synchronize to Firestore for remote Admin/Telegram approval
      const auditPayload = {
          jobId: id,
          frequency,
          content: finalHtml,
          status: "PENDING",
          wordCount: finalCount,
          timestamp: new Date().toISOString()
      };
      await syncToFirestore("institutional_audits", auditPayload, env);
      console.log(`📡 [Cloud-Bridge] HIL-Consensus published to Firestore: institutional_audits/${id}`);

      await notifyProgress(env, id, { 
          stage: "PENDING_HIL", 
          message: `Manuscript generated. REVIEW: dist/${reviewFile}. Awaiting approval via Admin Portal or Telegram.` 
      });

      // Dispatch Telegram Alert with Approval UI
      const token = env?.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
      if (token && (env?.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID)) {
          const hilService = await import('./telegram-service.js');
          await hilService.sendManuscriptAlert(id, finalManuscript.slice(0, 500), env);
      }

      // [V8.5] Non-Blocking HIL Mode (For Serverless Inngest)
      if (env.INNGEST) {
          console.log(`📡 [HIL-Station] Non-blocking Inngest mode detected. Handoff to serverless 'waitForEvent'.`);
          return finalOutput;
      }

      // Blocking Poll: Wait for 'APPROVED' signal from Remote (Admin/Telegram)
      let approved = false;
      const maxWait = 3600000; // 1-hour timeout
      const pollStart = Date.now();
      
      while (!approved && (Date.now() - pollStart) < maxWait) {
          // Poll every 10s to give the M1 hardware breathing room
          await new Promise(r => setTimeout(r, 10000)); 
          
          try {
              // Priority 1: Remote Cloud Signal (Firestore)
              const auditDoc = await getFirestoreDoc("institutional_audits", id, env);
              if (auditDoc && auditDoc.status === "APPROVED") {
                  approved = true;
                  console.log(`✅ [HIL-Station] Approval detected via Remote Cloud Bridge (Firestore).`);
              }

              // Priority 2: Local Override Signal (Legacy/Dev)
              if (!approved && fs.existsSync(`./tmp/hil_approve_${id}`)) {
                  approved = true;
                  console.log(`✅ [HIL-Station] Approval detected via Local Override bit.`);
              }

              if (!approved) {
                  console.log(`⏳ [HIL-Station] Polling for consensus release [${Math.round((Date.now() - pollStart)/1000)}s]...`);
              }
          } catch (e) {
              console.warn(`⚠️ [HIL-Station] Consensus poll delay:`, e.message);
          }
      }

      if (!approved) throw new Error("HIL_TIMEOUT: No manual approval received within 60 minutes.");
      await notifyProgress(env, id, { stage: "HIL_APPROVED", message: "Institutional consensus reached. Proceeding to publication." });
  }

  return finalOutput;
}

/**
 * finalizeManuscript
 * ------------------
 * Consolidates individual sector results into a cohesive institutional briefing.
 * Applies final $SHIELD audit and template transformation.
 */
export async function finalizeManuscript(allChapterContents, consensusSummary, frequency, type, env, id) {
  const executiveStrategy = await askAI(getEditorPrompt(consensusSummary, frequency), { 
    role: 'edit', env, model: 'node-edit' 
  });

  const combinedManuscript = `<div id="strategic-pulse">${executiveStrategy}</div><hr>${allChapterContents.join("\n\n")}`;
  
  // 🛡️ [V6.0] Synchronize Institutional Style Manual to Affine
  await notifyProgress(env, id, { 
    source: "STYLE_SYNC", 
    manual: "INSTITUTIONAL_V6", 
    status: "SYNCED" 
  });

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

  // [V6.0] Telegram Dispatch with abstract extraction
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      const abstract = await askAI(`Extract title, link (placeholder), and abstract from this manuscript:\n\n${finalManuscript.substring(0, 5000)}`, { role: 'edit', env, model: 'node-draft' });
      await dispatchTelegramAlert({ 
        title: `${frequency.toUpperCase()} Strategic Pulse`,
        abstract: abstract,
        wordCount: finalCount
      }, env);
    } catch (e) {
      console.warn("⚠️ [Telegram] Abstract extraction or dispatch failed:", e.message);
    }
  }

  return { final: finalHtml, wordCount: finalCount, raw: finalManuscript, jobId: id };
}
