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

      // 5. MANUAL DISPATCH
      if (pathname === '/dispatch' && request.method === "POST") {
        const type = url.searchParams.get('type') || 'pulse';
        const freq = url.searchParams.get('freq') || 'hourly';
        const jobId = `man-${Date.now()}`;

        const client = getInngestClient(env);
        ctx.waitUntil(client.send({
          name: "swarm/triggered",
          data: { jobId, type, frequency: freq }
        }));

        return wrapResponse({ success: true, jobId, message: "Durable Dispatch Initiated" });
      }

      // 6. VAULT (Secret Propagation for Browser Rendering)
      if (pathname === "/vault" && request.method === "POST") {
        const vaultAuth = request.headers.get("X-Vault-Auth") || "";
        if (!vaultAuth || vaultAuth !== env.VAULT_MASTER_KEY) {
          return wrapResponse({ error: "Unauthorized Vault Access" }, 403);
        }

        return wrapResponse({ 
          status: "authenticated", 
          secrets: {
            GEMINI: !!env.GEMINI_API_KEY,
            INNGEST: !!env.INNGEST_SIGNING_KEY,
            SENTRY: !!env.SENTRY_DSN
          } 
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
