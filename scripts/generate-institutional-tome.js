import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { executeMultiAgentSwarm } from "./lib/swarm-orchestrator.js";
import { getBaseTemplate } from "./lib/templates.js";
import { getBriefingTemplate } from "./lib/briefing-template.js";
import { getTerminalV2Template } from "./lib/terminal-v2-template.js";
import { getRecentSnapshots, 
  getHistoricalData, 
  syncToFirestore,
  pushTelemetryLog,
  saveToCloudBucket,
  checkPeriodStatus,
  pushSovereignNewsletter,
  getInstitutionalSettings,
  pushMultipleToGitHub
} from "./lib/storage-bridge.js";
import { uploadToStorage } from './lib/firebase-service.js';
import { runSwarmAudit } from './lib/mirofish-qa-service.js';
import { dispatchTelegramAlert } from './lib/social-utils.js';
import { initNodeSentry, logSwarmBreadcrumb, captureSwarmError, flushSentry } from "./lib/sentry-bridge.js";
import { NewsOrchestrator } from "./lib/news-orchestrator.js";
import { askAI } from "./lib/ai-service.js";
import { generateMarketEdition } from "./lib/market-edition/index.js";
import { saveEditionSnapshot } from "./lib/market-edition/snapshot.js";
import { recentEditionsText } from "./lib/market-edition/week-digest.js";
import { renderPdf } from "./lib/market-edition/edition-pdf.js";
import { createBudgetedAskAI, ledgerFile, resolveCaps } from "./lib/token-budget.js";
import { createPacedAskAI, paceFromEnv } from "./lib/ai-pacer.js";

// Daily and weekly are built by the market-edition pipeline (~6 AI calls) instead of the 17-vertical swarm
// (~100-170 calls), which ran the shared free-tier quotas dry. REPORT_ENGINE=swarm restores the swarm.
const REPORT_FREQS = new Set(['daily', 'weekly']);
const WEEK_DIGEST_HEADER = "THIS WEEK'S EDITIONS (already published; use them for themes and narrative, take figures only from the data above):";

/** The weekly review's extra prompt context: the week's edition titles and summaries, or '' when none. */
function weeklyContext() {
  const digest = recentEditionsText();
  return digest ? `${WEEK_DIGEST_HEADER}\n${digest}` : '';
}
import { waitForPublicAvailability } from "./lib/utils.js";
import { fetchPolicyPulse, fetchEconomicCalendar, fetchSentimentData } from "./lib/data-fetchers.js";

/**
 * [V16.1] Homepage Registration Bridge
 * Ensures generated institutional articles appear in both the static index and the Firestore feed.
 */
async function registerPostOnHomepage(fileName, result, frequency, env) {
  try {
    const today = new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Kolkata'}); // YYYY-MM-DD in IST
    const type = 'article';
    const category = 'Strategic Research';
    const publicDomain = (env && env.ASSET_DOMAIN) || "https://blogspro.in";
    
    // [V1.2] Frequency-Aware Pathing: Map to correct public folder
    const folder = (frequency === 'hourly' || frequency === 'daily') ? 'briefings' : 'articles';
    const indexDir = path.join(process.cwd(), folder, frequency);
    const publicUrl = `${publicDomain}/${folder}/${frequency}/${fileName}`;
    
    const title = result.title || `Institutional Strategic Pulse [${frequency.toUpperCase()}]`;
    const excerpt = result.excerpt || `Latest institutional strategic synthesis for the ${frequency} cycle. 2026-2027 Roadmap.`;

    // 1. Update Static Index (For loadHybridPosts)
    const indexPath = path.join(indexDir, 'index.json');
    if (!fs.existsSync(indexDir)) fs.mkdirSync(indexDir, { recursive: true });
    
    let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf-8')) : [];
    const record = { 
        title, 
        date: today, 
        timestamp: Date.now(), 
        excerpt, 
        fileName, 
        type: (frequency === 'hourly' || frequency === 'daily') ? 'briefing' : 'article', 
        frequency,
        liveNews: result.liveNews || null 
    };
    // Market editions (the 3-a-day briefings that replaced the hourly pulse) label their feed entries.
    if (result.edition) {
        record.edition = result.edition.id;
        record.stance = result.stance || null;
    }
    
    // Add to front, keep last 50 for hourly/daily, 20 for others
    const limit = (frequency === 'hourly' || frequency === 'daily') ? 50 : 20;
    
    // [V17.0] Metadata Enrichment: Include live news pulse and policy snippets in the index
    if (result.liveNews) {
        record.liveNews = result.liveNews;
    }
    
    index = [record, ...index.filter(i => i.fileName !== fileName)].slice(0, limit);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    console.log(`✅ [Dashboard] Static Index Updated: ${indexPath}`);

    // 2. Sync to Firestore 'posts' (For main homepage grid & admin dashboard)
    const docId = `swarm-${frequency}-${Date.now()}`;
    await syncToFirestore('posts', {
      id: docId,
      title,
      excerpt,
      content: result.final.replace(/<[^>]*>?/gm, ' ').slice(0, 1000), // snippet for search
      path: publicUrl,
      category,
      authorName: 'BlogsPro Institutional Hub',
      published: true,
      stage: 'published',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      frequency: frequency,
      isAI: true,
      views: 0
    }, env);
    console.log(`📡 [Dashboard] Post Registered in Firestore: posts/${docId}`);

  } catch (err) {
    console.warn(`⚠️ [Dashboard] Homepage registration failed:`, err.message);
    captureSwarmError(err, { stage: 'homepage_registration', fileName, frequency });
  }
}

async function runInstitutionalSwarm() {
  const start = Date.now();
  const frequency = process.argv.find(a => a.startsWith('--freq='))?.split('=')[1] || 'weekly';
  const type = process.argv.find(a => a.startsWith('--type='))?.split('=')[1] || 'article';
  const mode = process.argv.find(a => a.startsWith('--mode='))?.split('=')[1] || 'standard';
  const targetVerticalId = process.argv.find(a => a.startsWith('--vertical='))?.split('=')[1];
  const modelOverride = process.argv.find(a => a.startsWith('--model='))?.split('=')[1] || 'auto';
  const extended = process.argv.includes('--extended');
  const force = process.argv.includes('--force');
  const editionId = process.argv.find(a => a.startsWith('--edition='))?.split('=')[1];
  const id = process.env.SWARM_JOB_ID || `swarm-${frequency}-${Date.now()}`;
  const useReportEngine = REPORT_FREQS.has(frequency) && process.env.REPORT_ENGINE !== 'swarm';
  // Every edition-pipeline call goes through the token budget (run cap + rolling 24 h ledger), then the pacer, which
  // keeps calls under Groq's tokens-per-minute limit so they are not pushed onto capped fallback providers.
  const pacedAskAI = createPacedAskAI({ askAI, tokensPerMinute: paceFromEnv(process.env) });
  const budget = createBudgetedAskAI({ askAI: pacedAskAI, freq: frequency, file: ledgerFile(process.env), ...resolveCaps(frequency, process.env) });

  // 0. DETERMINISTIC PERIOD IDENTIFIER (V15.0 Idempotency)
  const calculatePeriodId = (freq) => {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    
    if (freq === 'hourly') return `H_${YYYY}-${MM}-${DD}_${String(now.getHours()).padStart(2, '0')}`;
    if (freq === 'daily')  return `D_${YYYY}-${MM}-${DD}`;
    if (freq === 'monthly') return `M_${YYYY}-${MM}`;
    if (freq === 'weekly') {
      // Simple ISO week calculation
      const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return `W_${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    }
    return `X_${Date.now()}`; // Fallback
  };
  const periodId = calculatePeriodId(frequency);

  // 0. INITIALIZE SENTRY (Node.js)
  initNodeSentry(process.env.SENTRY_DSN, frequency);
  logSwarmBreadcrumb(`Starting Institutional Batch: ${frequency}`, { id, extended });

  // 0.1 INITIALIZE AI FLEET (V16.0 Ecosystem Upgrade)
  console.log(`🔍 [AI-Balancer] Synchronizing Institutional AI Vault...`);
  const { ResourceManager } = await import("./lib/ai-service.js");
  await ResourceManager.init(process.env);
  
  // 0.2 IDEMPOTENCY GUARD (V15.1)
  if (!force) {
    console.log(`🛡️ [Guard] Checking status for [${frequency}] period [${periodId}]...`);
    const status = await checkPeriodStatus(frequency, periodId, process.env);
    if (status.status === 'SUCCESS') {
        console.log(`✅ [Guard] Period ${periodId} already completed successfully. Aborting Redundant Dispatch.`);
        process.exit(0);
    }
    if (status.status === 'ACTIVE') {
        console.warn(`🛑 [Guard] Period ${periodId} is currently ACTIVE (Job: ${status.jobId}). Prevention of concurrent run.`);
        process.exit(0);
    }
  } else {
    console.log(`⚠️ [Guard] FORCED generation active. Skipping idempotency checks.`);
  }

  // 0.3 INITIALIZE TRACE (Firestore)
  console.log(`📡 [Trace] Initializing Institutional Audit Log...`);
  await pushTelemetryLog("SWARM_START", { 
    frequency, 
    jobId: id, 
    periodId,
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
        // [V12.4] Hardened Institutional Pulse Bridge
        const productionHub = env.AUTH_PROXY_URL || "https://blogspro-auth.abhishek-dutta1996.workers.dev/telemetry";
        const masterSecret = env.INSTITUTIONAL_MASTER_SECRET;
        
        try {
          const res = await fetch(productionHub, { 
            ...options, 
            headers: { 
              ...options.headers, 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${masterSecret}`
            } 
          });
          if (res.ok) return res;
          else console.warn(`⚠️ [SwarmTele] Hub rejected pulse: ${res.status}`);
        } catch (e) { 
          return { json: async () => ({ status: 'hub-offline', error: e.message }), ok: true }; 
        }
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
            strategicLead: `GEOPOLITICAL_GENESIS: Initializing first ${frequency} research cycle.`,
            tome_type: "article",
            key: `snapshots/genesis_${frequency}_${Date.now()}.json`
        };
        await pushTelemetryLog("COLD_START", { frequency, jobId: id, periodId, status: "warn", message: "No snapshots found. Initializing genesis context." }, env);
    } else {
        semanticDigest = snapshots[0];
    }

    // [V17.0] Institutional News Priming for daily. Hourly market editions fetch their own headlines.
    let liveNews = { summary: "Pulse Baseline: Stable.", rbi: "Neutral.", sebi: "Neutral.", docs: [] };
    if (frequency === 'daily' && !useReportEngine) {
        try {
            console.log(`📡 [News-Priming] Activating NewsOrchestrator for ${frequency} cycle...`);
            const newsOrch = new NewsOrchestrator(env);
            const policyPulse = await fetchPolicyPulse();
            const universalNews = await newsOrch.fetchUniversalNews();
            
            liveNews = {
                ...policyPulse,
                summary: `${policyPulse.summary} | GLOBAL: ${universalNews}`
            };
            console.log(`✓ [News-Priming] Acquisition complete. Density: ${liveNews.summary.length} chars.`);
        } catch (e) {
            console.warn("⚠️ [News-Priming] News acquisition failed, using neutral baseline.", e.message);
        }
    }
    semanticDigest.liveNews = liveNews;

    console.log(`📊 [Swarm] Context Primed: [Snapshot: ${semanticDigest.timestamp}] [News: ${liveNews !== "Pulse Baseline: Stable." ? 'ACTIVE' : 'NEUTRAL'}]`);

    let result;
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
        const fragment = await executeSingleVerticalSwarm(vertical, 1, frequency, semanticDigest, historical, env, id, extended, modelOverride);

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
        result = await finalizeManuscript(fragments, consensusSummary, frequency, type, env, id, modelOverride);
        
        // Final PDF generation & Sync
        await pushTelemetryLog("TOME_ASSEMBLY", { jobId: id, frequency, periodId, status: "complete", message: "Institutional Masterpiece Assembled." }, env);
    } else if (frequency === 'hourly' || useReportEngine) {
        // --- 🗞️ MARKET EDITION: 08:00 / 16:00 / 22:00 IST briefings, plus the daily strategy and weekly review ---
        result = await generateMarketEdition({
            askAI: budget.askAI,
            env,
            editionId: frequency === 'hourly' ? editionId : frequency,
            extraContext: frequency === 'weekly' ? weeklyContext() : '',
        });
        const spent = budget.usage();
        console.log(`🪙 [Budget] ${frequency}: ~${spent.run} tokens this run in ${spent.calls} calls (${spent.refused} refused); ~${spent.day} in the last 24 h across runs`);
    } else {
        // --- 🧬 STANDARD/SERIAL MODE (Legacy) ---
        console.log(`🏃 [Standard-Mode] Running Sequential Institutional Swarm...`);

        // 3. EXECUTE SWARM (Aligning with exact 6-argument signature)
        result = await executeMultiAgentSwarm(
            frequency,       // 1. frequency
            semanticDigest,  // 2. semanticDigest
            historical,      // 3. historicalData
            type,            // 4. type
            env,             // 5. env
            id,              // 6. jobId
            modelOverride    // 7. modelOverride
        );
    }

    // 4. QUALITY ASSURANCE: Institutional Swarm Review
    // Market editions skip the swarm review: their view already comes from a persona board and their figures from live data.
    let auditStatus = result.edition ? "EDITION_BOARD" : "PENDING";
    if (!result.edition) {
      try {
        console.log(`🕵️ [Swarm] Initiating MiroFish Consensus Review [Freq: ${frequency}]...`);
        await runSwarmAudit(result.final, frequency, { targetVertical: targetVerticalId });
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
    }

    // 5. ARCHIVAL PHASE
    const fileName = `swarm-${frequency}-${Date.now()}.html`;
    const folder = (frequency === 'hourly' || frequency === 'daily') ? 'briefings' : 'articles';
    const outPath = path.join(process.cwd(), folder, frequency, fileName);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    
    // [V16.0] Templating Phase: Apply institutional branding
    const formattedDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
    const templateTitle = result.title || `Institutional Strategic Pulse [${frequency.toUpperCase()}]`;
    const templateExcerpt = result.excerpt || "Strategic research synthesis for the current institutional cycle.";
    
    let finalHtml;
    let pdfName = null;
    if (result.renderPage) {
        const publicBase = process.env.ASSET_DOMAIN || "https://blogspro.in";
        const pageUrl = `${publicBase}/${folder}/${frequency}/${fileName}`;
        finalHtml = result.renderPage(pageUrl);
        // PDF copy next to the page (EDITION_PDF=0 turns it off). The page links it only once the file exists.
        if (process.env.EDITION_PDF !== '0') {
            const candidate = fileName.replace(/\.html$/, '.pdf');
            const pdf = await renderPdf({
                html: finalHtml,
                outPath: path.join(path.dirname(outPath), candidate),
                label: `${result.edition.label} · ${templateTitle}`,
                env: process.env,
            });
            if (pdf.ok) {
                pdfName = candidate;
                finalHtml = result.renderPage(pageUrl, { pdfHref: pdfName });
                console.log(`📑 [PDF] Saved ${pdfName} (${Math.round(pdf.bytes / 1024)} KB)`);
            } else {
                console.warn(`⚠️ [PDF] Skipped: ${pdf.reason}`);
            }
        }
    } else if (frequency === 'hourly') {
        finalHtml = getTerminalV2Template({
            title: templateTitle,
            excerpt: templateExcerpt,
            content: result.final,
            dateLabel: formattedDate,
            freq: frequency,
            fileName,
            liveNews: result.liveNews || null
        });
    } else if (frequency === 'daily') {
        finalHtml = getBriefingTemplate({
            title: templateTitle,
            excerpt: templateExcerpt,
            content: result.final,
            dateLabel: formattedDate,
            freq: frequency,
            fileName,
            liveNews: result.liveNews || null
        });
    } else {
        finalHtml = getBaseTemplate({
            title: templateTitle,
            excerpt: templateExcerpt,
            content: result.final,
            dateLabel: formattedDate,
            freq: frequency,
            fileName,
            rel: "../../"
        });
    }

    // Inject audit status into a meta tag.
    if (finalHtml.includes('</head>')) {
        finalHtml = finalHtml.replace('</head>', `<meta name="swarm-status" content="${auditStatus}">\n</head>`);
    }

    fs.writeFileSync(outPath, finalHtml);
    console.log(`💾 [Swarm] Archive Phase: Saved locally to ${outPath} [Status: ${auditStatus}]`);

    // [V17.0] Institutional Hydration Bridge: Save full JSON manifest for frontend dynamic sections
    const jsonPath = outPath.replace('.html', '.json');
    const manifest = {
        id,
        frequency,
        title: templateTitle,
        excerpt: templateExcerpt,
        date: formattedDate,
        auditStatus,
        wordCount: result.wordCount,
        metadata: result.liveNews || {},
        content: result.final,
        ...(pdfName ? { pdf: pdfName } : {})
    };
    fs.writeFileSync(jsonPath, JSON.stringify(manifest, null, 2));
    console.log(`💾 [Swarm] Archive Phase: Saved JSON manifest to ${jsonPath}`);
    if (result.snapshot) {
        const snapshotFile = saveEditionSnapshot(result.snapshot, fileName.replace(/\.html$/, ''));
        if (snapshotFile) console.log(`💾 [Edition] Snapshot (raw replies + data, not published) saved to ${snapshotFile}`);
    }

    // --- 🌍 GITHUB PAGES SYNCHRONIZATION: Sovereign Origin Push ---
    const ghToken = process.env.GH_TOKEN || process.env.GH_PAT;
    let ghOwner = process.env.GH_OWNER || "abhishekdutta18";
    let ghRepo = process.env.GH_REPO || "blogspro";

    // [V1.2] Repo Normalization: Handle "owner/repo" in GH_REPO env
    if (ghRepo.includes('/')) {
        const parts = ghRepo.split('/');
        ghOwner = parts[0];
        ghRepo = parts[1];
    }

    // --- 🌍 HOMEPAGE INTEGRATION: Public Feed Registration ---
    await registerPostOnHomepage(fileName, result, frequency, process.env);

    if (ghToken && !process.env.SKIP_GITHUB_PUSH) {
        try {
            const filesToPush = [
                { path: `${folder}/${frequency}/${fileName}`, localPath: outPath },
                { path: `${folder}/${frequency}/${fileName.replace('.html', '.json')}`, localPath: outPath.replace('.html', '.json') },
                { path: `${folder}/${frequency}/index.json`, localPath: path.join(process.cwd(), folder, frequency, 'index.json') }
            ];
            
            console.log(`📡 [GitHub] Initiating Sovereign Push for ${frequency} cycle [Folder: ${folder}]...`);
            await pushMultipleToGitHub(filesToPush, `institutional: archival for ${frequency} pulse [${id}]`, ghOwner, ghRepo, ghToken);
            console.log(`✅ [GitHub] Sovereign Sync Successful. manuscript is live on GitHub Pages.`);
        } catch (ghErr) {
            console.warn(`⚠️ [GitHub] Sovereign Sync Failed (Non-Fatal):`, ghErr.message);
            captureSwarmError(ghErr, { stage: 'github_archival', frequency, fileName });
        }
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

    // --- 🌍 HOMEPAGE INTEGRATION: Public Feed Registration ---
    // (Moved before GitHub Push)

    // --- 📢 DISPATCH PHASE: Automated Production Release ---
    try {
        console.log(`📢 [Dispatch] Initiating Institutional Release Cascade...`);
        const env = process.env;

        // 1. Telegram Dispatch
        const publicDomain = env.ASSET_DOMAIN || "https://blogspro.in";
        const folder = (frequency === 'hourly' || frequency === 'daily') ? 'briefings' : 'articles';
        const outPath = path.join(process.cwd(), folder, frequency, fileName);
        const publicUrl = `${publicDomain}/${folder}/${frequency}/${fileName}`;

        const telegramSummary = {
            title: result.title || `Institutional Strategic Pulse [${frequency.toUpperCase()}]`,
            abstract: result.excerpt || "Strategic research synthesis for the current institutional cycle.",
            wordCount: result.wordCount || 0,
            frequency,
            url: publicUrl
        };

        // [V17.5] Thinking Refiner: Polish the Telegram alert for institutional impact.
        // Market editions skip it: their title and summary were already written for this edition, and the
        // extra call only spent provider credit to rephrase them.
        if (!result.edition) {
          try {
            console.log("🧠 [Thinking] Refining Strategic Alert for institutional impact...");
            const refinerPrompt = `
<thinking>
Analyze the current ${frequency} manuscript summary:
TITLE: ${telegramSummary.title}
ABSTRACT: ${telegramSummary.abstract}

Constraints:
1. Sharp, cynical, data-driven headlines.
2. REMOVE ALL "BlogsPro" references.
3. High institutional density.
4. Professional, cold, authoritative tone.
</thinking>

Provide the final refined output in JSON format:
{
  "title": "A sharp, institutional headline",
  "abstract": "A data-dense one-sentence summary"
}
            `;
            const refinedRaw = await askAI(refinerPrompt, { role: 'edit', env, model: 'node-editor' });
            const refinedMatch = refinedRaw.match(/\{[\s\S]*\}/);
            if (refinedMatch) {
                const refined = JSON.parse(refinedMatch[0]);
                if (refined.title) telegramSummary.title = refined.title;
                if (refined.abstract) telegramSummary.abstract = refined.abstract;
                
                // Scrub breadcrumbs from final summary
                telegramSummary.title = telegramSummary.title.replace(/```(html|json)?/gi, '').replace(/```/g, '').trim();
                telegramSummary.abstract = telegramSummary.abstract.replace(/```(html|json)?/gi, '').replace(/```/g, '').trim();

                console.log("✅ [Thinking] Refinement Successful.");
            }
        } catch (e) {
            console.warn("⚠️ [Thinking] Refinement failed, using original summary.", e.message);
        }
        }

        // [V22.1] Non-blocking availability check — dispatch Telegram regardless of CDN propagation
        // The URL is always valid; GitHub Pages just needs time to propagate.
        const isLive = await waitForPublicAvailability(telegramSummary.url);
        if (!isLive) {
          console.warn(`⚠️ [Dispatch] URL not yet live after timeout, dispatching Telegram anyway: ${telegramSummary.url}`);
        }
        await dispatchTelegramAlert(telegramSummary, env);
        console.log(`💎 [Dispatch] Telegram Strategic Alert Sent.`);

        // 2. Newsletter Dispatch (Consolidated Bridge).
        // Market editions are not emailed: three a day would flood subscribers, and an edition body's charts
        // depend on page CSS that an email does not carry, so its bar charts would arrive empty.
        if (result.edition) {
            // Also skipped for the daily strategy and weekly review, which use the same chart markup.
            console.log(`📭 [Newsletter] Skipped for edition-pipeline pieces (${result.edition.id}): web and Telegram only.`);
        } else {
            await pushSovereignNewsletter(`BlogsPro Institutional: ${result.title}`, result.final, process.env);
        }
      } catch (dispatchErr) {
        console.warn(`⚠️ [Dispatch] Release Cascade Encountered Non-Fatal Error:`, dispatchErr.message);
        captureSwarmError(dispatchErr, { stage: 'dispatch_cascade', jobId: id });
    }
    await pushTelemetryLog("SWARM_COMPLETE", { 
        frequency, 
        jobId: id, 
        periodId,
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
        periodId: calculatePeriodId(fallbackFreq),
        status: "error", 
        message: `Pipeline Critical Failure: ${error.message}`
    }, process.env);
    await captureSwarmError(error, { stage: 'pipeline_critical', frequency: fallbackFreq });
    await flushSentry();
    process.exit(1);
  }
}

runInstitutionalSwarm();
