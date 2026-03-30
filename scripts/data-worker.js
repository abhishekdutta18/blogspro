import { 
  getMarketContext, fetchMultiAssetData, fetchEconomicCalendar, 
  fetchSentimentData, fetchUniversalNews, fetchRBIData, 
  fetchSEBIData, fetchUpstoxData, fetchMacroPulse, 
  fetchMFData, fetchPEVCData, fetchInsuranceData, 
  fetchGIFTCityData, fetchCentralBankPulse 
} from "./lib/data-fetchers.js";
import { saveSnapshot } from "./lib/storage-bridge.js";

/**
 * BlogsPro Data Hub Worker (V1.0)
 * ===============================
 * Centralized Data Ingestion Swarm.
 * Responsible for:
 * 1. Global Macro/Market Data Ingestion.
 * 2. Automated Snapshotting to R2 (Temporal Memory).
 * 3. Providing real-time JSON snapshots to the Intelligence Swarm.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const frequency = url.searchParams.get("freq") || "hourly";
    const force = url.searchParams.get("force") === "true";

    try {
      // 1. Load context from KV if fresh (unless 'force' is true)
      if (!force && env.KV) {
        const cached = await env.KV.get(`latest_snapshot_${frequency}`, { type: 'json' });
        if (cached && (Date.now() - cached.timestamp < 300000)) { // 5 min cache
           console.log(`⚡ [DataHub] Serving ${frequency} snapshot from cache.`);
           const res = await env.BLOOMBERG_ASSETS.get(cached.key);
           return new Response(await res.text(), { headers: { "Content-Type": "application/json" } });
        }
      }

      // 2. Perform fresh ingestion
      const data = await ingest(frequency, env);

      // 3. Save Snapshot to R2 (Temporal Memory)
      await saveSnapshot(data, frequency, env);

      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { 
        status: 500, headers: { "Content-Type": "application/json" } 
      });
    }
  },

  async scheduled(event, env) {
    const cron = event.cron;
    let frequency = "hourly";
    if (cron === "0 4 * * *") frequency = "daily";
    else if (cron === "0 5 * * 1") frequency = "weekly";
    else if (cron === "0 6 1 * *") frequency = "monthly";

    console.log(`📡 [DataHub] Scheduled Ingestion: ${frequency.toUpperCase()}`);
    const data = await ingest(frequency, env);
    await saveSnapshot(data, frequency, env);
  }
};

async function ingest(frequency, env) {
  const mktInfo = getMarketContext();
  
  // Parallel ingestion from institutional feeds
  const [ 
    mktData, calendar, sentiment, news, 
    rbi, sebi, upstox, pulse, 
    mf, pevc, ins, gift, banks 
  ] = await Promise.all([
    fetchMultiAssetData(), fetchEconomicCalendar(), fetchSentimentData(), fetchUniversalNews(),
    fetchRBIData(), fetchSEBIData(), fetchUpstoxData(), fetchMacroPulse(),
    fetchMFData(), fetchPEVCData(), fetchInsuranceData(), fetchGIFTCityData(), fetchCentralBankPulse()
  ]);

  return {
    frequency,
    timestamp: Date.now(),
    marketInfo: mktInfo,
    marketData: mktData,
    calendar,
    sentiment,
    news,
    rbi,
    sebi,
    upstox,
    macro: pulse,
    verticals: { mf, pevc, ins, gift, banks }
  };
}
