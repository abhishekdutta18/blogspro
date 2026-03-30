import { 
  getMarketContext, fetchMultiAssetData, fetchEconomicCalendar, 
  fetchSentimentData, fetchUniversalNews, fetchRBIData, 
  fetchSEBIData, fetchUpstoxData, fetchMacroPulse, 
  fetchMFData, fetchPEVCData, fetchInsuranceData, 
  fetchGIFTCityData, fetchCentralBankPulse 
} from "./lib/data-fetchers.js";

/**
 * High-Frequency Ingestion Worker
 * Uses Durable Object Alarms to achieve 5-second polling (bypassing 1-min Cron limit)
 */
export class DataIngestor {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    // Start the alarm loop if not already running
    const alarm = await this.state.storage.getAlarm();
    if (alarm === null) {
      await this.state.storage.setAlarm(Date.now() + 5000);
      return new Response(JSON.stringify({ status: "alarm_set", nextPulseMs: 5000 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ status: "alarm_already_active", alarm }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  async alarm() {
    console.log("📡 [Ingestor] 5-Second Pulse Triggered");
    
    try {
      const data = await this.performIngestion();
      
      // Update all frequency buckets in KV
      const frequencies = ["hourly", "daily", "weekly", "monthly"];
      const timestamp = Date.now();
      
      for (const freq of frequencies) {
        await this.env.KV.put(`latest_snapshot_${freq}`, JSON.stringify({
          ...data,
          frequency: freq,
          timestamp
        }));
      }
      
      console.log("✅ [Ingestor] Data Buckets Synchronized.");
    } catch (e) {
      console.error("❌ [Ingestor] Pulse Failed:", e.message);
    }

    // Schedule next pulse in 5 seconds
    await this.state.storage.setAlarm(Date.now() + 5000);
  }

  async performIngestion() {
    const mktInfo = getMarketContext();
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
}

export default {
  async fetch(request, env) {
    const id = env.INGESTOR_DO.idFromName('global-ingestor');
    const obj = env.INGESTOR_DO.get(id);
    return obj.fetch(request);
  }
};
