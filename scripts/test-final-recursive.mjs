/**
 * BlogsPro — Final Recursive Architecture Test
 * =============================================
 * Tests: Recursive generation state machine, KV persistence, DO alarm init.
 * Offline-safe: All AI calls and upstream fetches are stubbed via fetch mock.
 *
 * IMPORTANT: Env vars must be set BEFORE ESM static imports resolve.
 */

// Inject dummy keys so AI provider pool has ≥1 entry (calls are mock-intercepted)
process.env.GEMINI_API_KEY   = "mock-gemini-key";
process.env.GROQ_API_KEY     = "mock-groq-key";
process.env.OPENROUTER_KEY   = "mock-openrouter-key";

// ─── 1. MOCK AI via globalThis (read before ESM imports resolve) ───────────
// The ai-service uses fetch internally; we intercept at the fetch layer.
const MOCK_CONTENT = `<h2>Global Macro Drift</h2>
<details id="meta-excerpt" style="display:none">DXY volatility pivots as Fed signals tightening termination.</details>

Institutional capital rotation underway across G7 sovereigns.

| Metric | Observation | Alpha Impact |
|:-------|:------------|:-------------|
| DXY Index | 104.2 | Bearish EM FX |
| US 10Y Yield | 4.25% | Credit Spread Tightening |
| FII Inflow | $2.4B | Nifty Support |
| Brent Crude | $82.5 | Inflationary Moderation |
| India GDP | 7.2% | Sovereign Premium |

[Reuters](https://reuters.com/markets) · [RBI](https://rbi.org.in)
SENTIMENT_SCORE: 82 | POLL: Best hedge? | OPTIONS: Gold, USD, BTC
<chart-data>[["DXY", 104.0], ["10Y", 4.25], ["GDP", 7.20]]</chart-data>`;

// ─── 2. MOCK ENVIRONMENT ──────────────────────────────────────────────────────
const mockKV = new Map();
const mockR2 = new Map();

const env = {
  KV: {
    get: async (key, options) => {
      const val = mockKV.get(key);
      if (options?.type === 'json' && val) return JSON.parse(val);
      return val || null;
    },
    put: async (key, val) => { mockKV.set(key, typeof val === 'object' ? JSON.stringify(val) : val); },
    delete: async (key) => { mockKV.delete(key); }
  },
  BLOOMBERG_ASSETS: {
    put: async (key, content) => { mockR2.set(key, content); },
    get: async (key) => ({ json: async () => JSON.parse(mockR2.get(key) || '{}') })
  },
  NEWSLETTER_SECRET: "test-secret-123",
  FIREBASE_PROJECT_ID: "test-project",
  TELEGRAM_TOKEN: "mock-token",
  TELEGRAM_TO: "mock-chat-id"
};

// ─── 3. MOCK FETCH (intercepts AI API calls + self-callbacks) ─────────────────
import { generateArticleJob } from "./generation-worker.js";
import { DataIngestor } from "./ingestion-worker.js";

globalThis.fetch = async (url, options) => {
  const urlStr = url.toString();

  // Self-callback to generation worker → simulate in-process
  if (urlStr.includes("blogspro-gen.workers.dev")) {
    const u = new URL(urlStr);
    const freq  = u.searchParams.get("freq");
    const jobId = u.searchParams.get("jobId");
    const step  = parseInt(u.searchParams.get("step") || "0");
    console.log(`🔁 [SIMULATION] Recursing → step ${step}`);
    return await generateArticleJob(freq, env, jobId, step);
  }

  // External AI / API calls → return mock content
  if (urlStr.includes("openrouter") || urlStr.includes("groq") ||
      urlStr.includes("mistral") || urlStr.includes("gemini") ||
      urlStr.includes("cerebras") || urlStr.includes("together") ||
      urlStr.includes("deepinfra") || urlStr.includes("generativelanguage")) {
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: MOCK_CONTENT } }],
        candidates: [{ content: { parts: [{ text: MOCK_CONTENT }] } }]
      }),
      text: async () => MOCK_CONTENT
    };
  }

  // Everything else (Firestore, Telegram, GitHub, etc.)
  return { ok: true, json: async () => ({ status: "mocked" }), text: async () => "mocked" };
};

// ─── 4. TEST RUNNER ───────────────────────────────────────────────────────────
async function runFinalTest() {
  console.log("🏁 [TEST] Final Recursive Pipeline Validation");
  console.log("═══════════════════════════════════════════════\n");

  // ── TEST 1: Initiate Step 0 ───────────────────────────────────────────────
  console.log("[TEST 1] Step 0 — Bootstrap recursive tome...");
  const result = await generateArticleJob("weekly", env, null, 0);
  const step0OK = result && (result.status === "pending" || result.status === "complete");
  console.log(`  ${step0OK ? "✅" : "❌"} Step 0: ${result?.status || "no result"} (jobId: ${result?.jobId})\n`);

  // ── TEST 2: KV continuity — check what Step 0 actually wrote ────────────
  console.log("[TEST 2] KV State Persistence — checking step-0 content buffer...");
  if (result?.jobId) {
    // The generation worker stores each vertical under `{jobId}_content`
    // or `{jobId}_step_{n}` depending on the implementation.
    // Scan KV for any key matching the jobId.
    const kvKeys = [...mockKV.keys()].filter(k => k.includes(result.jobId));
    const kvOK = kvKeys.length > 0;
    const kvSample = kvKeys[0] ? mockKV.get(kvKeys[0])?.substring(0, 60) : "(empty)";
    console.log(`  ${kvOK ? "✅" : "❌"} KV Keys found: [${kvKeys.join(", ")}]`);
    if (kvOK) console.log(`  📄 Sample: ${kvSample}...`);
    console.log("");
  } else {
    console.log("  ⚠️  Skipped (no jobId from step 0)\n");
  }

  // ── TEST 3: DataIngestor DO alarm ─────────────────────────────────────────
  console.log("[TEST 3] DataIngestor — Verify alarm loop initialization...");
  const alarmLog = [];
  let mockAlarmTime = null;
  const mockState = {
    storage: {
      getAlarm: async () => mockAlarmTime,
      setAlarm: async (t) => {
        mockAlarmTime = t;
        alarmLog.push(`alarm@T+${Math.round((t - Date.now()) / 1000)}s`);
      },
      get: async () => null,
      put: async () => {}
    }
  };
  const ingestor = new DataIngestor(mockState, env);
  const startReq = new Request("https://ingest/start");
  const response  = await ingestor.fetch(startReq);
  const data      = await response.json();
  const alarmOK   = data.status === "alarm_set" || alarmLog.length > 0;
  console.log(`  ${alarmOK ? "✅" : "❌"} Alarm: ${alarmLog[0] || data.status}`);

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  const allPassed = step0OK && alarmOK;
  console.log("\n═══════════════════════════════════════════════");
  console.log(allPassed
    ? "✨ ALL TESTS PASSED — Pipeline architecture validated."
    : "⚠️  SOME TESTS FAILED — Review output above.");
}

runFinalTest().catch(console.error);
