import mirofish from "./mirofish-worker.js";
import { MiroSync } from "./miro-sync-worker.js";
import * as Y from 'yjs';

// --- MOCK ENVIRONMENT ---
const env = {
  SWARM_INTERNAL_TOKEN: "test-token",
  MIRO_SYNC_DO: {
    idFromName: () => "mock-id",
    get: (id) => {
      // Mocked MiroSync instance
      const state = {
        storage: {
          get: async () => null,
          put: async () => {},
          getAlarm: async () => null
        },
        blockConcurrencyWhile: async (fn) => await fn()
      };
      const mirosync = new MiroSync(state, {});
      return {
        fetch: async (req) => await mirosync.fetch(req)
      };
    }
  },
  GROQ_API_KEY: "mock-groq-key" // for ai-service pool initialization
};

// Mock global fetch for AI calls
globalThis.fetch = async (url) => {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: "### MiroFish Strategic Forecast\nConsensus: Bullish. Alpha detected in small-cap credit." } }]
    })
  };
};

async function testSync() {
  console.log("🏁 [TEST] Verifying MiroFish -> MiroSync Integration...");

  const req = new Request("https://mirofish/consensus", {
    method: "POST",
    headers: { "X-Swarm-Token": "test-token" },
    body: JSON.stringify({ marketContext: "Market is volatile.", task: "Test Sync" })
  });

  const response = await mirofish.fetch(req, env);
  const data = await response.json();

  console.log("\n[RESULT] MiroFish Response:", JSON.stringify(data, null, 2));

  if (data.syncStatus === "synchronized") {
    console.log("\n✅ SUCCESS: MiroFish correctly pushed forecast to MiroSync bridge.");
  } else {
    console.error("\n❌ FAILURE: Sync status was:", data.syncStatus);
    process.exit(1);
  }
}

testSync().catch(console.error);
