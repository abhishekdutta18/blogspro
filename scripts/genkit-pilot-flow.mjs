import 'dotenv/config';
import { genkit, z } from 'genkit';
import { enableFirebaseTelemetry } from '@genkit-ai/firebase';
import { googleAI } from '@genkit-ai/google-genai';
import { askAI, ResourceManager } from './lib/ai-service.js';
import { fetchDynamicNews } from './lib/data-fetchers.js';
import { promptManager } from './lib/prompt-manager.js';
import 'dotenv/config';

/**
 * [V16.6] PRODUCTION HANDSHAKE
 * Explicitly identifying the project to ensure local telemetry is routed to the Firebase Console.
 */
enableFirebaseTelemetry({
  projectId: process.env.FIREBASE_PROJECT_ID || 'blogspro-ai',
  forceProperty: true // Ensure traces are exported immediately
});

/**
 * [V16.7] DYNAMIC KEY HYDRATION
 * Fetching the mission-critical API key from the Cloudflare Vault.
 */
async function hydrateVault() {
  const vaultUrl = process.env.VAULT_URL || "https://blogspro-pulse.abhishek-dutta1996.workers.dev";
  const vaultSecret = process.env.VAULT_SECRET || process.env.INSTITUTIONAL_MASTER_SECRET;

  if (!vaultUrl || !vaultSecret) {
    console.warn("⚠️ [Vault] Missing VAULT_URL or VAULT_SECRET. Falling back to local .env.");
    return;
  }

  console.log(`📡 [Vault] Connecting to Pulse Vault: ${vaultUrl}...`);

  try {
    const response = await fetch(`${vaultUrl}/vault`, {
      method: "POST",
      headers: { "X-Vault-Auth": vaultSecret }
    });
    if (response.ok) {
      const data = await response.json();
      if (data.secrets?.GEMINI) {
        process.env.GEMINI_API_KEY = data.secrets.GEMINI;
        console.log("✅ [Vault] Successfully hydrated GEMINI key from Pulse Vault.");
      } else {
        console.warn("⚠️ [Vault] Authentication successful, but GEMINI key was missing from Vault secrets.");
      }
    } else {
      console.error(`❌ [Vault] Failed to fetch key: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error(`❌ [Vault] Connection error: ${error.message}`);
  }
}

// Perform hydration before any Genkit model calls
await hydrateVault();

const ai = genkit({
  plugins: [
    googleAI({ apiKey: process.env.GEMINI_API_KEY })
  ], 
});

// --- SOVEREIGN MODEL REGISTRATION ---
ai.defineModel({
  name: 'sambanova-405b',
  supports: { multiturn: true, tools: true, systemRole: true },
}, async (request) => {
  await ResourceManager.init(process.env);
  const lastMessage = request.messages[request.messages.length - 1];
  const prompt = lastMessage.content[0].text;
  
  console.log(`📡 [Genkit-Direct] Routing to SambaNova-405B...`);
  const responseText = await askAI(prompt, { 
    role: 'research', 
    model: 'Meta-Llama-3.1-405B-Instruct-v2', 
    env: process.env 
  });

  return {
    message: { role: 'model', content: [{ text: responseText }] },
    finishReason: 'stop',
  };
});

// --- INSTITUTIONAL TOOL ---
const institutionalSearch = ai.defineTool(
  {
    name: 'institutionalSearch',
    description: 'Search for institutional market news and real-time 2026 data.',
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.string(),
  },
  async (input) => {
    console.log(`📡 [Genkit-Tool] Searching for: ${input.query}`);
    return await fetchDynamicNews(input.query);
  }
);

// --- UNIFIED PILOT FLOW ---
export const institutionalSummaryFlow = ai.defineFlow(
  {
    name: 'institutionalSummaryFlow',
    inputSchema: z.object({ vertical: z.string() }),
    outputSchema: z.string(),
  },
  async (input) => {
    console.log(`🚀 [Genkit-Flow] Starting Unified Institutional Summary for: ${input.vertical}`);

    // 1. Sync with Existing Firebase AI Logic (Firestore)
    await promptManager.sync();

    // 2. Resolve Prompts from Cloud Logic (falling back to local if needed)
    const persona = await promptManager.resolve('institutional_persona');
    const researchPrompt = await promptManager.resolve('researcher', {
      verticalName: input.vertical,
      frequency: 'ad-hoc',
      dataSnapshot: 'Integrated Genkit Flow V16.2',
      historicalData: 'None',
      internetResearch: 'Use institutionalSearch tool',
      rlMemory: 'None',
      semanticMap: 'None',
      blackboardContext: 'Initial pilot execution'
    });

    // 3. STAGE 1 — AUTO-RESEARCH: Grounded Google Search (live web data)
    console.log(`🔍 [Auto-Research] Fetching live web intelligence for: ${input.vertical}...`);
    const groundedResearch = await ai.generate({
      model: 'googleai/gemini-2.5-flash',
      prompt: `You are a senior financial analyst. Search the web and summarize the most critical, current (2026) developments for the "${input.vertical}" sector. Focus on: policy changes, key data releases, market movements, and institutional signals. Be concise and factual.`,
      config: { 
        temperature: 0.1,
        maxOutputTokens: 800,
        // 🔍 AUTO-RESEARCH: Native Google Search grounding — no custom tools mixed in
        googleSearchRetrieval: {}
      },
    });
    const liveIntelligence = groundedResearch.text;
    console.log(`✅ [Auto-Research] Live intelligence gathered (${liveIntelligence.length} chars).`);

    // 4. STAGE 2 — SYNTHESIS: Institutional generation with custom tools + live intel
    const response = await ai.generate({
      model: 'googleai/gemini-2.5-flash',
      system: persona,
      prompt: `${researchPrompt}\n\n---\n[LIVE WEB INTELLIGENCE — Auto-Researched]:\n${liveIntelligence}`,
      tools: [institutionalSearch],
      config: { 
        temperature: 0.1,
        maxOutputTokens: parseInt(process.env.MAX_OUTPUT_TOKENS || '1000'),
      },
    });

    return response.text;
  }
);
