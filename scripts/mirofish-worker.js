import { generateMiroForecast } from "./lib/mirofish-persona.js";
import { hasMiroSync, miroSyncFetch } from "./lib/miro-sync-client.js";

/**
 * BlogsPro MiroFish 4.0 Consensus Worker
 * =====================================
 * High-performance institutional foresight tier.
 * Executed in parallel with Pulse research verticals.
 */

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Use POST for MiroFish consensus.", { status: 405 });
    }

    try {
      const { marketContext, task } = await request.json();
      const swarmToken = request.headers.get("X-Swarm-Token");

      // Institutional Handshake
      if (swarmToken !== env.SWARM_INTERNAL_TOKEN) {
        return new Response("Unauthorized Swarm Access", { status: 401 });
      }

      console.log(`🕵️ [MiroFish] Initiating Strategic Consensus for: ${task || 'Pulse Foresight'}`);

      const forecast = await generateMiroForecast(marketContext, env);

      // Institutional Intelligence Bridge to Affine
      let syncStatus = "skipped";
      if (hasMiroSync(env)) {
        try {
          const syncRes = await miroSyncFetch(env, "/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              content: forecast, 
              source: `MiroFish Swarm | Task: ${task || 'Pulse Foresight'}` 
            })
          });
          if (syncRes.ok) syncStatus = "synchronized";
          console.log(`📡 [MiroFish] Sync Status: ${syncStatus}`);
        } catch (syncErr) {
          console.warn("⚠️ MiroSync Push Failed:", syncErr.message);
          syncStatus = "failed";
        }
      }

      return new Response(JSON.stringify({ 
        status: "success", 
        syncStatus,
        forecast,
        timestamp: new Date().toISOString()
      }), {
        headers: { "Content-Type": "application/json" }
      });

    } catch (e) {
      console.error("❌ [MiroFish Engine] Error:", e);
      return new Response(JSON.stringify({ status: "error", message: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};
