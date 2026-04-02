import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { executeMultiAgentSwarm } from "./lib/swarm-orchestrator.js";
import { getBaseTemplate } from "./lib/templates.js";
import { getRecentSnapshots, 
  getHistoricalData, 
  syncToFirestore 
} from "./lib/storage-bridge.js";
import { uploadToStorage } from './lib/firebase-service.js';
import { initNodeSentry, logSwarmBreadcrumb, captureSwarmError } from "./lib/sentry-bridge.js";

async function runInstitutionalSwarm() {
  const frequency = process.argv.find(a => a.startsWith('--freq='))?.split('=')[1] || 'weekly';
  const type = process.argv.find(a => a.startsWith('--type='))?.split('=')[1] || 'article';
  const extended = process.argv.includes('--extended');
  const id = `swarm-${frequency}-${Date.now()}`;

  // 0. INITIALIZE SENTRY (Node.js)
  initNodeSentry(process.env.SENTRY_DSN, frequency);
  logSwarmBreadcrumb(`Starting Institutional Batch: ${frequency}`, { id, extended });

  // 1. NORMALIZE ENVIRONMENT (Bridge .env keys to Swarm Binders)
  const env = {
    ...process.env,
    EXTENDED_MODE: extended, // Explicitly set for orchestrator detection
    AI: { fetch: (url, opts) => fetch(url, opts) },
    TEMPLATE_ENGINE: {
      fetch: async (reqOrUrl, optionsOrNull) => {
        const request = (reqOrUrl instanceof Request) ? reqOrUrl : new Request(reqOrUrl, optionsOrNull);
        try {
            const localRes = await fetch("http://localhost:8888/transform", request.clone());
            if (localRes.ok) return localRes;
        } catch (e) {
            console.log(`🎨 [Swarm] Local template engine offline/congested.`);
        }
        try {
            console.log(`🎨 [Swarm] Template failover: Using production edge...`);
            const edgeRes = await fetch("https://blogspro-templates.abhishek-dutta1996.workers.dev/transform", request.clone());
            if (edgeRes.ok) return edgeRes;
        } catch (e) {
            console.log(`🎨 [Swarm] Production edge unreachable.`);
        }
        console.log(`🏗️ [Swarm] Template recovery: Running NATIVE transformation...`);
        try {
            const data = await request.json();
            const html = getBaseTemplate({
                ...data,
                dateLabel: data.dateLabel || new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
            });
            return {
                ok: true,
                status: 200,
                json: async () => ({ status: "success", html, wordCount: (data.content || "").split(/\s+/).length })
            };
        } catch (err) {
            console.error(`❌ [Recovery] Native template pass failure:`, err.message);
            throw err;
        }
      }
    },
    MIRO_SYNC: {
      fetch: async (url, options) => {
        const localHub = "http://localhost:8787/telemetry";
        try {
          const res = await fetch(localHub, { ...options, headers: { ...options.headers, "Content-Type": "application/json" } });
          if (res.ok) return res;
        } catch (e) { return { json: async () => ({ status: 'local-offline' }), ok: true }; }
      }
    },
    BLOOMBERG_ASSETS: {
        list: async () => ({ objects: [] }),
        get: async () => null,
        put: async () => {}
    }
  };

  console.log(`🚀 [Swarm] Initializing BlogsPro Institutional Synthesis [ID: ${id}]`);
  try {
    // 2. CONTEXT RETRIEVAL
    const snapshots = await getRecentSnapshots(frequency, 5, env);
    const historical = await getHistoricalData(env);
    
    // Normalize snapshots for the 'semanticDigest' argument
    const semanticDigest = snapshots[0] || { strategicLead: "Institutional Macro Drift Analysis." };

    // 3. EXECUTE SWARM (Aligning with exact 6-argument signature)
    const result = await executeMultiAgentSwarm(
        frequency,       // 1. frequency
        semanticDigest,  // 2. semanticDigest
        historical,      // 3. historicalData
        type,            // 4. type
        env,             // 5. env
        id               // 6. jobId
    );

    // 4. ARCHIVAL PHASE
    const fileName = `swarm-${frequency}-${Date.now()}.html`;
    const outPath = path.join(process.cwd(), 'dist', fileName);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    
    // Result object has { final: html }
    fs.writeFileSync(outPath, result.final);
    console.log(`💾 [Swarm] Archive Phase: Saved locally to ${outPath}`);

    // --- 🏺 ARCHIVAL PHASE: Persistent Cloud/Local Storage ---
    try {
        const destination = `${frequency}/${fileName}`;
        logSwarmBreadcrumb(`Starting Firebase Archival: ${destination}`, { size: result.final.length });
        await uploadToStorage(outPath, destination, 'text/html');
        console.log(`🌐 [Swarm] Archive Phase: Uploaded to Firebase Storage (${destination})`);
        logSwarmBreadcrumb(`Firebase Archival Successful: ${destination}`);
    } catch (e) {
        console.warn(`⚠️ [Swarm] Firebase Upload Failed:`, e.message);
        captureSwarmError(e, { stage: 'archival', frequency, fileName });
        // We don't throw here to allow GitHub Output bridge to still run
    }

    // --- 🛰️ GITHUB OUTPUT BRIDGE: For Automated PDF Generation ---
    if (process.env.GITHUB_OUTPUT) {
        const fs = await import('fs');
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `tome_file=dist/${fileName}\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `tome_name=${fileName}\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `tome_type=tome\n`);
        console.log(`🛰️ [Workflow] Emitted GitHub Outputs for PDF Generation.`);
    }

    console.log(`✅ [Dashboard] Institutional Workflow Finalized. [Words: ${result.wordCount}]`);
  } catch (error) {
    console.error(`❌ [Swarm] Pipeline Critical Failure:`, error.message);
    process.exit(1);
  }
}

runInstitutionalSwarm();
