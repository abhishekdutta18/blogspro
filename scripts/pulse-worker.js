import { initWorkerSentry, captureSwarmError, logSwarmBreadcrumb } from "./lib/sentry-bridge.js";
import { serve } from "inngest/cloudflare";
import { inngest, getInngestClient } from "./lib/inngest-client.js";
import { pulseSwarmWorkflow } from "./lib/inngest-functions.js";
import { getGoogleAccessToken, pushTelemetryLog } from "./lib/storage-bridge.js";

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

      // 3.5. KV PROXY (Instant Visibility for Autonomous Articles)
      if (pathname.startsWith('/briefings/') || pathname.startsWith('/articles/')) {
        try {
          const skipKV = url.searchParams.has('static');
          if (!skipKV && env.KV) {
            // Serve from KV for real-time autonomous updates
            const kvPath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
            const data = await env.KV.get(kvPath, { type: 'stream' });
            if (data) {
              const contentType = pathname.endsWith('.json') ? 'application/json' : 'text/html';
              return new Response(data, {
                headers: { 
                  'Content-Type': contentType,
                  'X-Source': 'KV-Dynamic',
                  'Access-Control-Allow-Origin': '*'
                }
              });
            }
          }
        } catch (e) {
          console.warn("KV Proxy Fallback:", e.message);
        }
        // Fallback to site bucket (handled by default at the end)
      }

      // 4. STATUS & TELEMETRY (Unified Institutional Bridge)
      if (pathname === '/status') {
        let telemetry = [];
        try {
          // 4.1. Grab recent logs from the Hardened Firestore collection
          const PROJECT_ID = env.FIREBASE_PROJECT_ID;
          const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/telemetry_logs?pageSize=10&orderBy=timestamp desc`;
          
          const token = await getGoogleAccessToken(env);
          const headers = { "Content-Type": "application/json" };
          if (token) headers["Authorization"] = `Bearer ${token}`;

          const logRes = await fetch(firestoreUrl, { headers });
          if (logRes.ok) {
            const data = await logRes.json();
            telemetry = (data.documents || []).map(doc => ({
              event: doc.fields?.event?.stringValue,
              status: doc.fields?.status?.stringValue,
              timestamp: doc.fields?.timestamp?.timestampValue,
              message: doc.fields?.message?.stringValue
            }));
          }
        } catch (e) {
          console.warn("Institutional Telemetry Retrieval Failed:", e.message);
        }
        
        return wrapResponse({ 
          status: "ONLINE", 
          version: "5.4-Institutional-Hardened",
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

      // 6.5. AI GATEWAY (V7.2 - Institutional Key Restoration)
      if (pathname === "/ai-gateway" && request.method === "POST") {
        const vaultAuth = request.headers.get("X-Vault-Auth") || request.headers.get("Authorization")?.replace('Bearer ', '') || "";
        if (!vaultAuth || vaultAuth !== env.VAULT_MASTER_KEY) {
          return wrapResponse({ error: "Unauthorized Gateway Access" }, 403);
        }

        let body = {};
        try { body = await request.json(); } catch (e) { return wrapResponse({ error: "Invalid JSON" }, 400); }

        const { prompt, model, provider } = body;
        if (!prompt) return wrapResponse({ error: "Missing prompt" }, 400);

        try {
          let responseText = "";
          if (provider === 'groq') {
            responseText = await handleGroqGateway(prompt, model, env);
          } else if (provider === 'gemini') {
            responseText = await handleGeminiGateway(prompt, model, env);
          } else if (provider === 'sambanova') {
            responseText = await handleSambaNovaGateway(prompt, model, env);
          } else if (provider === 'huggingface') {
            responseText = await handleHuggingFaceGateway(prompt, model, env);
          } else {
            return wrapResponse({ error: `Provider ${provider} not supported on gateway.` }, 400);
          }
          return wrapResponse({ success: true, response: responseText });
        } catch (e) {
          captureSwarmError(e, { stage: 'ai_gateway', provider, model }, sentry);
          return wrapResponse({ error: e.message }, 500);
        }
      }

      // 7. GITHUB DISPATCH STATUS (V5.4 Hardened)
      if (pathname === "/api/dispatch-status") {
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
            "User-Agent": "BlogsPro-Pulse-Worker/5.5",
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
          status: latestRun.status,
          conclusion: latestRun.conclusion,
          runUrl: latestRun.html_url,
          updated_at: latestRun.updated_at
        });
      }

      // 7.2. GITHUB ACTION DISPATCH PROXY (V5.5 - Institutional Manual Trigger)
      if (pathname === "/api/trigger-github" && request.method === "POST") {
        const idToken = request.headers.get("Authorization");
        if (!idToken && !isPagesDev) {
          return wrapResponse({ error: "Unauthorized — Institutional Pulse Node access required." }, 401);
        }

        let body = {};
        try { body = await request.json(); } catch (e) {}
        
        const frequency = body.frequency || "weekly";
        const owner = "abhishekdutta18";
        const repo = "blogspro";
        const workflow = "manual-dispatch.yml";

        if (!env.GH_PAT) {
          return wrapResponse({ error: "Github PAT not configured in worker secrets." }, 503);
        }

        logSwarmBreadcrumb(`External Dispatch Trigger: ${frequency}`, { owner, repo, workflow }, sentry);

        const ghUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;
        const ghRes = await fetch(ghUrl, {
          method: "POST",
          headers: {
            "Authorization": `token ${env.GH_PAT}`,
            "User-Agent": "BlogsPro-Pulse-Worker/5.5",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ref: "main",
            inputs: { frequency }
          })
        });

        if (!ghRes.ok) {
          const ghErr = await ghRes.text();
          return wrapResponse({ error: `Github Dispatch Failed: ${ghRes.status}`, details: ghErr }, ghRes.status);
        }

        return wrapResponse({ 
          success: true, 
          message: `Institutional Dispatch for ${frequency} initiated.`,
          workflow: workflow
        });
      }

      // 7.5. HEALTH & BRIDGE AWARENESS (V7.1)
      if (pathname === "/health" || pathname === "/ping") {
        return wrapResponse({ status: "healthy", version: "7.1-Unified-Brain" });
      }

      if (pathname === "/bridge-health") {
        const bridgeUrl = env.NGROK_DOMAIN || "institutional-bridge.ngrok-free.app";
        let bridgeStatus = "OFFLINE";
        try {
          const res = await fetch(`https://${bridgeUrl}/ping`, { signal: AbortSignal.timeout(3000) });
          if (res.ok) bridgeStatus = "ONLINE";
        } catch (e) {
          bridgeStatus = `UNREACHABLE: ${e.message}`;
        }
        return wrapResponse({ bridge: bridgeStatus, domain: bridgeUrl });
      }

      // 8. TELEGRAM WEBHOOK (V5.4 Hardened - ID Capture)
      if (pathname === "/telegram-webhook" && request.method === "POST") {
        try {
          const body = await request.json();
          const message = body.message;
          if (message && message.chat && message.text) {
            const chatId = message.chat.id;
            const text = message.text.toLowerCase();
            
            if (text.includes('/id') || text.includes('/status')) {
              const botToken = env.TELEGRAM_BOT_TOKEN;
              if (botToken) {
                const reply = `🦾 <b>BlogsPro Institutional Signal</b>\n\n🔹 Your Chat ID: <code>${chatId}</code>\n🔹 Worker Version: 5.4.2\n🔹 Status: READY`;
                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: chatId,
                    text: reply,
                    parse_mode: 'HTML'
                  })
                });
              }
            }
          }
          return wrapResponse({ success: true });
        } catch (e) {
          return wrapResponse({ error: "Webhook Process Failed" }, 400);
        }
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

/**
 * 🛰️ INSTITUTIONAL GATEWAY HANDLERS
 * ================================
 */

async function handleGroqGateway(prompt, model, env) {
  const key = env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not configured on edge.");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model || "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    })
  });

  const data = await res.json();
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
  throw new Error(data.error?.message || "Groq Gateway Failure");
}

async function handleGeminiGateway(prompt, model, env) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured on edge.");

  const targetModel = model || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${key}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  const data = await res.json();
  if (data.candidates?.[0]?.content?.parts?.[0]?.text) return data.candidates[0].content.parts[0].text;
  throw new Error(data.error?.message || "Gemini Gateway Failure");
}

async function handleSambaNovaGateway(prompt, model, env) {
  const key = env.SAMBANOVA_API_KEY;
  if (!key) throw new Error("SAMBANOVA_API_KEY not configured on edge.");

  // V12.0: Institutional Model Selector (DeepSeek-V3 for 1T-class MoE performance)
  let targetModel = model || "DeepSeek-V3";
  if (model?.toLowerCase().includes('deepseek')) targetModel = "DeepSeek-V3";
  else if (model?.toLowerCase().includes('405b')) targetModel = "Meta-Llama-3.1-405B-Instruct-v2";

  const res = await fetch("https://api.sambanova.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: targetModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1
    })
  });

  const data = await res.json();
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
  throw new Error(data.error?.message || "SambaNova Gateway Failure");
}

async function handleHuggingFaceGateway(prompt, model, env) {
  const key = env.HF_TOKEN;
  if (!key) throw new Error("HF_TOKEN not configured on edge.");

  const res = await fetch("https://router.huggingface.co/hf/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model || "mistralai/Mistral-7B-Instruct-v0.3",
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await res.json();
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
  throw new Error(data.error?.message || "HuggingFace Gateway Failure");
}
