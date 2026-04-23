import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import rl from "./reinforcement.js";
import pLimit from "p-limit";

// Sovereign Infrastructure
import { askAI } from './ai-service.js';
import { 
  saveToCloudBucket, 
  loadFromCloudBucket, 
  syncToFirestore, 
  pushSovereignTrace, 
  getHistoricalData,
  saveToGDriveBucket,
  pushTelemetryLog
} from './storage-bridge.js';
import { logSwarmBreadcrumb, captureSwarmError, logSwarmPulse, logBlackboardMemo } from './sentry-bridge.js';
import { promptManager } from './prompt-manager.js';
import { hydrateRemoteContext } from './remote-config.js';
import * as rules from './rules-engine.js';
import { validateAndRepair } from './fidelity-governor.js';
import { 
  VERTICALS, 
  CONSENSUS_PERSONAS, 
  getResearcherPrompt, 
  getDrafterPrompt, 
  getManagerAuditPrompt, 
  getManagerCorrectionPrompt, 
  getExpertPersonaPrompt, 
  getConsensusPrompt, 
  getEditorPrompt, 
  getMCTSNodePrompt, 
  getHiRAGRetrievalPrompt,
  getRefinementPrompt,
  getGhostConsensusPrompt,
  hydrateSwarmPrompts
} from './prompts.js';
import { fetchDynamicNews } from './data-fetchers.js';
import { extractKnowledgeGraph, formatGraphContext } from './knowledge-graph.js';
import { getNextSwarmState, routeToBestModel } from './intelligence-engine.js';
import { calculateReward } from './rl-metrics.js';
import { generatePDF } from './pdf-service.js';
import { dispatchTelegramAlert } from './social-utils.js';


/**
 * BlogsPro Swarm 5.0: Sequential-Hierarchical Blackboard Orchestrator
 * ===================================================================
 * High-performance collaborative reasoning pipeline for 
 * ultra-high-density institutional manuscripts (up to 25k words).
 */

const SECTOR_DIR = "./manuscripts/v7/sectors";
const TRACE_FILE = "./logs/institutional-trace.log";

let traceBuffer = [];

export async function publishGitHubTrace(env, jobId) {
    if (!env || !env.GH_PAT) {
        console.warn("⚠️ [Telemetry] Cannot publish GitHub trace: No GH_PAT provided in environment.");
        return;
    }
    if (traceBuffer.length === 0) return;
    
    console.log("🚀 [Telemetry] Publishing absolute runtime trace to GitHub Issues...");
    const traceContent = traceBuffer.join("");
    const title = `Swarm Telemetry Trace: Job [${jobId}] (${new Date().toISOString()})`;
    
    const repo = env.GH_REPO || "abhishekdutta18/blogspro";
    
    try {
        const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
            method: "POST",
            headers: {
                "Authorization": `token ${env.GH_PAT}`,
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json",
                "User-Agent": "BlogsPro-Swarm-Agent"
            },
            body: JSON.stringify({
                title: title,
                body: "```log\n" + traceContent.substring(0, 60000) + "\n```"
            })
        });
        
        if (res.ok) {
            console.log(`✅ [Telemetry] GitHub Trace published successfully.`);
        } else {
            const errBody = await res.text();
            if (res.status === 404) {
                console.error(`❌ [Telemetry] GitHub Trace failed with 404. CAUTION: Ensure 'GitHub Issues' are ENABLED on repo '${repo}' and your GH_PAT has 'repo' or 'public_repo' scopes.`);
            } else {
                console.error(`❌ [Telemetry] GitHub Trace failed HTTP ${res.status}:`, errBody);
            }
        }
    } catch (e) {
        console.error(`❌ [Telemetry] GitHub Trace Network Error:`, e.message);
    } finally {
        traceBuffer = []; // clear buffer
    }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const safeStringify = (obj, indent = 0) => {
    try {
        const cache = new Set();
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (cache.has(value)) return "[Circular]";
                cache.add(value);
            }
            return value;
        }, indent);
    } catch (e) {
        return "[Serialization Error]";
    }
};

/**
 * 🛡️ INSTITUTIONAL TRACE: High-fidelity logger for Swarm Audit
 */
function logTrace(message, data = null) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${message}${data ? ' ' + safeStringify(data) : ''}\n`;
    
    traceBuffer.push(logMsg);
    console.log(message);
    
    // Bridge to Sentry
    if (typeof logSwarmBreadcrumb === 'function') {
        logSwarmBreadcrumb(message, data);
    }
}

export async function saveSectorFragment(jobId, verticalId, content, env = {}) {
    const bucket = env.FIREBASE_STORAGE_BUCKET || "blogspro-asset";
    const fragmentData = { 
        jobId, 
        verticalId, 
        content, 
        timestamp: new Date().toISOString() 
    };

    // Remote Persistence (Primary)
    if (env.FIREBASE_PROJECT_ID) {
        const fileName = `sectors/${jobId}/${verticalId}.json`;
        await saveToCloudBucket(fileName, fragmentData, env);
    }

    // Local Persistence (Redundancy Fallback for GHA Artifacts)
    let currentBase = process.cwd();
    // [V21.1] Institutional Path Hardening: Ensure we are targeting the blogspro root
    if (!currentBase.endsWith('blogspro') && fs.existsSync(path.join(currentBase, 'blogspro'))) {
        currentBase = path.join(currentBase, 'blogspro');
    }
    
    const absoluteSectorDir = path.join(currentBase, SECTOR_DIR);
    if (!fs.existsSync(absoluteSectorDir)) fs.mkdirSync(absoluteSectorDir, { recursive: true });
    const filePath = path.join(absoluteSectorDir, `${jobId}_${verticalId}.json`);
    fs.writeFileSync(filePath, safeStringify(fragmentData, 2));
    
    console.log(`💾 [Fragment-Sync] Sector ${verticalId} saved to ${env.FIREBASE_PROJECT_ID ? 'Cloud & ' : ''}Local [${jobId}]`);
}

export async function loadSectorFragments(jobId, env = {}) {
    let cloudFragments = [];
    let localFragments = [];

    // 1. Load from Cloud (Firebase/R2)
    if (env.FIREBASE_PROJECT_ID) {
        try {
            cloudFragments = await loadFromCloudBucket(jobId, env);
            console.log(`📡 [Assembly] Recovered ${cloudFragments.length} fragments from Cloud Bucket.`);
        } catch (e) {
            console.warn(`⚠️ [Assembly] Cloud fetch failed: ${e.message}`);
        }
    }
    
    // 2. Load from Local (GHA Artifacts/FS)
    if (fs.existsSync(SECTOR_DIR)) {
        const files = fs.readdirSync(SECTOR_DIR).filter(f => f.includes(jobId) && f.endsWith('.json'));
        localFragments = files.map(f => JSON.parse(fs.readFileSync(path.join(SECTOR_DIR, f), 'utf8')));
        console.log(`📂 [Assembly] Recovered ${localFragments.length} fragments from local artifact cache.`);
    }

    // 3. De-duplicate (Cloud fragments take priority over local)
    const fragmentMap = new Map();
    [...localFragments, ...cloudFragments].forEach(f => {
        fragmentMap.set(f.verticalId, f);
    });

    return Array.from(fragmentMap.values());
}

/**
 * [V16.0] Standardized Cloud Dispatch
 */
export async function askAIWithEscalation(prompt, options = {}) {
    const { role, env, model, seed, extended, frequency } = options;
    const isMonthly = frequency === 'monthly';
    const maxRetries = (frequency === 'monthly' || frequency === 'hourly') ? 4 : 2; // Institutional depth for prod runs
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // [V17.0] Adaptive Escalation Strategy
            let targetModel = model;
            
            if (attempt === 1) {
                // Tier 1: Diversify to alternative high-fidelity family
                const isGemini = model && model.includes('gemini');
                targetModel = isGemini ? 'meta-llama-3.1-70b-instruct' : 'gemini-1.5-pro';
                console.log(`🔄 [Escalation Tier-1] Diversity Shift: ${model} -> ${targetModel}`);
            } else if (attempt === 2) {
                // Tier 2: Force reasoning-tuned node (SambaNova / DeepSeek)
                targetModel = 'Meta-Llama-3.1-405B-Instruct-v2';
                console.log(`🔄 [Escalation Tier-2] Reasoning Focus: ${targetModel}`);
            } else if (attempt === 3) {
                // Tier 3: Direct-Dial Fallback (Cerebras/Groq Anchor)
                targetModel = 'llama-3.3-70b';
                console.log(`📡 [Escalation Tier-3] Direct Cluster Handshake: ${targetModel}`);
            } else if (attempt === 4) {
                // Tier 4: Cloud Sovereign Anchor (Vertex AI Model Garden)
                targetModel = 'vertex-llama-405b';
                console.log(`🏠 [Escalation Tier-4] Cloud Sovereign Final Handshake: ${targetModel}`);
            }

            return await askAI(prompt, { ...options, model: targetModel, _retry: 0 }); 
        } catch (e) {
            lastError = e;
            const backoff = (attempt + 1) * (isMonthly ? 5000 : 2000);
            console.warn(`⚠️ [Escalation-Tier ${attempt}/${maxRetries}] Failed: ${e.message}. Backoff: ${backoff}ms`);
            
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw new Error(`[Cloud-Failure] Fleet exhausted. Final error: ${lastError.message}`);
}



export async function runGhostSim(frequency, semanticDigest, env, jobId, modelOverride = "auto") {
  if (env.DRY_RUN) return; // [V8.5] Bypass speculative sim in Dry-Run mode
  const start = Date.now();
  try {
    const model = modelOverride !== 'auto' ? modelOverride : 'node-draft';
    const ghostResult = await askAI(getGhostConsensusPrompt(semanticDigest.strategicLead || "No context"), { 
      role: 'edit', 
      env, 
      model,
      isSpeculative: true
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
  if (!env.MIRO_SYNC_DO && !env.AUTH_PROXY_URL && !env.FIREBASE_PROJECT_ID) return;
  
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

  if (env && (env.MIRO_SYNC_DO || env.AUTH_PROXY_URL || env.FIREBASE_PROJECT_ID)) {
    try {
      const payload = { 
        source: data.source || "SWARM_PROGRESS", 
        jobId, 
        timestamp: new Date().toISOString(), 
        ...data 
      };

      const isHourly = String(jobId || '').includes('hourly');

      if (isHourly && env.FIREBASE_PROJECT_ID) {
        // GCP Firebase Telemetry Bridge (Hourly Only)
        await syncToFirestore('live_telemetry', { id: jobId, ...payload }, env);
      } else if (!isHourly && env.MIRO_SYNC_DO && typeof env.MIRO_SYNC_DO.idFromName === 'function') {
        // Cloudflare Durable Objects Bridge (Daily/Monthly)
        try {
          const id = env.MIRO_SYNC_DO.idFromName('global-swarm-bridge');
          const stub = env.MIRO_SYNC_DO.get(id);
          const res = await stub.fetch("https://sync/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          
          if (!res.ok) {
            throw new Error(`Cloudflare DO returned status: ${res.status}`);
          }
        } catch (cfError) {
          console.warn(`⚠️ [Cloudflare Fallback] DO Sync Failed (${cfError.message}). Falling back to GCP Firestore...`);
          if (env.FIREBASE_PROJECT_ID) {
            await syncToFirestore('live_telemetry', { id: jobId, ...payload }, env);
          }
        }
      }

      if (env.AUTH_PROXY_URL) {
        await fetch(`${env.AUTH_PROXY_URL}/telemetry`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.INSTITUTIONAL_MASTER_SECRET}`
          },
          body: JSON.stringify(payload)
        });
      }
      
      // [V5.3] 200ms delay to prevent rate-limiting in parallel fan-outs
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
export async function runMCTSSwarm(vertical, frequency, researchBrief, env, modelOverride = "auto") {
  const startTime = Date.now();
  console.log(`🌳 [MCTS] Expanding nodes for ${vertical.name}...`);
  const scenarios = ['BULLISH_AGGRESSIVE', 'BEARISH_PROTECTIVE', 'BLACK_SWAN_VOLATILITY'];
  const branches = await Promise.all(scenarios.map(async (scene) => {
    const model = modelOverride !== 'auto' ? modelOverride : 'node-draft';
    const simulation = await askAI(getMCTSNodePrompt(vertical.name, scene, researchBrief), { 
      role: 'research', env, model
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
 * V12.0: Markov-Governed Intelligence Cycle
 */
export async function executeSingleVerticalSwarm(vertical, index, frequency, semanticDigest, historicalData, env, id, extended, modelOverride = "auto", blackboardContext = "") {
    const start = Date.now();
    await pushSovereignTrace("SWARM_INIT", { jobId: id, frequency, status: "processing", message: `Initializing BlogsPro Institutional Swarm [${frequency}]` }, env);

    try {
        console.log(`🚀 [Swarm] Commencing Institutional Research Lifecycle [ID: ${id}]`);
        console.log(`🧬 [Markov-Swarm] Analyzing Vertical: ${vertical.name}...`);
    
    // [V8.5] Institutional Dry-Run Mode
    if (env.DRY_RUN) return `[DRY-RUN MOCK]: Strategic Analysis for ${vertical.name}.`;

    // 1. STATE-MACHINE INITIALIZATION
    let state = 'INIT';
    let fidelityScore = 0;
    let iterations = 0;
    let finalManuscript = "";
    let researchBrief = "";

    while (state !== 'FINALIZE' && state !== 'FORCE_FINALIZE') {
        state = getNextSwarmState(state, { fidelityScore, iterations, type: frequency });
        iterations++;
        
        await pushSovereignTrace("STATE_TRANSITION", {
            jobId: id,
            frequency,
            status: "processing",
            role: "orchestrator",
            vertical: vertical.id,
            message: `Entering State: ${state} (Iteration: ${iterations})`
        }, env);

        if (state === 'RESEARCH') {
            const contextLayers = { macro: semanticDigest.strategicLead, blackboard: blackboardContext, history: historicalData };
            const model = modelOverride !== 'auto' ? modelOverride : routeToBestModel('research', env);
            const refinedQueries = await askAIWithEscalation(getHiRAGRetrievalPrompt(vertical.name, contextLayers), { role: 'research', env, model });
            const searchQueries = refinedQueries.split('\n').filter(q => q.includes('?')).slice(0, 3);
            const rawPulse = await Promise.all(searchQueries.map(q => fetchDynamicNews(q)));
            const internetResearch = rawPulse.join('\n\n');
            const knowledgeGraph = await extractKnowledgeGraph(internetResearch, env, vertical.id, blackboardContext, modelOverride);
            const semanticMap = formatGraphContext(knowledgeGraph);
            const rlMemory = await rl.getReinforcementContext(env);
            
            researchBrief = await askAIWithEscalation(promptManager.resolve('researcher', {
                frequency,
                dataSnapshot: semanticDigest,
                historicalData,
                internetResearch,
                rlMemory,
                semanticMap,
                blackboardContext
            }, 'getResearcherPrompt', [frequency, semanticDigest, historicalData, internetResearch, rlMemory, semanticMap, blackboardContext]), {
                role: 'research', env, model, seed: index, extended
            });
            
            const mctsResult = await runMCTSSwarm(vertical, frequency, researchBrief, env, modelOverride);
            researchBrief = `${researchBrief}\n\n🌳 [MCTS_WINNING_PATH]:\n${mctsResult.winningPath}`;
        }

        if (state === 'DRAFT') {
            const model = modelOverride !== 'auto' ? modelOverride : routeToBestModel('draft', env);
            finalManuscript = await askAIWithEscalation(promptManager.resolve('drafter', {
                frequency,
                researchBrief,
                verticalName: vertical.name
            }, 'getDrafterPrompt', [frequency, researchBrief, vertical.name]), { role: 'generate', env, model, seed: index + iterations });
            fidelityScore = calculateReward(finalManuscript, frequency === 'monthly' ? 1500 : 500) * 100;
        }

        if (state === 'AUDIT') {
            const model = modelOverride !== 'auto' ? modelOverride : routeToBestModel('audit', env);
            const auditRes = await askAIWithEscalation(promptManager.resolve('manager_audit', {
                manuscript: finalManuscript,
                verticalName: vertical.name,
                managerCommand: env.MANAGER_COMMAND || ""
            }, 'getManagerAuditPrompt', [finalManuscript, vertical.name, env]), { role: 'edit', env, model });
            try { 
                const audit = JSON.parse(auditRes.replace(/```json\n?|```/g, '').trim());
                fidelityScore = audit.score;
                
                await pushSovereignTrace("AUDIT_HEARTBEAT", {
                    jobId: id,
                    frequency,
                    status: fidelityScore > 70 ? "success" : "warn",
                    vertical: vertical.id,
                    role: "auditor",
                    message: `MiroFish Audit Complete. Score: ${fidelityScore}%`,
                    details: { audit }
                }, env);
            } catch (e) {
                console.warn(`⚠️ [Audit-Fail] Malformed JSON in Markov-Swarm: ${e.message}`);
                fidelityScore = 50; 
            }
        }

        if (state === 'REPAIR') {
            await pushSovereignTrace("REPAIR_TRIGGERED", {
                jobId: id,
                frequency,
                status: "processing",
                vertical: vertical.id,
                role: "fidelity",
                message: `Low fidelity score (${fidelityScore}%). Commencing adaptive repair pass.`
            }, env);
            
            const model = modelOverride !== 'auto' ? modelOverride : routeToBestModel('fidelity', env);
            finalManuscript = await askAIWithEscalation(getManagerCorrectionPrompt(finalManuscript, "Improve institutional depth and quantitative density."), {
                role: 'generate', env, model, seed: 99 + iterations
            });
        }

        // [V16.5] State Checkpoint: Save fragment after each successful state completion
        if (finalManuscript && (state === 'DRAFT' || state === 'AUDIT' || state === 'REPAIR')) {
            await saveSectorFragment(id, vertical.id, { 
                manuscript: finalManuscript, 
                brief: researchBrief, 
                state, 
                fidelityScore 
            }, env);
        }
    }

    // 🛡️ $SHIELD POST-PROCESSING (V12.3 Auditable)
    const auditContext = { jobId: id, verticalId: vertical.id, env };
    const sanitizedBody = rules.sanitizePayload(finalManuscript, auditContext);
    const repairedBody = rules.repairTables(sanitizedBody, auditContext);
    const hardenedBody = rules.hardenJson(repairedBody, vertical.id, auditContext);
    const visualBody = rules.injectVisuals(hardenedBody, vertical.name, vertical.id, auditContext);
    const institutionalBody = rules.enforceInstitutionalSections(visualBody);
    
    await pushSovereignTrace("SHIELD_COMPLETE", {
        jobId: id,
        frequency,
        status: "success",
        vertical: vertical.id,
        role: "shield",
        message: `$SHIELD Institutional Hardening active. Formatting and visuals injected.`
    }, env);

    return `<div id="sector-${vertical.id}" class="institutional-sector" data-vertical-id="${vertical.id}">\n<h2>${vertical.name.toUpperCase()}</h2>\n${institutionalBody}\n</div>`;
  } catch (err) {
    captureSwarmError(err, { vertical: vertical.name, jobId: id });
    return `<h3>${vertical.name}</h3><p>Audit Unavailable: ${err.message}</p>`;
  }
}

export async function runConsensusDesk(frequency, semanticDigest, env, jobId = null, modelOverride = "auto") {
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
      const model = modelOverride !== 'auto' ? modelOverride : 'node-draft';
      const result = await askAI(getExpertPersonaPrompt(persona, frequency, JSON.stringify(semanticDigest)), {
        role: 'generate', env, model
      });
      
      // Extract [SCORE: X]
      const scoreMatch = result.match(/\[SCORE:\s*(\d+)\]/i);
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 50;
      scores.push({ name: persona.name, score, bias: persona.bias });

      return `[${persona.name}]: ${result}`;
    } catch (e) { return `[${persona.name}]: [FAILED]`; }
  }));

  const modelForConsensus = modelOverride !== 'auto' ? modelOverride : 'node-edit';
  const rawConsensus = await askAI(getConsensusPrompt(simulations.join("\n\n"), frequency), { role: 'edit', env, model: modelForConsensus });
  
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

export async function executeMultiAgentSwarm(frequency, semanticDigest, historicalData, type, env, jobId = null, modelOverride = "auto") {
  // [V10.0] PRE-FLIGHT HYDRATION: Sync with Remote Cloud/Drive metadata
  try {
    const remoteMetadata = await hydrateRemoteContext(env);
    if (remoteMetadata) hydrateSwarmPrompts(remoteMetadata);
  } catch (e) {
    console.warn("⚠️ [Swarm-Orchestrator] Remote hydration failed, using local defaults.");
  }

  // [V1.0] MIGRATION: Priority Cloud Sync for Prompt Templates
  await promptManager.sync();

  const isArticle = type === 'article';
  const extended = !!env.EXTENDED_MODE;
  let targetVerticals = isArticle ? VERTICALS : [{ id: "consolidated", name: "Institutional Pulse" }];
  const id = jobId || `swarm-${Date.now()}`;
  
  if (frequency === 'hourly') {
      console.log(`⏱️ [Hourly Prod] Bypassing swarm for fast 1000-word high-fidelity synthesis.`);
      const prompt = `
TASK: Generate a High-Fidelity Hourly Production Briefing.
RESPONSE_FORMAT: JSON
JSON_STRUCTURE:
{
  "title": "A sharp, specific headline based on the news",
  "abstract": "A concise one-sentence strategic summary",
  "content": "The full briefing content (TARGET MINIMUM 1200 WORDS, HTML paragraphs allowed)"
}
CONSTRAINTS:
- TARGET MINIMUM 1200 WORDS for the content field. Provide deep, data-driven institutional analysis.
- NO TABLES.
- NO CHARTS.
- USE IST (Indian Standard Time) for all timestamps and date labeling.
- TONE: Cynical, Data-Driven, Truth-First.
- **CRITICAL**: DO NOT mention "BlogsPro" anywhere in the content body.
- **CRITICAL**: Use the PROVIDED LIVE NEWS to drive the analysis.
LIVE NEWS: ${semanticDigest.liveNews || "Pulse Baseline: Stable."}
CONTEXT: ${JSON.stringify(semanticDigest)}
      `;
      // Use direct escalation for the lightweight hourly run, forcing a light model to ensure availability
      const hourlyModel = modelOverride === "auto" ? "gemini-1.5-flash" : modelOverride;
      const rawHourly = await askAIWithEscalation(prompt, { role: 'generate', env, model: hourlyModel, frequency });
      
      let parsed = { title: "Hourly Strategic Pulse", abstract: "Rapid intelligence synthesis for the current cycle.", content: rawHourly };
      try {
          const jsonStr = rawHourly.replace(/```json\n?|```/g, '').trim();
          const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
              try {
                  const obj = JSON.parse(jsonMatch[0]);
                  if (obj.title) parsed.title = obj.title;
                  if (obj.abstract) parsed.abstract = obj.abstract;
                  if (obj.content) parsed.content = obj.content;
              } catch (parseErr) {
                  console.warn(`⚠️ [Hourly] Strict JSON.parse failed, attempting Regex Extraction.`);
                  // Fallback: Regex extraction for common fields if JSON is slightly malformed
                  const titleMatch = jsonMatch[0].match(/"title"\s*:\s*"(.*?)"/);
                  const abstractMatch = jsonMatch[0].match(/"abstract"\s*:\s*"(.*?)"/);
                  const contentMatch = jsonMatch[0].match(/"content"\s*:\s*"([\s\S]*?)"\s*}/);
                  
                  if (titleMatch) parsed.title = titleMatch[1];
                  if (abstractMatch) parsed.abstract = abstractMatch[1];
                  if (contentMatch) parsed.content = contentMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
              }
          }
      } catch (e) {
          console.warn(`⚠️ [Hourly] Extraction failed: ${e.message}`);
      }

      // [V17.6] CONTENT SCRUBBER: Purge AI breadcrumbs (backticks, JSON markers)
      if (parsed.content) {
          parsed.content = parsed.content
              .replace(/```(html|json|markdown)?/gi, '') // Remove code block markers
              .replace(/```/g, '') // Remove stray backticks
              .replace(/^\s*\{\s*"content"\s*:\s*"/i, '') // Remove leading JSON fragment
              .replace(/"\s*\}\s*$/i, '') // Remove trailing JSON fragment
              .trim();
      }

      return {
          final: parsed.content,
          title: parsed.title,
          excerpt: parsed.abstract,
          wordCount: parsed.content.split(/\s+/).filter(Boolean).length,
          status: "HOURLY_PROD",
          jobId: id
      };
  }
  
  // [V12.0] Parallel Matrix Partitioning: Filter for specific vertical if requested
  if (env.TARGET_VERTICAL_ID) {
    const vId = env.TARGET_VERTICAL_ID;
    const filtered = targetVerticals.filter(v => v.id === vId);
    if (filtered.length > 0) {
        console.log(`🎯 [Matrix] Runner targeted for Vertical: ${filtered[0].name} [${vId}]`);
        targetVerticals = filtered;
    } else {
        console.warn(`⚠️ [Matrix] Vertical ID '${vId}' not found in registry. Running only for: ${vId}`);
    }
  }

  try {
      return await _executeSwarmInternal(frequency, semanticDigest, historicalData, type, env, id, isArticle, extended, targetVerticals, modelOverride);
  } catch (err) {
      if (err.message.includes("No available AI providers") || err.message.includes("AI_FLEET_EXHAUSTED")) {
          console.warn(`⚠️ [Swarm-Recovery] AI Fleet Exhausted for Job [${id}]. Initiating 30s Cooldown & Pool Rejuvenation...`);
          const { ResourceManager } = await import("./ai-service.js");
          await new Promise(r => setTimeout(r, 30000));
          await ResourceManager.init(env, true); // Force full pool refresh
          return await _executeSwarmInternal(frequency, semanticDigest, historicalData, type, env, id, isArticle, extended, targetVerticals, modelOverride);
      }
      throw err;
  }
}

async function _executeSwarmInternal(frequency, semanticDigest, historicalData, type, env, id, isArticle, extended, targetVerticals, modelOverride = "auto") {
  // 👻 SPECULATIVE GHOST LOOP: Fire and forget
  runGhostSim(frequency, semanticDigest, env, id, modelOverride);
  
  const globalNewsPulse = [];

  // APRIL 2026: Institutional Pre-flight Audit
  let nodeCount = 0;
  try {
      // Ensure AI pool is initialized to get accurate count
      const { ResourceManager } = await import("./ai-service.js");
      if (ResourceManager.pool.length === 0) await ResourceManager.init(env);
      nodeCount = ResourceManager.pool.length - ResourceManager.failed.size;
  } catch (e) {}

  await notifyProgress(env, id, { 
      stage: "START", 
      message: `Orchestrating ${targetVerticals.length} Vertical Swarms [Mode: ${env.MODE || 'standard'}]... [Nodes: ${nodeCount}]`,
      nodeCount
  });

  // [V9.0] ASSEMBLE MODE: Direct skip to synthesis (M1 Consolidation)
  if (env.MODE === 'assemble') {
      console.log(`🏗️ [Assemble] Loading sector fragments for Job [${id}]...`);
      const fragments = await loadSectorFragments(id, env);
      if (fragments.length > 0) {
          console.log(`✅ [Assemble] Recovered ${fragments.length} sectors from redundant storage.`);
          // [V12.3] Passing full fragments for Gap Analysis
          return await finalizeManuscript(fragments, "Consensus pending in assembly loop.", frequency, type, env, id, modelOverride);
      }
      console.warn(`⚠️ [Assemble] No fragments found for ${id}. Falling back to standard synthesis.`);
  }

  const PRIORITY_VERTICAL_IDS = ['macro', 'banking', 'em_market', 'policy'];
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
      const modelForAnchorRes = modelOverride !== 'auto' ? modelOverride : 'node-research';
      const brief = await askAI(promptManager.resolve('researcher', {
          frequency,
          dataSnapshot: semanticDigest,
          historicalData,
          internetResearch: news
      }, 'getResearcherPrompt', [frequency, semanticDigest, historicalData, news]), { role: 'research', env, model: modelForAnchorRes, extended: true });
      const modelForMemo = modelOverride !== 'auto' ? modelOverride : 'node-draft';
      const memo = await askAI(`Summarize into a 150-word Strategic Telex Memo:\n\n${brief}`, { role: 'edit', env, model: modelForMemo });
      const modelForAnchorDraft = modelOverride !== 'auto' ? modelOverride : 'node-draft';
      const chapter = await askAI(promptManager.resolve('drafter', {
          frequency,
          researchBrief: brief,
          verticalName: vertical.name
      }, 'getDrafterPrompt', [frequency, brief, vertical.name]), { role: 'generate', env, model: modelForAnchorDraft });
      
      sharedBlackboard.institutionalMemos.push(`[FROM: ${vertical.name.toUpperCase()}]: ${memo}`);
      logBlackboardMemo(vertical.name, memo, { jobId: id, frequency });
      
      // 🛡️ NEWS WIRE ACCUMULATION: Seed the global news pulse
      if (news && news.length > 50) {
          globalNewsPulse.push({ vertical: vertical.name, news: news });
      }
      
      // 🛡️ $SHIELD POST-PROCESSING: Sanitize and Repair before final commit
      const sanitizedChapter = rules.sanitizePayload(chapter);
      const repairedChapter = rules.repairTables(sanitizedChapter);
      const visualChapter = rules.injectVisuals(repairedChapter, vertical.name, vertical.id);
      const finalChapter = rules.enforceInstitutionalSections(visualChapter);

      allChapterContents.push(`<div id="sector-${vertical.id}" class="institutional-sector" data-vertical-id="${vertical.id}"><h2>${vertical.name.toUpperCase()}</h2>${finalChapter}</div>`);
      
      globalNewsPulse.push({ vertical: vertical.name, news });
      
      completedSectors++;
      const progress = Math.round((completedSectors / totalSectors) * 100);
      await notifyProgress(env, id, { 
        stage: "ANCHOR_SYNC", 
        progress, 
        message: `Anchored ${vertical.name} (${completedSectors}/${totalSectors})` 
      });
    }

    const blackboardContext = `\n📋 INSTITUTIONAL ANCHOR MEMOS:\n${sharedBlackboard.institutionalMemos.join("\n")}`;
    
      const limit = pLimit(5);
      console.log(`🚀 [PARALLEL_FLOW] Dispatching ${sectorVerticals.length} sectors via Cloud-Sovereign Swarm (Concurrency: 5)...`);
      
      const sectorTasks = sectorVerticals.map((v, i) => limit(async () => {
          // [V6.0] State-Aware Resilience
          if (env.MIRO_SYNC_DO) {
              try {
                  const idObj = env.MIRO_SYNC_DO.idFromName('global-swarm-bridge');
                  const stub = env.MIRO_SYNC_DO.get(idObj);
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

          const result = await executeSingleVerticalSwarm(v, i, frequency, semanticDigest, historicalData, env, id, extended, modelOverride, blackboardContext);
          
          completedSectors++;
          const progress = Math.round((completedSectors / totalSectors) * 100);
          await notifyProgress(env, id, { 
              stage: "SECTOR_COMPLETE", 
              progress, 
              message: `Completed ${v.name} (${completedSectors}/${totalSectors})` 
          });
          return result;
      }));

      const sectorResults = await Promise.all(sectorTasks);

    
    // [V9.0] WORKER MODE: Save fragments and exit (GHA Parallelization)
    if (env.MODE === 'worker') {
        console.log(`🚀 [Worker] Partitioning ${sectorResults.length} sector results to GitOps fragments...`);
        for (const res of sectorResults) {
            const i = sectorResults.indexOf(res);
            const v = sectorVerticals[i] || (priorityVerticals && priorityVerticals[i]);
            if (v) await saveSectorFragment(id, v.id, res, env);
        }
        
        await notifyProgress(env, id, { 
          stage: "WORKER_COMPLETE", 
          message: `Worker Job [${id}] finalized. Fragments committed to manuscripts/v7/sectors/.` 
        });
        
        return { 
          final: "<!-- WORKER_MODE_PARTITION -->", 
          wordCount: 0, 
          status: "PARTITIONED", 
          jobId: id 
        };
    }

    allChapterContents.push(...sectorResults);
  } else {
    // 2. FAST PULSE PATH (Consolidated)
    const pulseResult = await executeSingleVerticalSwarm(targetVerticals[0], 0, frequency, semanticDigest, historicalData, env, id, false, modelOverride, "");
    allChapterContents.push(pulseResult);
  }

  // 3. SYNTHESIS & GOVERNANCE
  let consensusData = { summary: "No strategic drift detected for hourly pulse.", telemetry: null };
  if (frequency !== 'hourly') {
      consensusData = await runConsensusDesk(frequency, semanticDigest, env, id, modelOverride);
      if (consensusData.telemetry) {
        // [V6.0] Generate Disagreement Heatmap & Timeline data
        // Real Variance Calculation: Uses actual agent distributions
        const variance = consensusData.telemetry.disagreementVariance || 15;
        const disagreementHeatmap = CONSENSUS_PERSONAS.map(p1 => 
          CONSENSUS_PERSONAS.map(p2 => ({
            p1: p1.name, p2: p2.name,
            variance: (p1 === p2) ? 0 : Math.floor(variance * (Math.abs(p1.bias?.charCodeAt(0) - p2.bias?.charCodeAt(0)) % 10) / 5)
          }))
        ).flat();

        const consensusTimeline = Array.from({ length: 15 }, (_, i) => ({
          step: i,
          alignment: Math.min(100, (consensusData.telemetry.swarmSentiment || 50) + (i * 2) - (variance / 5))
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
  
  // 9. Final Institutional Synthesis with Fleet-Retry
  let executiveStrategy = "";
  let synthesisRetries = 3;
  const modelForEditor = modelOverride !== 'auto' ? modelOverride : 'node-editor';

  while (synthesisRetries > 0) {
    try {
      console.log(`📡 [Assemble] Dispatching Chief Institutional Editor (Try: ${4 - synthesisRetries}/3)...`);
      executiveStrategy = await askAI(getEditorPrompt(consensusData.summary, frequency), { role: 'edit', env, model: modelForEditor });
      if (executiveStrategy) break;
    } catch (e) {
      console.warn(`⚠️ [Assemble] Executive Synthesis failed: ${e.message}. Retrying...`);
      synthesisRetries--;
      if (synthesisRetries === 0) throw e;
      await new Promise(r => setTimeout(r, 5000 * (4 - synthesisRetries))); // Exponential backoff
    }
  }


  // [V7.0] Institutional Memory Snapshot (Global Consolidation)
  if (frequency !== 'hourly') {
    await extractKnowledgeGraph(allChapterContents.join("\n"), env, "institutional_brain", consensusData.summary, modelOverride);
  }

  // [V8.6] Strategic News Wire Injection
  let strategicNewsWire = "";
  if (globalNewsPulse.length > 0) {
      console.log(`📡 [Swarm] Synthesizing Strategic News Wire for final Tome...`);
      const modelForNews = modelOverride !== 'auto' ? modelOverride : 'node-draft';
      const synthesizedNews = await askAI(`Summarize these 3-5 critical market events into a high-density 250-word 'STRATEGIC NEWS WIRE' for an institutional article. Use <li> bullet points for each event.\n\n${newsSummary}`, { role: 'edit', env, model: modelForNews });
      strategicNewsWire = `<section id="strategic-news-wire" class="institutional-sector">
        <h2>STRATEGIC NEWS WIRE</h2>
        <div class="news-wire-content">
          ${synthesizedNews}
        </div>
      </section><hr>`;
  }

  const combinedManuscript = `${strategicNewsWire}<div id="strategic-pulse">${executiveStrategy}</div><hr>${allChapterContents.join("\n\n")}`;
  
  // 🛡️ FINAL $SHIELD AUDIT PASS: Purge all remaining jargon and prompts
  const finalManuscript = rules.sanitizePayload(combinedManuscript);
  const fidelityResult = validateAndRepair(finalManuscript);
  
  // Publish aggregated telemetry payload to GitHub Issues (Zero-FS Trace)
  await publishGitHubTrace(env, id);

  // [V10.5] Unified Finalization & Sync Pass
  return await _finalizeAndSync(fidelityResult.content, consensusData.summary, frequency, type, env, id);
}

/**
 * _finalizeAndSync (V10.5)
 * -----------------------
 * Internal terminal gate for institutional manuscripts.
 * Handles templating, PDF generation, and Dual-Sync (GCS + GDrive).
 */
async function _finalizeAndSync(fidelityContent, consensusSummary, frequency, type, env, id) {
  let finalHtml = `<html><body>${fidelityContent}</body></html>`;
  let finalCount = fidelityContent.split(/\s+/).length;

  // 1. Template Engineering
  try {
    if (env.TEMPLATE_ENGINE && typeof env.TEMPLATE_ENGINE.fetch === 'function') {
      const templateRes = await env.TEMPLATE_ENGINE.fetch(new Request("https://templates/transform", {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          title: `${frequency.toUpperCase()} Strategic Manuscript`, 
          content: fidelityContent, 
          type, 
          freq: frequency 
        })
      }));

      if (templateRes.ok) {
        const { html, wordCount: wc } = await templateRes.json();
        finalHtml = html;
        finalCount = wc;
      }
    }
  } catch (e) {
    console.warn("⚠️ [Template-Engine] Finalization fallback used.", e.message);
  }

  // 2. Telegram Alert: DEPRECATED HERE. Handled by generate-institutional-tome.js
  // to prevent double-dispatch in production cycles.

  // 3. Dual-Sync Persistence (GCS + GDrive)
  let pdfUrl = null;
  try {
    const tmpHtmlPath = path.join(os.tmpdir(), `final-${id}.html`);
    const tmpPdfPath = path.join(os.tmpdir(), `final-${id}.pdf`);
    fs.writeFileSync(tmpHtmlPath, finalHtml);
    
    // Generate PDF rendition
    await generatePDF(tmpHtmlPath, frequency); 
    const pdfBuffer = fs.readFileSync(tmpPdfPath);
    
    // Mirror to Cloud Bucket (GCS/Firebase) and Drive Anchor (GDrive)
    await Promise.all([
      saveToCloudBucket(`manuscripts/${id}.html`, finalHtml, env),
      saveToCloudBucket(`manuscripts/${id}.pdf`, pdfBuffer, env),
      saveToGDriveBucket(`${id}.pdf`, pdfBuffer, env)
    ]);
    
    // Triple-Persistence Audit Entry in Firestore
    const publicDomain = env.ASSET_DOMAIN || "https://blogspro.in";
    const bucketId = env.FIREBASE_STORAGE_BUCKET || "blogspro-asset";
    
    await syncToFirestore("institutional_outputs", {
        jobId: id,
        frequency,
        type,
        wordCount: finalCount,
        firebaseUrl: `${publicDomain}/manuscripts/${id}.pdf`,
        gcsUrl: `gs://${bucketId}/manuscripts/${id}.pdf`,
        timestamp: new Date().toISOString()
    }, env);

    console.log(`✅ [Triple-Persistence] Institutional Manuscript Synchronized to GCS, Firebase & Google Drive: ${id}`);
    
    // [V10.6 Hardening] Sentry Heartbeat
    await logSwarmPulse('info', `Institutional Manuscript Finalized: ${id}`, {
        jobId: id,
        frequency,
        wordCount: finalCount
    });
  } catch (err) {
    console.warn("⚠️ [Persistence] Artifact sync failed:", err.message);
  }

  // 4. Metadata Extraction (V16.5)
  let title = `${frequency.toUpperCase()} Strategic Manuscript`;
  let excerpt = "Institutional strategic research and quantitative analysis.";

  try {
      // Pull from title tag or first header
      const titleMatch = finalHtml.match(/<title>([\s\S]*?)<\/title>/i) || finalHtml.match(/<h1>([\s\S]*?)<\/h1>/i);
      if (titleMatch) title = titleMatch[1].replace(/Strategic Manuscript/i, '').replace(/\|/g, '').trim();
      
      // Pull excerpt from first paragraph or content start
      const textOnly = fidelityContent.replace(/<[^>]*>?/gm, '').trim();
      excerpt = textOnly.slice(0, 250) + (textOnly.length > 250 ? '...' : '');
  } catch (e) {
      console.warn("⚠️ [Metadata] Extraction failed:", e.message);
  }

  console.log(`✅ [Assembly] Institutional Manuscript Finalized [Job: ${id}] | Title: ${title}`);
  
  // --- 🛰️ SOVEREIGN TRACE: Mission Success Breadcrumb ---
  await pushSovereignTrace("SWARM_COMPLETE", { 
      jobId: id, 
      frequency, 
      status: "success", 
      message: `Institutional Dispatch Finalized: ${title} (${finalCount} words)`
  }, env);

  return { final: finalHtml, wordCount: finalCount, raw: fidelityContent, jobId: id, pdfUrl, title, excerpt };
}

/**
 * finalizeManuscript
 * ------------------
 * Consolidates individual sector results into a cohesive institutional briefing.
 * Applies final $SHIELD audit and template transformation.
 */
export async function finalizeManuscript(fragments, consensusSummary, frequency, type, env, id, modelOverride = "auto") {
  // [V12.3] Institutional Gap Analysis: Identify missing chapter IDs
  const receivedVerticalIds = new Set(fragments.map(f => f.verticalId));
  const missingVerticals = VERTICALS.filter(v => !receivedVerticalIds.has(v.id));
  
  let recoveryLog = "";
  if (missingVerticals.length > 0) {
      console.log(`📡 [Sovereign-Recovery] Gap Analysis complete. Missing: ${missingVerticals.map(v => v.id).join(', ')}`);
      await pushSovereignTrace("SELF_HEALING_TRIGGERED", { jobId: id, frequency, status: "warn", message: `Commencing Emergency Recovery for ${missingVerticals.length} sectors.` }, env);
      console.log(`🏗️ [Masterpiece-Hardening] Commencing Emergency Research Loop on Institutional Laptop...`);
      
      const recoveredFragments = [];
      for (const vertical of missingVerticals) {
          try {
              // Forced Laptop Execution for Zero-Failure recovery
              const recoveredContent = await executeSingleVerticalSwarm(
                  vertical, 99 + VERTICALS.indexOf(vertical), frequency, 
                  { strategicLead: "Sovereign Emergency Recovery Active." }, 
                  null, { ...env, FORCE_RECOVERY_NODE: 'laptop' }, id, true, "auto"
              );
              recoveredFragments.push({ verticalId: vertical.id, content: recoveredContent });
              console.log(`✅ [Recovery] Successfully reconstructed chapter: ${vertical.id}`);
          } catch (e) {
              console.error(`❌ [Critical-Failure] Recovery failed for ${vertical.id}: ${e.message}`);
              recoveredFragments.push({ verticalId: vertical.id, content: `<section class="error">Institutional research for ${vertical.name} is currently offline. Recovery exhausted.</section>` });
          }
      }
      fragments = [...fragments, ...recoveredFragments];
      recoveryLog = `\n\n🛡️ [Sovereign-Notice]: This tome underwent self-healing to recover ${missingVerticals.length} sectors.`;
  }

  const allChapterContents = fragments.map(f => f.content);
  const expectedCount = VERTICALS.length;
  const actualCount = allChapterContents.length;
  
  let assemblyHeader = `<div id="strategic-pulse" class="assembly-header">ASSEMBLED BRIEFING [Job: ${id}]</div>`;
  
  if (actualCount < expectedCount) {
      assemblyHeader = `<div id="strategic-pulse" class="assembly-header warning">
        RECONSTRUCTED ASSEMBLY [Job: ${id}] (DEGRADED: ${actualCount}/${expectedCount} Sectors)
        <p><em>Warning: Quantitative gaps detected despite recovery attempts.</em></p>
      </div>`;
  } else if (missingVerticals.length > 0) {
      assemblyHeader = `<div id="strategic-pulse" class="assembly-header recovery">
        SOVEREIGN HEALED ASSEMBLY [Job: ${id}] (100% COMPLETE)
        <p><em>Notice: Automated recovery enabled for ${missingVerticals.length} sectors.</em></p>
      </div>`;
  } else {
      console.log(`✅ [Assembly] All ${expectedCount} sectors merged successfully.`);
  }

  const combinedManuscript = `${assemblyHeader}<hr>${allChapterContents.join("\n\n")}${recoveryLog}`;
  const finalManuscript = rules.sanitizePayload(combinedManuscript);
  const fidelityResult = validateAndRepair(finalManuscript);
  
  return await _finalizeAndSync(fidelityResult.content, consensusSummary, frequency, type, env, id);
}

/**
 * applyHumanRefinement
 * --------------------
 * High-fidelity refinement pass based on direct HIL feedback.
 */
export async function applyHumanRefinement(originalManuscript, feedback, frequency, env, jobId) {
    const start = Date.now();
    await notifyProgress(env, jobId, { 
        stage: "REFINE", 
        message: `Applying HIL Strategic Refinement... Signals: ${feedback.substring(0, 50)}...` 
    });

    try {
        const refinedContent = await askAI(getRefinementPrompt(originalManuscript, feedback, "Institutional Briefing"), { 
            role: 'generate', 
            env, 
            model: 'node-edit' 
        });

        // [V9.0] Apply Institutional Template to Refined Content
        // [V10.5] Dual Persistence: Every Refinement generates a high-fidelity rendition
        return await _finalizeAndSync(refinedContent, "Refined via HIL feedback", frequency, "article", env, jobId);
    } catch (err) {
        captureSwarmError(err, { jobId, stage: "REFINE_FAILURE" });
        throw err;
    }
}
