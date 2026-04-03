import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { executeMultiAgentSwarm } from "./lib/swarm-orchestrator.js";
import { getBaseTemplate } from "./lib/templates.js";
import { getRecentSnapshots, 
  getHistoricalData, 
  syncToFirestore,
  pushTelemetryLog
} from "./lib/storage-bridge.js";
import { uploadToStorage } from './lib/firebase-service.js';
import { runSwarmAudit } from './lib/mirofish-qa-service.js';
import { initNodeSentry, logSwarmBreadcrumb, captureSwarmError, flushSentry } from "./lib/sentry-bridge.js";

async function runInstitutionalSwarm() {
  const frequency = process.argv.find(a => a.startsWith('--freq='))?.split('=')[1] || 'weekly';
  const type = process.argv.find(a => a.startsWith('--type='))?.split('=')[1] || 'article';
  const extended = process.argv.includes('--extended');
  const id = `swarm-${frequency}-${Date.now()}`;

  // 0. INITIALIZE SENTRY (Node.js)
  initNodeSentry(process.env.SENTRY_DSN, frequency);
  logSwarmBreadcrumb(`Starting Institutional Batch: ${frequency}`, { id, extended });

  // 0.1 INITIALIZE TRACE (Firestore)
  console.log(`📡 [Trace] Initializing Institutional Audit Log...`);
  await pushTelemetryLog("SWARM_START", { 
    frequency, 
    jobId: id, 
    status: "initializing",
    message: `Initializing BlogsPro Institutional Synthesis [${frequency}]`
  }, process.env);

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
    // 2. CONTEXT RETRIEVAL (Institutional Rule: Zero-Pollution Policy)
    let snapshots = await getRecentSnapshots(frequency, 1, env);
    const historical = await getHistoricalData(env);
    
    let semanticDigest;
    if (!snapshots || snapshots.length === 0) {
        console.warn(`🛰️ [Cold-Start] No legacy snapshots found for ${frequency}. Initializing GEOPOLITICAL_GENESIS.`);
        semanticDigest = {
            timestamp: new Date().toISOString(),
            frequency: frequency,
            strategicLead: `GEOPOLITICAL_GENESIS: Initializing first ${frequency} research cycle for BlogsPro Institutional Registry.`,
            tome_type: "article",
            key: `snapshots/genesis_${frequency}_${Date.now()}.json`
        };
        await pushTelemetryLog("COLD_START", { frequency, jobId: id, status: "warn", message: "No snapshots found. Initializing genesis context." }, env);
    } else {
        semanticDigest = snapshots[0];
    }
    console.log(`📊 [Swarm] Context Primed: [Snapshot: ${semanticDigest.timestamp}] [Historical: ${historical ? 'OK' : 'MISS'}]`);

    // 3. EXECUTE SWARM (Aligning with exact 6-argument signature)
    const result = await executeMultiAgentSwarm(
        frequency,       // 1. frequency
        semanticDigest,  // 2. semanticDigest
        historical,      // 3. historicalData
        type,            // 4. type
        env,             // 5. env
        id               // 6. jobId
    );

    // 4. QUALITY ASSURANCE: Institutional Swarm Review
    let auditStatus = "PENDING";
    try {
        console.log(`🕵️ [Swarm] Initiating MiroFish Consensus Review [Freq: ${frequency}]...`);
        await runSwarmAudit(result.final, frequency);
        auditStatus = "AUDITED";
        console.log(`✅ [Swarm] Institutional Review Passed. Status: ${auditStatus}`);
    } catch (e) {
        auditStatus = "AUDIT_FAILED";
        console.warn(`⚠️ [Swarm] Institutional Review REJECTED/FAILED:`, e.message);
        captureSwarmError(e, { stage: 'qa_audit', frequency, id });
        // In "Resilient Mode", we still allow the tome to be saved but marked as failed
    }

    // 5. ARCHIVAL PHASE
    const fileName = `swarm-${frequency}-${Date.now()}.html`;
    const outPath = path.join(process.cwd(), 'dist', fileName);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    
    // Result object has { final: html }. We inject the audit status into a meta tag.
    let finalHtml = result.final;
    if (finalHtml.includes('</head>')) {
        finalHtml = finalHtml.replace('</head>', `<meta name="swarm-status" content="${auditStatus}">\n</head>`);
    }

    fs.writeFileSync(outPath, finalHtml);
    console.log(`💾 [Swarm] Archive Phase: Saved locally to ${outPath} [Status: ${auditStatus}]`);

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
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `tome_file=dist/${fileName}\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `tome_name=${fileName}\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `tome_type=${type}\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `tome_audit=${auditStatus}\n`);
        console.log(`🛰️ [Workflow] Emitted GitHub Outputs for PDF Generation: ${fileName} (Status: ${auditStatus})`);
    }

    // 6. DENSITY GATE: Institutional Hard-Fail Requirement
    const MIN_DENSITY = 1500;
    if (frequency !== 'hourly' && result.wordCount < MIN_DENSITY) {
        const densityError = `❌ [Swarm] Density Violation: Generated content is too thin (${result.wordCount} words). Institutional mandate requires >${MIN_DENSITY}. Rejecting Archive.`;
        console.error(densityError);
        await captureSwarmError(new Error(densityError), { 
            stage: 'density_check', 
            wordCount: result.wordCount, 
            frequency,
            jobId: id 
        });
        await flushSentry();
        process.exit(1);
    }

    console.log(`✅ [Dashboard] Institutional Workflow Finalized. [Words: ${result.wordCount}]`);
    await pushTelemetryLog("SWARM_COMPLETE", { 
        frequency, 
        jobId: id, 
        status: "success", 
        latency: Date.now() - start,
        message: `Institutional Dispatch Finalized: ${result.wordCount} words.`,
        details: { wordCount: result.wordCount, audit: auditStatus }
    }, env);
    await flushSentry();
  } catch (error) {
    console.error(`❌ [Swarm] Pipeline Critical Failure:`, error.message);
    const fallbackFreq = process.argv.find(a => a.startsWith('--freq='))?.split('=')[1] || 'weekly';
    await pushTelemetryLog("SWARM_ERROR", { 
        frequency: fallbackFreq, 
        jobId: id, 
        status: "error", 
        message: `Pipeline Critical Failure: ${error.message}`
    }, process.env);
    await captureSwarmError(error, { stage: 'pipeline_critical', frequency: fallbackFreq });
    await flushSentry();
    process.exit(1);
  }
}

runInstitutionalSwarm();
