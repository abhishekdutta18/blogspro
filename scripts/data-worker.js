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
    // 0. Governance: Internal API Authentication
    const token = request.headers.get("X-Swarm-Token");
    if (token !== env.SWARM_INTERNAL_TOKEN && env.ENVIRONMENT !== 'development') {
      return new Response(JSON.stringify({ error: "Unauthorized Swarm Access" }), { 
        status: 401, headers: { "Content-Type": "application/json" } 
      });
    }

    const url = new URL(request.url);
    const frequency = url.searchParams.get("freq") || "hourly";
    const force = url.searchParams.get("force") === "true";

    try {
      // 1. Load context from Firestore if fresh (unless 'force' is true)
      if (!force && env.FIREBASE_PROJECT_ID) {
        try {
          const snapshotMeta = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/latest_snapshots/latest_${frequency}`).then(r => r.json());
          
          // Fix: Standardize on doubleValue for timestamps
          if (snapshotMeta.fields && snapshotMeta.fields.timestamp) {
            const timestamp = parseFloat(snapshotMeta.fields.timestamp.doubleValue || snapshotMeta.fields.timestamp.integerValue);
            if (Date.now() - timestamp < 300000) { 
              console.log(`⚡ [DataHub] Serving ${frequency} snapshot from Storage: ${snapshotMeta.fields.key.stringValue}`);
              const storageUrl = `https://storage.googleapis.com/${env.FIREBASE_STORAGE_BUCKET}/${snapshotMeta.fields.key.stringValue}`;
              const res = await fetch(storageUrl);
              return new Response(await res.text(), { headers: { "Content-Type": "application/json" } });
            }
          }
        } catch (e) {
          console.warn(`⚠️ [DataHub] Snapshot Cache Miss: ${e.message}`);
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
  
  // 1. Parallel Resilient Ingestion
  console.log(`🌐 [DataHub] Executing High-Availability Ingestion Loop [Freq: ${frequency}]...`);
  const promises = [
    fetchMultiAssetData(), fetchEconomicCalendar(), fetchSentimentData(), fetchUniversalNews(),
    fetchRBIData(), fetchSEBIData(), fetchUpstoxData(), fetchMacroPulse(),
    fetchMFData(), fetchPEVCData(), fetchInsuranceData(), fetchGIFTCityData(), fetchCentralBankPulse()
  ];

  const results = await Promise.allSettled(promises);
  const data = results.map((res, idx) => {
    if (res.status === 'fulfilled') return res.value;
    console.error(`⚠️ [DataHub] Provider ${idx} Failed: ${res.reason?.message || "Unknown error"}`);
    return { summary: "Data partially unavailable.", error: true };
  });

  const [ 
    mktData, calendar, sentiment, news, 
    rbi, sebi, upstox, pulse, 
    mf, pevc, ins, gift, banks 
  ] = data;

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
