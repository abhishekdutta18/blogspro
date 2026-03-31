import { executeMultiAgentSwarm } from "./lib/swarm-orchestrator.js";
import { getRecentSnapshots, getHistoricalData, saveBriefing, updateIndex, syncToFirestore } from "./lib/storage-bridge.js";
import { initWorkerSentry, captureSwarmError, logSwarmBreadcrumb } from "./lib/sentry-bridge.js";
import rl from "./lib/reinforcement.js";

/**
 * BlogsPro Pulse Worker (V3.0)
 * =============================
 * The Swarm Orchestrator.
 * Responsible for:
 * 1. Multi-Bucket Data Retrieval (Temporal Memory).
 * 2. Semantic Distillation (via Relevance Worker).
 * 3. Multi-Agent Swarm Logic (Researcher -> Drafter -> Editor).
 * 4. Swarm Audit & Sign-off (via Auditor Worker).
 * 5. Multi-Channel Distribution.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const frequency = url.searchParams.get("freq") || "hourly";
    const type = url.searchParams.get("type") || "briefing";

    const sentry = initWorkerSentry(request, env, ctx);
    logSwarmBreadcrumb(`Pulse Triggered: ${frequency} ${type}`, { url: request.url }, sentry);

    try {
      // NON-BLOCKING TRIGGER: Return 202 immediately and run swarm in background
      let localResult = null;
      if (ctx && ctx.waitUntil) {
        ctx.waitUntil(orchestrateSwarm(frequency, type, env, sentry));
      } else {
        // Local/Direct Execution Support
        console.log(`📡 [Pulse] Direct Execution (WaitUntil Mocked)`);
        localResult = await orchestrateSwarm(frequency, type, env, sentry);
      }
      
      return new Response(JSON.stringify({ 
        status: "accepted", 
        message: `Swarm triggered for ${frequency} ${type}.`,
        frequency,
        type,
        result: localResult,
        liveTerminal: "https://blogspro-miro-sync.workers.dev/terminal"
      }), {
        status: 202,
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      captureSwarmError(e, { stage: 'orchestration_start', frequency, type }, sentry);
      return new Response(JSON.stringify({ status: "error", message: e.message }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }
  },

  async scheduled(event, env, ctx) {
    const cron = event.cron;
    let frequency = "hourly";
    let type = "briefing";

    if (cron === "0 4 * * *") { frequency = "daily"; type = "briefing"; }
    else if (cron === "0 5 * * 1") { frequency = "weekly"; type = "article"; }
    else if (cron === "0 6 1 * *") { frequency = "monthly"; type = "article"; }

    console.log(`⏰ [Pulse] Swarm Trigger: ${type.toUpperCase()} (${frequency.toUpperCase()})`);
    ctx.waitUntil(orchestrateSwarm(frequency, type, env));
  }
};

async function orchestrateSwarm(frequency, type, env, sentry = null) {
  const swarmToken = env.SWARM_INTERNAL_TOKEN;
  logSwarmBreadcrumb(`Orchestration Phase Start`, { frequency, type }, sentry);

  // 1. DATA TIER: Pre-fill Data Rule (Context Mega-Pool)
  console.log("📂 [Pulse] Pre-filling Context Mega-Pool (Hourly, Daily, Weekly, Monthly, Historical)...");
  
  const [hourly, daily, weekly, monthly, historical] = await Promise.all([
    getRecentSnapshots("hourly", 1, env),
    getRecentSnapshots("daily", 1, env),
    getRecentSnapshots("weekly", 1, env),
    getRecentSnapshots("monthly", 1, env),
    getHistoricalData(env)
  ]);

  const megaPool = {
    hourly: hourly[0] || {},
    daily: daily[0] || {},
    weekly: weekly[0] || {},
    monthly: monthly[0] || {},
    historical: historical || {},
    meta: {
      generatedAt: new Date().toISOString(),
      frequency,
      tokenDensity: "11.5k Points"
    }
  };

  // 2. SEMANTIC TIER: Hand off to Relevance Worker for Filtering
  console.log("🧠 [Pulse] Calling Relevance Worker for Semantic Distillation...");
  const relRes = await env.RELEVANCE.fetch(new Request("https://rel/digest", {
    method: "POST",
    headers: { "X-Swarm-Token": swarmToken },
    body: JSON.stringify(megaPool.hourly) // Relevance works on recent pulse
  }));
  const semanticDigest = await relRes.json();

  // Inject Mega-Pool context into digest for the Swarm
  semanticDigest.megaPool = megaPool;

  // 3. REASONING TIER: Dispatch or Execute Multi-Agent Swarm
  const jobId = `swarm-${frequency}-${Date.now()}`;
  
  // High-Compute Bridge: Distribute heavy articles to GitHub Actions (5h 45m limit)
  if (type === 'article') {
    console.log("🚀 [Pulse] Dispatching Institutional Swarm to High-Compute GH Action...");
    const ghToken = env.GH_TOKEN || env.GITHUB_TOKEN;
    if (!ghToken) {
      throw new Error("GH_TOKEN missing. Cannot dispatch high-compute swarm.");
    }

    const repo = "abhishekdutta18/blogspro";
    const workflowId = "institutional-research.yml";
    
    const dispatchRes = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflowId}/dispatches`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ghToken}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "BlogsPro-Swarm-Orchestrator"
      },
      body: JSON.stringify({
        ref: "main",
        inputs: { freq: frequency, type: type }
      })
    });

    if (!dispatchRes.ok) {
      const err = await dispatchRes.text();
      console.error("❌ GitHub Dispatch Fail:", err);
      captureSwarmError(new Error(`GitHub Dispatch Fail: ${err}`), { jobId, workflowId, frequency, type }, sentry);
      throw new Error(`Failed to dispatch high-compute swarm: ${err}`);
    }

    console.log("✅ [Pulse] High-Compute Swarm Dispatched. Monitor GitHub Actions for Tome completion.");
    logSwarmBreadcrumb(`Institutional Swarm Dispatched`, { jobId, workflowId, frequency, type }, sentry);
    return { 
      status: "dispatched", 
      jobId, 
      workflow: workflowId,
      liveTerminal: `https://${env.PROJECT_DOMAIN || 'blogspro.ai'}/swarm-terminal.html#${jobId}`
    };
  }

  // Briefing Tier: Standard In-Worker Swarm (Fast, Low-Compute)
  const swarmResult = await executeMultiAgentSwarm(frequency, semanticDigest, megaPool.historical, type, env, jobId);

  // 4. GOVERNANCE TIER: Hand off to Auditor for Rules & Citations
  console.log("⚖️ [Pulse] Calling Auditor Worker for Governance & Sign-off...");
  const verticalName = type === 'article' ? "Institutional Strategic Manuscript" : "Intelligence Pulse";
  const auditRes = await env.AUDITOR.fetch(new Request("https://audit/verify", {
    method: "POST",
    headers: { "X-Swarm-Token": swarmToken },
    body: JSON.stringify({
      content: swarmResult.final,
      task: `${frequency.toUpperCase()}_SWARM_GEN`,
      metadata: { verticalName, verticalId: frequency }
    })
  }));
  const auditResult = await auditRes.json();

  // 5. DISTRIBUTION TIER: Final Save & Sync
  const fileName = `swarm-${frequency}-${Date.now()}.html`;
  await saveBriefing(fileName, auditResult.content, frequency, env);

  const entry = { 
    id: Date.now(), 
    title: `${frequency.toUpperCase()} Swarm - ${semanticDigest.marketContext.day}`, 
    date: new Date().toISOString(), 
    file: fileName, 
    frequency, 
    sentiment: semanticDigest.macroFocus.includes("Greed") ? 75 : 45 
  };
  
  await updateIndex(entry, frequency, env);
  await syncToFirestore(type === 'article' ? "articles" : "pulse_briefings", entry, env);

  // 6. SEO TIER: Autonomous Indexing & RSS maintenance
  if (env.SEO_MANAGER) {
    console.log("🛰 [Pulse] Calling SEO Manager for Autonomous Indexing...");
    await env.SEO_MANAGER.fetch(new Request("https://seo/index", {
      method: "POST",
      headers: { "X-Swarm-Token": swarmToken },
      body: JSON.stringify({ 
        metadata: { ...entry, excerpt: semanticDigest.strategicLead }, 
        type 
      })
    }));
  }

  console.log(`🏁 [Pulse] Swarm 4.0 Cycle Complete. [Quality Score: ${auditResult.qualityScore || 'N/A'}]`);
  logSwarmBreadcrumb(`Cycle Complete`, { jobId, qualityScore: auditResult.qualityScore }, sentry);
  return { ...entry, qualityScore: auditResult.qualityScore };
}



