import { initWorkerSentry, captureSwarmError, logSwarmBreadcrumb } from "./lib/sentry-bridge.js";
import { serve } from "inngest/cloudflare";
import { inngest, getInngestClient } from "./lib/inngest-client.js";
import { pulseSwarmWorkflow } from "./lib/inngest-functions.js";

/**
 * BlogsPro Pulse Worker (V5.3 - Durable)
 * =====================================
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. SENTRY INITIALIZATION
    const sentry = initWorkerSentry(request, env, ctx);
    logSwarmBreadcrumb(`Pulse Ingress: ${pathname}`, { method: request.method }, sentry);

    // 2. CORS CONFIGURATION
    const origin = request.headers.get("Origin") || "";
    const allowedDomains = ["https://blogspro.in", "http://localhost:5173", "http://localhost:3000"];
    const isPagesDev = origin.endsWith(".pages.dev");
    
    let allowOrigin = "https://blogspro.in";
    if (allowedDomains.includes(origin) || isPagesDev) {
      allowOrigin = origin;
    }

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowOrigin,
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

    try {
      // 3. INNGEST ENDPOINT
      if (pathname === "/api/inngest") {
        return serve({ 
          client: inngest, 
          functions: [pulseSwarmWorkflow] 
        })(request, env, ctx);
      }

      // 4. STATUS & TELEMETRY
      if (pathname === '/status') {
        let telemetry = [];
        try {
          const id = env.MIRO_SYNC_DO.idFromName('global-swarm-bridge');
          const stub = env.MIRO_SYNC_DO.get(id);
          const teleRes = await stub.fetch("https://sync/status");
          const teleData = await teleRes.json();
          telemetry = teleData.jobs || [];
        } catch (e) {
          console.warn("Telemetry Bridge Search Failed:", e.message);
        }
        
        return wrapResponse({ 
          status: "ONLINE", 
          version: "5.3-Durable-Institutional",
          orchestrator: "Inngest",
          telemetry
        });
      }

      // 5. MANUAL DISPATCH (V5.4.2)
      if (pathname === '/dispatch' && request.method === "POST") {
        let body = {};
        try { body = await request.json(); } catch (e) {}

        const type = body.type || url.searchParams.get('type') || 'pulse';
        const freq = body.frequency || body.freq || url.searchParams.get('freq') || 'hourly';
        const jobId = body.jobId || `man-${Date.now()}`;

        // Institutional Security Pass
        const authHeader = request.headers.get("Authorization");
        const swarmToken = request.headers.get("X-Swarm-Token");

        if (!authHeader && !swarmToken && !isPagesDev) {
          return wrapResponse({ error: "Unauthorized — Institutional Pulse Node restricted." }, 401);
        }

        const client = getInngestClient(env);
        ctx.waitUntil(client.send({
          name: "swarm/triggered",
          data: { jobId, type, frequency: freq }
        }));

        return wrapResponse({ success: true, jobId, message: "Durable Dispatch Initiated", type, frequency: freq });
      }

      // 6. VAULT (Secret Propagation for Browser Rendering & GitHub Swarm)
      if (pathname === "/vault" && request.method === "POST") {
        const vaultAuth = request.headers.get("X-Vault-Auth") || "";
        if (!vaultAuth || vaultAuth !== env.VAULT_MASTER_KEY) {
          logSwarmBreadcrumb("Unauthorized Vault Access Attempt", { auth: !!vaultAuth }, sentry);
          return wrapResponse({ error: "Unauthorized Vault Access" }, 403);
        }

        // Institutional Payload: Return actual values managed via scripts/sync-secrets.mjs
        return wrapResponse({ 
          status: "authenticated", 
          secrets: {
            GH_PAT: env.GH_PAT || null,
            GEMINI: env.GEMINI_API_KEY || null,
            GROQ: env.GROQ_API_KEY || null,
            MISTRAL: env.MISTRAL_API_KEY || null,
            INNGEST: env.INNGEST_SIGNING_KEY || null,
            SENTRY: env.SENTRY_DSN || null
          } 
        });
      }

      // 7. DISPATCH STATUS PROXY (V5.4 Hardened)
      if (pathname === "/api/dispatch-status") {
        // Enforce same security as /dispatch
        const idToken = request.headers.get("Authorization");
        if (!idToken && !isPagesDev) {
          return wrapResponse({ error: "Unauthorized — Institutional Node access required." }, 401);
        }

        let body = {};
        if (request.method === "POST") {
          try { body = await request.json(); } catch (e) {}
        }

        const owner = body.owner || url.searchParams.get("owner") || "abhishekdutta18";
        const repo = body.repo || url.searchParams.get("repo") || "blogspro";
        const workflow = body.workflow || url.searchParams.get("workflow") || "manual-dispatch.yml";
        const branch = body.branch || url.searchParams.get("branch") || "main";

        if (!env.GH_PAT) {
          return wrapResponse({ error: "Github PAT not configured in worker secrets." }, 503);
        }

        // Fetch latest run for this workflow
        const ghUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/runs?branch=${branch}&per_page=1`;
        const ghRes = await fetch(ghUrl, {
          headers: {
            "Authorization": `token ${env.GH_PAT}`,
            "User-Agent": "BlogsPro-Pulse-Worker/5.4",
            "Accept": "application/vnd.github.v3+json"
          }
        });

        if (!ghRes.ok) {
          const ghErr = await ghRes.text();
          return wrapResponse({ error: `Github API Error: ${ghRes.status}`, details: ghErr }, ghRes.status);
        }

        const ghData = await ghRes.json();
        const latestRun = ghData.workflow_runs?.[0];

        if (!latestRun) {
          return wrapResponse({ status: "not_found", message: "No workflow runs found." });
        }

        return wrapResponse({
          id: latestRun.id,
          status: latestRun.status, // e.g., "completed", "in_progress"
          conclusion: latestRun.conclusion, // e.g., "success", "failure"
          runUrl: latestRun.html_url,
          updated_at: latestRun.updated_at
        });
      }

      // 7. HEALTH CHECK
      if (pathname === "/health" || pathname === "/ping") {
        return wrapResponse({ status: "healthy", version: "5.3" });
      }

      return wrapResponse({ error: "Not Found" }, 404);

    } catch (err) {
      captureSwarmError(err, { stage: 'worker_ingress', path: pathname }, sentry);
      return wrapResponse({ error: err.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    const cron = event.cron;
    let frequency = "hourly";
    let type = "pulse";

    if (cron === "0 4 * * *") { frequency = "daily"; type = "pulse"; }
    else if (cron === "0 5 * * 1") { frequency = "weekly"; type = "article"; }
    else if (cron === "0 6 1 * *") { frequency = "monthly"; type = "article"; }
    
    console.log(`⏰ [Cron] Triggering ${type} [${frequency}]`);
    
    const client = getInngestClient(env);
    ctx.waitUntil(client.send({
      name: "swarm/triggered",
      data: { jobId: `cron-${Date.now()}`, type, frequency }
    }));
  }
};
