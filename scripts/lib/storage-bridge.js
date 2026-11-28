/**
 * storage-bridge.js — persistence for the swarm pipeline and the Cloudflare workers.
 *
 *   Documents (posts, telemetry, settings, audits) → BlogsPro API on the VPS   (vps-store.js)
 *   Files (manuscripts, PDFs, fragments, snapshots) → VPS disk under MEDIA_DIR (media-store.js)
 *   Briefing index                                  → Cloudflare KV, else the local checkout
 *   Archival commits                                → GitHub Contents API
 *
 * Firebase, Firestore, Google Cloud Storage and Google Drive were removed: the blogspro-ai
 * Google project has billing switched off, and every one of those calls was failing.
 */
import path from 'node:path';
import { getDocument, listDocuments, saveDocument } from './vps-store.js';
import { saveFile, readJson, readText, listKeys } from './media-store.js';
import { putFileWithRetry } from './github-contents.js';

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

/** Runs a run-state check longer than this is treated as finished (stale lock). */
const ACTIVE_RUN_WINDOW_MS = 2 * 60 * 60 * 1000;
const TRACE_BATCH_SIZE = 10;
const TRACE_FLUSH_MS = 5000;
const HISTORICAL_KEY = 'snapshots/historical/market_baseline.json';

/**
 * Lazy-loader for node:fs to prevent Top-Level Await deployment blockers in Workers.
 */
async function getFs() {
    if (!isNode) return null;
    try {
        const { default: fsMod } = await import('node:fs');
        return fsMod;
    } catch (e) {
        return null;
    }
}

/**
 * Saves `data` as a document. With data.id or data.docId it merges into that document
 * (idempotent upsert); otherwise a new document is created.
 * @returns {Promise<boolean>} true when stored
 */
async function saveRecord(collectionName, data, env, id = data?.id ?? data?.docId) {
  const stored = await saveDocument(collectionName, data, env, id);
  if (stored) console.log(`📡 [Store] Saved ${collectionName}/${stored.id}`);
  return Boolean(stored);
}

/** Global swarm policy from site/settings; defaults when the store is unavailable. */
export async function getInstitutionalSettings(env) {
  const settings = await getDocument('site', 'settings', env);
  if (!settings) return { geminiEnabled: true };
  console.log(`📡 [Settings] Global Policy Loaded. Gemini Enabled: ${settings.geminiEnabled ?? true}`);
  return { geminiEnabled: settings.geminiEnabled ?? true, imagesEnabled: settings.imagesEnabled ?? true };
}

/**
 * Swarm idempotency check: has this frequency/period already completed, or is a run
 * for it still in progress (started within the last two hours)?
 * @returns {Promise<{status: 'SUCCESS'|'ACTIVE'|'IDLE'|'unknown', jobId?: string}>}
 */
async function checkPeriodStatus(frequency, periodId, env) {
  const logs = await listDocuments('telemetry_logs', { where: { periodId, frequency }, orderBy: 'timestamp desc', limit: 20 }, env);
  if (logs.some(log => log.event === 'SWARM_COMPLETE' && log.status === 'success')) return { status: 'SUCCESS' };
  const latestStart = logs.find(log => log.event === 'SWARM_START');
  if (latestStart && Date.now() - new Date(latestStart.timestamp).getTime() < ACTIVE_RUN_WINDOW_MS) {
    return { status: 'ACTIVE', jobId: latestStart.jobId };
  }
  return { status: 'IDLE' };
}

/** Writes a briefing into the local checkout (briefings/<frequency>/<file>). */
async function saveBriefing(fileName, content, frequency, env = null) {
  const key = `briefings/${frequency}/${fileName}`;
  const fs = await getFs();
  if (!fs) {
    console.warn(`⚠️ [StorageBridge] No disk in this runtime; briefing ${key} not saved.`);
    return key;
  }
  const targetDir = path.join(process.cwd(), 'briefings', frequency);
  fs.mkdirSync(targetDir, { recursive: true });
  const fullPath = path.join(targetDir, fileName);
  fs.writeFileSync(fullPath, content);
  console.log(`💾 [Local] Saved: ${fullPath}`);
  return fullPath;
}

// --------------------------------------------------
// KV LOCKING: BlogsPro Multi-Node Mutex
// --------------------------------------------------
async function acquireLock(lockKey, env, ttl = 300) {
  if (!env || !env.KV) return true;
  try {
    const existing = await env.KV.get(`lock:${lockKey}`);
    if (existing) return false;
    await env.KV.put(`lock:${lockKey}`, "LOCKED", { expirationTtl: ttl });
    return true;
  } catch (e) {
    console.warn("⚠️ [Cloudflare KV Fallback] Lock failed, bypassing...", e.message);
    return true; // Bypass lock on KV failure
  }
}

async function releaseLock(lockKey, env) {
  if (!env || !env.KV) return;
  try {
    await env.KV.delete(`lock:${lockKey}`);
  } catch (e) {
    console.warn("⚠️ [Cloudflare KV Fallback] Release failed...", e.message);
  }
}

async function updateIndex(entry, frequency, env = null) {
  const key = `briefings/${frequency}/index.json`;
  const lockKey = `index-${frequency}`;
  
  // V7.1: Mutex Protection for Institutional Index
  let retries = 5;
  while (!(await acquireLock(lockKey, env)) && retries > 0) {
    await new Promise(r => setTimeout(r, 1000));
    retries--;
  }

  try {
    let kvSuccess = false;
    if (env && env.KV) {
      try {
        console.log(`📇 [KV] Updating index: ${key}`);
        let index = await env.KV.get(key, { type: 'json' }) || [];
        index.unshift(entry);
        await env.KV.put(key, JSON.stringify(index.slice(0, 50)));
        kvSuccess = true;
      } catch (kvError) {
        console.warn("⚠️ [Cloudflare KV Fallback] Index update failed. Falling back to Local FS.", kvError.message);
      }
    }
    
    if (!kvSuccess && isNode) {
      const fs = await getFs();
      if (fs && path) {
        let rootDir = process.cwd();
        
        const targetDir = path.join(rootDir, "briefings", frequency);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        const indexPath = path.join(targetDir, "index.json");
        let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf-8")) : [];
        
        // Deduplicate by ID
        const existingIds = new Set(index.map(e => e.id));
        if (!existingIds.has(entry.id)) {
            index.unshift(entry);
            fs.writeFileSync(indexPath, JSON.stringify(index.slice(0, 50), null, 2));
            console.log(`💾 [Local-Index] Successfully registered institutional pulse: ${entry.id}`);
        }
      }
    }
  } finally {
    await releaseLock(lockKey, env);
  }
}

async function getIndex(frequency, env = null) {
  const key = `briefings/${frequency}/index.json`;
  if (env && env.KV) {
    return await env.KV.get(key, { type: 'json' }) || [];
  } else if (isNode) {
    const fs = await getFs();
    if (fs && path) {
      const rootDir = process.cwd();
      const indexPath = path.join(rootDir, "briefings", frequency, "index.json");
      if (fs.existsSync(indexPath)) {
          return JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      }
    }
  }
  return [];
}

/** Stores a market snapshot file and points latest_snapshots/latest_<frequency> at it. */
async function saveSnapshot(data, frequency = 'daily', env, filename = null) {
  const isBinary = data instanceof Uint8Array || data instanceof ArrayBuffer;
  const extension = isBinary ? 'yjs' : 'json';
  const timestamp = Date.now();
  const key = `snapshots/${frequency}/${filename || `snapshot-${timestamp}.${extension}`}`;
  const lockKey = `snapshot-${frequency}`;

  let retries = 3;
  while (!(await acquireLock(lockKey, env)) && retries > 0) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    retries--;
  }
  try {
    if (!(await saveFile(key, data, env))) return null;
    await saveRecord('latest_snapshots', { id: `latest_${frequency}`, frequency, key, timestamp, type: extension }, env);
    return key;
  } finally {
    await releaseLock(lockKey, env);
  }
}

/** The latest snapshot for a frequency, as a one-element array (or [] when none). */
async function getRecentSnapshots(frequency, limit = 1, env) {
  const pointer = await getDocument('latest_snapshots', `latest_${frequency}`, env);
  if (!pointer?.key) return [];
  const snapshot = await readJson(pointer.key, env);
  return snapshot ? [snapshot] : [];
}

async function pushHistoricalData(data, env) {
  return saveFile(HISTORICAL_KEY, data, env);
}

async function getHistoricalData(env) {
  return readJson(HISTORICAL_KEY, env);
}

async function pushTelemetryLog(event, metadata = {}, env) {
    return await pushSovereignTrace(event, metadata, env);
}

let traceBuffer = [];
let traceTimer = null;

/** Writes buffered trace events to telemetry_logs, one document per event. */
async function flushTraces(env) {
  if (traceBuffer.length === 0) return;
  const events = traceBuffer;
  traceBuffer = [];
  if (traceTimer) clearTimeout(traceTimer);
  traceTimer = null;

  console.log(`📡 [Trace] Flushing ${events.length} batched events to the telemetry log...`);
  await Promise.all(events.map(meta => saveDocument('telemetry_logs', {
    ...meta,
    frequency: meta.frequency || 'unknown',
    jobId: meta.jobId || 'local',
    status: meta.status || 'info',
    message: meta.message || ''
  }, env, null)));
}

/**
 * [V12.3] pushSovereignTrace
 * -------------------------
 * High-fidelity institutional audit logger with batch buffering.
 */
export async function pushSovereignTrace(event, metadata = {}, env) {
  if (!env) return;
  
  // Add to buffer
  traceBuffer.push({ event, ...metadata, timestamp: new Date().toISOString() });

  // Flush strategy: 10 events or 5 seconds
  if (traceBuffer.length >= 10) {
      flushTraces(env);
  } else if (!traceTimer) {
      traceTimer = setTimeout(() => flushTraces(env), 5000);
  }

  // 2. Immediate Bridge to Auth Proxy (Critical Pulse only)
  if (metadata.status === 'error' || metadata.status === 'fatal' || event === 'SWARM_COMPLETE') {
      const proxyHub = env.AUTH_PROXY_URL || "https://blogspro-auth.abhishek-dutta1996.workers.dev/telemetry";
      const masterSecret = env.INSTITUTIONAL_MASTER_SECRET;
      
      if (masterSecret) {
        try {
          fetch(proxyHub, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${masterSecret}` },
            body: JSON.stringify({ event, ...metadata, buffered: false })
          }).catch(() => {});
        } catch (e) {}
      }
  }
}

/** Audits waiting for human approval, newest first. */
export async function getPendingAudits(env) {
  const audits = await listDocuments('pending_audits', { where: { status: 'PENDING' } }, env);
  return [...audits].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Audit ids come from the dashboard and Telegram callback_data. Allow only plain id
// characters, so a crafted id can never address a document outside pending_audits.
const AUDIT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Records a reviewer's decision on pending_audits/<id>. Returns false for invalid ids. */
export async function updateAuditStatus(id, status, feedback = '', env) {
  if (typeof id !== 'string' || !AUDIT_ID_PATTERN.test(id)) {
    console.error('⚠️ [StorageBridge] updateAuditStatus: rejected invalid audit id');
    return false;
  }
  return saveRecord('pending_audits', { status, feedback: String(feedback ?? ''), reviewedAt: new Date().toISOString() }, env, id);
}

/** Saves a pipeline artifact (manuscript, PDF, research fragment) to the media store. */
async function saveToCloudBucket(fileName, content, env) {
  const key = await saveFile(fileName, content, env);
  if (key) console.log(`✅ [MediaStore] Saved: ${fileName}`);
  return key;
}

/** All research fragments saved for a job under sectors/<jobId>/, parsed as JSON. */
async function loadFromCloudBucket(jobId, env) {
  if (!jobId) return [];
  const keys = await listKeys(`sectors/${jobId}/`, env);
  const fragments = await Promise.all(keys.map(key => readJson(key, env)));
  return fragments.filter(fragment => fragment !== null);
}

/** Manuscript files, shaped like the bucket listing callers used ({ name }). */
async function listAllManuscripts(env) {
  const keys = await listKeys('manuscripts/', env);
  return keys.map(name => ({ name }));
}

async function getCloudMedia(fileName, env) {
  return readText(fileName, env);
}

/**
 * [V12.7] pushSovereignNewsletter
 * ----------------------------
 * Centralized newsletter dispatch for institutional masterpieces.
 */
async function pushSovereignNewsletter(subject, html, env) {
  const newsletterUrl = env.NEWSLETTER_WORKER_URL || "https://newsletter.blogspro.in";
  const secret = env.NEWSLETTER_SECRET;

  if (!newsletterUrl || !secret) {
    console.warn("⚠️ [Newsletter] NEWSLETTER_WORKER_URL or SECRET missing. Skipping dispatch.");
    return false;
  }

  try {
    console.log(`💎 [Newsletter] Dispatching Masterpiece: ${subject}`);
    const res = await fetch(newsletterUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        html,
        secret,
        from: env.NEWSLETTER_FROM || "BlogsPro Institutional Hub"
      })
    });

    if (res.ok) {
      console.log(`✅ [Newsletter] Distribution Completed Successfully.`);
      return true;
    } else {
      console.warn(`⚠️ [Newsletter] Worker rejected dispatch: ${res.status}`);
      return false;
    }
  } catch (err) {
    console.error(`❌ [Newsletter] Connection failed:`, err.message);
    return false;
  }
}

/**
 * 🛰️ [V15.7] Sovereign GitHub Sync
 * Commits one or more files directly to the repository using the GH Contents API.
 */
async function pushMultipleToGitHub(filesToPush, commitMsg, owner, repo, token, branch = 'main') {
    const fs = await getFs();
    if (!fs) throw new Error("FS unavailable for GitHub push");

    for (const { path: ghPath, localPath } of filesToPush) {
        const content = fs.readFileSync(localPath, 'utf8');
        // Retries stale-ref (409) and concurrent-create (422) conflicts with backoff.
        await putFileWithRetry({
            owner,
            repo,
            token,
            branch,
            path: ghPath,
            contentBase64: Buffer.from(content).toString('base64'),
            message: commitMsg,
        });
        console.log(`✓ [GitHub] Synchronized: ${ghPath}`);
    }
}

export {
  saveRecord,
  saveBriefing,
  updateIndex,
  getIndex,
  saveSnapshot,
  getRecentSnapshots,
  pushHistoricalData,
  getHistoricalData,
  pushTelemetryLog,
  saveToCloudBucket,
  loadFromCloudBucket,
  listAllManuscripts,
  getCloudMedia,
  checkPeriodStatus,
  pushSovereignNewsletter,
  pushMultipleToGitHub
};
