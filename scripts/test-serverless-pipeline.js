/**
 * test-serverless-pipeline.js
 * ===========================
 * End-to-end local test for the new BlogsPro Serverless Worker.
 * Mocks the Cloudflare Worker environment (R2, KV, Firestore) and triggers 
 * the generation logic found in scripts/generation-worker.js.
 */

const { 
  generateBriefingJob, 
  generateArticleJob 
} = require("./generation-worker.js");

// 1. MOCK CLOUDFLARE ENVIRONMENT
const env = {
  // MOCK R2 BUCKET
  BLOOMBERG_ASSETS: {
    put: async (key, content) => {
      console.log(`📦 [MOCK R2] Storing: ${key}`);
      return { key };
    }
  },
  // MOCK KV NAMESPACE
  KV: {
    get: async (key, { type }) => {
      console.log(`📇 [MOCK KV] Getting: ${key}`);
      return null; // Start fresh
    },
    put: async (key, val) => {
      console.log(`📇 [MOCK KV] Storing: ${key}`);
      return;
    }
  },
  // FIREBASE CONFIG
  FIREBASE_PROJECT_ID: "blogspro-ai",
  
  // AI KEYS (Requires user's local env)
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.LLM_API_KEY
};

async function runPipelineTest() {
  console.log("🚀 Starting End-to-End Serverless Pipeline Test...");
  console.log("---------------------------------------------------");

  if (!env.GEMINI_API_KEY) {
    console.warn("⚠️  Warning: No AI API Key found. This test will likely fail at the generation stage.");
    console.log("   Suggestion: run with GEMINI_API_KEY=... node scripts/test-serverless-pipeline.js");
  }

  try {
    // 2. TEST HOURLY PULSE BRIEFING
    console.log("\n🧪 Testing HOURLY Pulse Generation...");
    const dailyEntry = await generateBriefingJob("hourly", env);
    console.log("✅ Hourly Briefing record created:", dailyEntry);

    // 3. TEST TOME STRATEGIC ARTICLE (Optional/Slow)
    // console.log("\n🧪 Testing WEEKLY Tome Generation...");
    // const weeklyEntry = await generateArticleJob("weekly", env);
    // console.log("✅ Weekly Tome record created:", weeklyEntry);

    console.log("\n✨ PIPELINE TEST CONCLUDED.");
    console.log("Check your MOCK logs above to verify R2, KV, and Firestore sync steps.");
  } catch (e) {
    console.error("\n❌ PIPELINE TEST FAILED:");
    console.error(e.message);
  }
}

runPipelineTest();
