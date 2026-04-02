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
    const frequency = request.url.includes("daily") ? "daily" : "hourly";
    let megaPool = { hourly: [] };
    
    // NOTE: Sub-orchestration (DataHub fetch) is now deferred to orchestrateSwarm 
    // to prevent double-billing and redundant latency in cold-starts.

    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "briefing";

    const sentry = initWorkerSentry(request, env, ctx);
    logSwarmBreadcrumb(`Pulse Worker Ingress`, { url: request.url, method: request.method }, sentry);

    const origin = request.headers.get("Origin") || "";
    const allowedDomains = ["https://blogspro.in", "https://blogspro.ai"];
    const isPagesDev = origin.endsWith(".pages.dev");
    const isLocal = origin.includes("localhost") || origin.includes("127.0.0.1");
    
    let allowOrigin = "";
    if (!isLocal && (allowedDomains.includes(origin) || isPagesDev)) {
      allowOrigin = origin;
    }

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowOrigin || "https://blogspro.in",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Vault-Auth",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const wrapResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), { 
        status, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    };

    // 🔗 V5.0 Serverless Dispatch Proxy
    if (url.pathname === "/dispatch" && request.method === "POST") {
      try {
        const authHeader = request.headers.get("Authorization") || "";
        if (!authHeader.startsWith("Bearer ")) {
          return wrapResponse({ error: "Unauthorized: Missing Bearer Token" }, 401);
        }

        if (!env.GH_PAT) {
            throw new Error("Dispatch Failed: GH_PAT is missing. Run sync-secrets.mjs");
        }

        const token = authHeader.split("Bearer ")[1];
        const { frequency = "daily", type = "briefing" } = await request.json();

        if (!token || token.length < 100) throw new Error("Malformed JWT Token");
        
        const ghResponse = await fetch(`https://api.github.com/repos/abhishekdutta18/blogspro/actions/workflows/manual-dispatch.yml/dispatches`, {
          method: "POST",
          headers: {
            "Authorization": `token ${env.GH_PAT}`,
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "BlogsPro-Orchestrator",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ref: "main",
            inputs: { frequency, force: "true" }
          })
        });

        if (!ghResponse.ok) {
          const errText = await ghResponse.text();
          throw new Error(`GitHub API Error: ${ghResponse.status} - ${errText}`);
        }

        return wrapResponse({ status: "dispatched", frequency, type });

      } catch (e) {
        captureSwarmError(e, { stage: 'dispatch_proxy' }, sentry);
        return wrapResponse({ error: e.message }, 500);
      }
    }

    // 🔒 V5.1 Serverless Secret Vault
    if (url.pathname === "/vault" && request.method === "POST") {
      try {
        if (!env.VAULT_MASTER_KEY) {
          throw new Error("Vault Configuration Incomplete: VAULT_MASTER_KEY not set.");
        }

        const vaultAuth = request.headers.get("X-Vault-Auth") || "";
        if (!vaultAuth || vaultAuth !== env.VAULT_MASTER_KEY) {
          return wrapResponse({ error: "Unauthorized Vault Access" }, 403);
        }

        return wrapResponse({ status: "authenticated", secrets: {
            GH_PAT: env.GH_PAT || "",
            GEMINI: env.GEMINI_API_KEY || "",
            GROQ: env.GROQ_API_KEY || "",
            MISTRAL: env.MISTRAL_API_KEY || "",
            MOONSHOT: env.KIMI_API_KEY || "",
            SENTRY_DSN: env.SENTRY_DSN || ""
        } });

      } catch (e) {
        captureSwarmError(e, { stage: 'vault_access' }, sentry);
        return wrapResponse({ error: e.message }, 500);
      }
    }

    if (url.pathname === "/health" || url.pathname === "/ping") {
        return wrapResponse({ status: "healthy", clock: new Date().toISOString(), node: "Pulse-V3.1" });
    }

    if (url.pathname === "/status") {
        return wrapResponse({ 
            swarm: "Institutional-2026",
            secrets: {
                gh: !!env.GH_PAT,
                vault: !!env.VAULT_MASTER_KEY,
                sentry: !!env.SENTRY_DSN
            },
            config: {
                fireBase: env.FIREBASE_PROJECT_ID,
                orchestrator: "Llama-3.3-70B-Institutional"
            }
        });
    }

    logSwarmBreadcrumb(`Pulse Process Triggered: ${frequency} ${type}`, { url: request.url }, sentry);

    try {
      let localResult = null;
      if (ctx && ctx.waitUntil) {
        ctx.waitUntil(orchestrateSwarm(frequency, type, env, sentry));
      } else {
        localResult = await orchestrateSwarm(frequency, type, env, sentry);
      }
      
      return wrapResponse({ 
        status: "accepted", 
        message: `Swarm triggered for ${frequency} ${type}.`,
        frequency,
        type,
        result: localResult,
        liveTerminal: "https://blogspro-miro-sync.workers.dev/terminal"
      }, 202);
    } catch (e) {
      captureSwarmError(e, { stage: 'orchestration_start', frequency, type }, sentry);
      const isMissingSecret = e.message.includes("missing") || e.message.includes("not set");
      return wrapResponse({ 
        status: "error", 
        message: e.message,
        hint: isMissingSecret ? "Run 'node scripts/sync-secrets.mjs' to restore credentials." : "Check Sentry for trace ID."
      }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    const cron = event.cron;
    let frequency = "hourly";
    let type = "briefing";

    if (cron === "0 4 * * *") { frequency = "daily"; type = "briefing"; }
    else if (cron === "0 5 * * 1") { frequency = "weekly"; type = "article"; }
    else if (cron === "0 6 1 * *") { frequency = "monthly"; type = "article"; }
    else if (cron === "0 * * * *") { frequency = "hourly"; type = "briefing"; }

    const sentry = initWorkerSentry(null, env, ctx);
    logSwarmBreadcrumb(`⏰ Scheduled Trigger: ${cron}`, { frequency, type, swarm: "5.1" }, sentry);
    
    console.log(`⏰ [Pulse] Swarm Trigger: ${type.toUpperCase()} (${frequency.toUpperCase()}) - Cron: ${cron}`);
    ctx.waitUntil(orchestrateSwarm(frequency, type, env, sentry));
  }
};

async function orchestrateSwarm(frequency, type, env, sentry = null) {
  const swarmToken = env.SWARM_INTERNAL_TOKEN || "BPRO_SWARM_SECRET_2026";
  const jobId = `swarm-${frequency}-${Date.now()}`;
  logSwarmBreadcrumb(`Orchestration Phase Start`, { frequency, type, jobId }, sentry);

  // 0. SIGNAL TIER: Report to Durable Object for Live Terminal Tracking
  if (env.MIRO_SYNC_DO) {
    try {
        const id = env.MIRO_SYNC_DO.idFromName('global-swarm-bridge');
        const stub = env.MIRO_SYNC_DO.get(id);
        await stub.fetch("https://sync/push", {
            method: "POST",
            body: JSON.stringify({ 
                source: "SWARM_PROGRESS", 
                jobId, 
                event: "SWARM_START",
                status: "INITIALIZING", 
                frequency, 
                type,
                timestamp: new Date().toISOString()
            })
        });
    } catch (e) { console.warn(`⚠️ [Pulse] DO Status Report Failed:`, e.message); }
  }

  // 1. DATA TIER: Context Gathering
  console.log("📂 [Pulse] Pre-filling Context Mega-Pool...");
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
    meta: { generatedAt: new Date().toISOString(), frequency }
  };

  // 2. SEMANTIC TIER: Distillation
  console.log("🧠 [Pulse] Calling Relevance Worker...");
  const relRes = await env.RELEVANCE.fetch(new Request("https://rel/digest", {
    method: "POST",
    headers: { "X-Swarm-Token": swarmToken },
    body: JSON.stringify(megaPool.hourly)
  }));
  const semanticDigest = await relRes.json();
  semanticDigest.megaPool = megaPool;

  // 3. REASONING TIER: Execute or Dispatch
  if (type === 'article') {
    console.log("🚀 [Pulse] Dispatching to GitHub Actions...");
    const ghToken = env.GH_PAT || env.GH_TOKEN || env.GITHUB_TOKEN;
    if (!ghToken) throw new Error("GH_PAT missing.");

    const dispatchRes = await fetch(`https://api.github.com/repos/abhishekdutta18/blogspro/actions/workflows/institutional-research.yml/dispatches`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ghToken}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "BlogsPro-Orchestrator"
      },
      body: JSON.stringify({ ref: "main", inputs: { freq: frequency, type: type } })
    });

    if (!dispatchRes.ok) throw new Error(`GH Dispatch Fail: ${await dispatchRes.text()}`);

    return { status: "dispatched", jobId };
  }

  const swarmResult = await executeMultiAgentSwarm(frequency, semanticDigest, megaPool.historical, type, env, jobId);

  // 4. GOVERNANCE TIER: Audit
  console.log("⚖️ [Pulse] Calling Auditor...");
  const auditRes = await env.AUDITOR.fetch(new Request("https://audit/verify", {
    method: "POST",
    headers: { "X-Swarm-Token": swarmToken },
    body: JSON.stringify({
      content: swarmResult.final,
      task: `${frequency.toUpperCase()}_SWARM_GEN`,
      metadata: { verticalName: type, verticalId: frequency }
    })
  }));
  const auditResult = await auditRes.json();

  // 5. DISTRIBUTION TIER
  const fileName = `swarm-${frequency}-${Date.now()}.html`;
  await saveBriefing(fileName, auditResult.content, frequency, env);

  const entry = { 
    id: Date.now(), 
    title: `${frequency.toUpperCase()} Swarm ${new Date().toLocaleDateString()}`, 
    date: new Date().toISOString(), 
    file: fileName, 
    frequency, 
    sentiment: semanticDigest.macroFocus?.includes("Greed") ? 75 : 45 
  };
  
  await updateIndex(entry, frequency, env);
  await syncToFirestore(type === 'article' ? "articles" : "pulse_briefings", entry, env);

  console.log(`🏁 [Pulse] Swarm Cycle Complete. [Quality Score: ${auditResult.qualityScore || 'N/A'}]`);
  return { ...entry, qualityScore: auditResult.qualityScore };
}
