import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { executeMultiAgentSwarm } from "./lib/swarm-orchestrator.js";
import { getBaseTemplate } from "./lib/templates.js";
import { getRecentSnapshots, 
  getHistoricalData, 
  syncToFirestore,
  pushTelemetryLog,
  saveToCloudBucket,
  getInstitutionalSettings
} from "./lib/storage-bridge.js";
import { uploadToStorage } from './lib/firebase-service.js';
import { runSwarmAudit } from './lib/mirofish-qa-service.js';
import { dispatchTelegramAlert } from './lib/social-utils.js';
import { initNodeSentry, logSwarmBreadcrumb, captureSwarmError, flushSentry } from "./lib/sentry-bridge.js";

async function runInstitutionalSwarm() {
  const start = Date.now();
  const frequency = process.argv.find(a => a.startsWith('--freq='))?.split('=')[1] || 'weekly';
  const type = process.argv.find(a => a.startsWith('--type='))?.split('=')[1] || 'article';
  const mode = process.argv.find(a => a.startsWith('--mode='))?.split('=')[1] || 'standard';
  const targetVerticalId = process.argv.find(a => a.startsWith('--vertical='))?.split('=')[1];
  const extended = process.argv.includes('--extended');
  const id = process.env.SWARM_JOB_ID || `swarm-${frequency}-${Date.now()}`;

  // 0. INITIALIZE SENTRY (Node.js)
  initNodeSentry(process.env.SENTRY_DSN, frequency);
  logSwarmBreadcrumb(`Starting Institutional Batch: ${frequency}`, { id, extended });

  // 0.1 INITIALIZE AI FLEET (V16.0 Ecosystem Upgrade)
  console.log(`🔍 [AI-Balancer] Synchronizing Institutional AI Vault...`);
  const { ResourceManager } = await import("./lib/ai-service.js");
  await ResourceManager.init(process.env);
  
  // 0.2 INITIALIZE TRACE (Firestore)
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
    HIL: process.argv.includes('--hil'), // 🏺 Phase 8.1: Human-in-the-Loop Signaling
    SERIAL_FLOW: true, // [V12.0] Force serial vertical execution within each matrix runner for absolute stability
    DRY_RUN: process.argv.includes('--dry-run'), // [V8.5] Infrastructure Verification Mode
    MODE: mode, // [V9.0] Hybrid Split-Execution Node Mode (Worker vs Master)
    TARGET_VERTICAL_ID: targetVerticalId, // [V12.0] Partitioned execution target for GHA Matrix
    TEST_HIL: process.argv.includes('--test-hil'), 
    AI: { fetch: (url, opts) => fetch(url, opts) },
    TEMPLATE_ENGINE: {
      fetch: async (reqOrUrl, optionsOrNull) => {
        const request = (reqOrUrl instanceof Request) ? reqOrUrl : new Request(reqOrUrl, optionsOrNull);
        
        // [V8.6] Forced Apex Native for Dry-Runs (Aesthetic Verification)
        if (process.argv.includes('--dry-run') || process.argv.includes('--serial')) {
            console.log(`🏗️ [Swarm] DRY_RUN detected: Forcing NATIVE Apex V2 transformation...`);
        } else {
            try {
                const localRes = await fetch("http://localhost:8888/transform", request.clone());
                if (localRes.ok) return localRes;
            } catch (e) {}
            try {
                const edgeRes = await fetch("https://blogspro-templates.abhishek-dutta1996.workers.dev/transform", request.clone());
                if (edgeRes.ok) return edgeRes;
            } catch (e) {}
        }
        
        try {
            const { getApexTemplate } = await import("./lib/templates.js");
            const data = await request.json();
            const now = new Date();
            const html = getApexTemplate({
                title: data.title || `${frequency.toUpperCase()} Strategic Manuscript`,
                excerpt: data.excerpt || `Institutional Strategic Synthesis for ${frequency} cycle. 2026-2027 Roadmap.`,
                content: data.content,
                dateLabel: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
                type: data.type || type,
                freq: data.freq || frequency,
                logoPath: "logo.svg" 
            });
            return {
                ok: true,
                status: 200,
                json: async () => ({ status: "success", html, wordCount: (data.content || "").split(/\s+/).length })
            };
        } catch (err) {
            console.error(`❌ [Recovery] Apex template pass failure:`, err.message);
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

  // 1.1 FETCH GLOBAL POLICY (V17.0 Override)
  try {
    const settings = await getInstitutionalSettings(process.env);
    env.GEMINI_ENABLED = settings.geminiEnabled;
    console.log(`📡 [Policy] Strategic AI Mandate: Gemini is ${env.GEMINI_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  } catch (e) {
    env.GEMINI_ENABLED = true;
  }

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

    // --- 🎛️ MODE BRANCHING: Worker vs Assemble (V12.0) ---
    if (mode === 'worker' && targetVerticalId) {
        console.log(`👷 [Worker-Mode] Commencing Parallel Research for Vertical: ${targetVerticalId}`);
        const { VERTICALS } = await import("./lib/prompts.js");
        const vertical = VERTICALS.find(v => v.id === targetVerticalId);
        if (!vertical) throw new Error(`Invalid Vertical ID: ${targetVerticalId}`);

        // Priming context for worker
        const snapshots = await getRecentSnapshots(frequency, 1, env);
        const semanticDigest = snapshots[0] || { strategicLead: "Genesis Cycle Active." };
        const historical = await getHistoricalData(env);

        const { executeSingleVerticalSwarm } = await import("./lib/swarm-orchestrator.js");
        const fragment = await executeSingleVerticalSwarm(vertical, 1, frequency, semanticDigest, historical, env, id, extended);

        // Save Fragment for Assembly
        const sectorPath = path.join(process.cwd(), 'manuscripts', 'v7', 'sectors');
        if (!fs.existsSync(sectorPath)) fs.mkdirSync(sectorPath, { recursive: true });
        
        const fragmentFile = path.join(sectorPath, `${id}_${targetVerticalId}.json`);
        fs.writeFileSync(fragmentFile, JSON.stringify({
            verticalId: targetVerticalId,
            content: fragment,
            jobId: id,
            timestamp: Date.now()
        }, null, 2));

        console.log(`✅ [Worker-Mode] Fragment Saved: ${fragmentFile}`);
        
        // 🏺 PERSISTENT RECOVERY BRIDGE: Sync fragment to cloud immediately
        const cloudPath = `sectors/${id}/${targetVerticalId}.json`;
        console.log(`📤 [Cloud-Sync] Uploading fragment to Storage: ${cloudPath}`);
        
        try {
            await saveToCloudBucket(cloudPath, {
                verticalId: targetVerticalId,
                content: fragment,
                jobId: id,
                timestamp: Date.now()
            }, env);

            await syncToFirestore("swarm_fragments", { 
                jobId: id, 
                verticalId: targetVerticalId, 
                path: cloudPath,
                status: "ready"
            }, env);
        } catch (e) {
            console.warn(`⚠️ [Cloud-Sync] Primary persistence failed, relying on Artifact fallback: ${e.message}`);
        }

        return;
    }

    if (mode === 'assemble') {
        console.log(`🏰 [Master-Mode] Commencing Institutional Tome Assembly [Job: ${id}]`);
        const { VERTICALS } = await import("./lib/prompts.js");
        
        // 1. GATHER FRAGMENTS
        const sectorPath = path.join(process.cwd(), 'manuscripts', 'v7', 'sectors');
        let fragments = [];
        
        if (fs.existsSync(sectorPath)) {
            const files = fs.readdirSync(sectorPath).filter(f => f.startsWith(id) && f.endsWith('.json'));
            fragments = files.map(f => JSON.parse(fs.readFileSync(path.join(sectorPath, f), 'utf8')));
        }

        if (fragments.length === 0) {
            console.log(`🔍 [Master-Mode] No local fragments. Attempting Cloud Recovery...`);
            const { loadFromCloudBucket } = await import("./lib/storage-bridge.js");
            fragments = await loadFromCloudBucket(id, env);
        }

        console.log(`🧩 [Master-Mode] Found ${fragments.length}/${VERTICALS.length} fragments.`);

        // 2. CONSOLIDATE (This triggers the self-healing finalizeManuscript)
        const snapshots = await getRecentSnapshots(frequency, 1, env);
        const { finalizeManuscript } = await import("./lib/swarm-orchestrator.js");
        
        const consensusSummary = "Consolidated Institutional Consensus Desk [V12.Masterpiece]";
        const result = await finalizeManuscript(fragments, consensusSummary, frequency, type, env, id);

        // 3. ARCHIVE MASTER Tome
        const fileName = `swarm-${frequency}-${Date.now()}.html`;
        const outPath = path.join(process.cwd(), 'dist', fileName);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, result.final);

        console.log(`👑 [Masterpiece-Success] Tome synthesized and archived: ${outPath}`);
        
        // Final PDF generation & Sync
        await pushTelemetryLog("TOME_DISPATCH", { jobId: id, frequency, status: "complete", message: "Institutional Masterpiece Finalized." }, env);
        return;
    }

    // --- 🧬 STANDARD/SERIAL MODE (Legacy) ---
    console.log(`🏃 [Standard-Mode] Running Sequential Institutional Swarm...`);

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
        
        // [V16.1] Cynical Hardening: Rejections are FATAL for high-stakes frequencies
        if (['daily', 'weekly', 'monthly'].includes(frequency)) {
            console.error(`🚨 [Cynical-Policy] Audit rejection detected for '${frequency}'. Aborting dispatch.`);
            throw new Error(`QA_REJECTION_FATAL: MiroFish board rejected the ${frequency} manuscript. Integrity score too low.`);
        }
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

    console.log(`✅ [Dashboard] Institutional Workflow Finalized. [Words: ${result.wordCount}]`);

    // --- 📢 DISPATCH PHASE: Automated Production Release ---
    try {
        console.log(`📢 [Dispatch] Initiating Institutional Release Cascade...`);
        const env = process.env;

        // 1. Telegram Dispatch
        const telegramSummary = {
            title: `Institutional Article Released: ${result.title}`,
            abstract: result.final.replace(/<[^>]*>?/gm, '').slice(0, 300) + "...",
            wordCount: result.wordCount
        };
        await dispatchTelegramAlert(telegramSummary, env);
        console.log(`💎 [Dispatch] Telegram Strategic Alert Sent.`);

        // 2. Newsletter Dispatch (Cloudflare Worker Bridge)
        const newsletterUrl = env.NEWSLETTER_WORKER_URL || "https://newsletter.blogspro.in";
        if (newsletterUrl && env.NEWSLETTER_SECRET) {
            console.log(`💎 [Dispatch] Invoking Newsletter Worker: ${newsletterUrl}`);
            const newsletterRes = await fetch(newsletterUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject: `BlogsPro Institutional: ${result.title}`,
                    html: result.final,
                    secret: env.NEWSLETTER_SECRET,
                    from: "BlogsPro Intelligence"
                })
            });

            if (newsletterRes.ok) {
                console.log(`💎 [Dispatch] Newsletter Distribution Completed Successfully.`);
            } else {
                console.warn(`⚠️ [Dispatch] Newsletter Worker Response: ${newsletterRes.status}`);
            }
        } else {
            console.warn(`⚠️ [Dispatch] NEWSLETTER_WORKER_URL or SECRET missing. Skipping email phase.`);
        }
    } catch (dispatchErr) {
        console.warn(`⚠️ [Dispatch] Release Cascade Encountered Non-Fatal Error:`, dispatchErr.message);
        captureSwarmError(dispatchErr, { stage: 'dispatch_cascade', jobId: id });
    }
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
