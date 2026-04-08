import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeInstitutionalPem } from './sanitizer.js';
const __dirname = (typeof process !== 'undefined' && import.meta && import.meta.url && import.meta.url.startsWith('file:'))
  ? path.dirname(fileURLToPath(import.meta.url))
  : "";
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
const isWorker = typeof caches !== 'undefined' && typeof Response !== 'undefined';
let fs = null;
if (isNode) {
    // Synchronous-like resolution for Node environment to prevent race conditions
    try {
        const { default: fsMod } = await import('node:fs');
        fs = fsMod;
    } catch (e) {
        // Fallback for older environments
    }
}

// --------------------------------------------------
// GOOGLE OAUTH BRIDGE : CF Workers
// --------------------------------------------------
async function getGoogleAccessToken(env) {
    let sa = null;

    // V9.1: Robust Absolute Path Resolution for Institutional Credentials
    if (isNode && fs) {
        try {
            // Find root dir regardless of execution context
            const rootDir = process.cwd();
            const possiblePaths = [
                path.join(rootDir, 'knowledge', 'firebase-service-account.json'),
                path.join(rootDir, '..', 'knowledge', 'firebase-service-account.json'),
                path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'knowledge', 'firebase-service-account.json')
            ];

            for (const saPath of possiblePaths) {
                if (fs.existsSync(saPath)) {
                    sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
                    break;
                }
            }
        } catch (e) {
            console.warn("⚠️ [StorageBridge] Failed to load sa-file:", e.message);
        }
    }

    // [V9.3] Institutional Priority Logic: Match firebase-service.js stability
    const saFile = path.join(process.cwd(), 'knowledge', 'firebase-service-account.json');
    if (fs.existsSync(saFile)) {
        try {
            sa = JSON.parse(fs.readFileSync(saFile, 'utf8'));
            // 💧 HYDRATE & HARDEN (V5.4.4)
            if (sa.private_key) sa.private_key = normalizeInstitutionalPem(sa.private_key);
            if (!sa.client_email && sa.project_id) {
                sa.client_email = `firebase-adminsdk-q0p9j@${sa.project_id}.iam.gserviceaccount.com`;
            }
            console.log(`🛡️ [StorageBridge] Keyfile Hydrated: ${sa.client_email}`);
        } catch (e) {
            console.warn("⚠️ [StorageBridge] Keyfile Load Fail:", e.message);
        }
    }

    if (!sa && env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            // [V9.3.1] Brute-force sanitize for CI/CD environments
            let saString = String(env.FIREBASE_SERVICE_ACCOUNT).trim();
            saString = saString.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
            const firstBrace = saString.indexOf('{');
            const lastBrace = saString.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                saString = saString.substring(firstBrace, lastBrace + 1);
            }
            sa = JSON.parse(saString);
            // 💧 HYDRATE & HARDEN (V5.4.4)
            if (sa.private_key) sa.private_key = normalizeInstitutionalPem(sa.private_key);
            if (!sa.client_email && sa.project_id) {
                sa.client_email = `firebase-adminsdk-q0p9j@${sa.project_id}.iam.gserviceaccount.com`;
            }
        } catch (e) {
            console.warn("⚠️ [StorageBridge] Env-SA Parse Fail:", e.message);
        }
    }

    if (!sa) {
        console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT secret missing. Falling back to public REST.");
        return null;
    }

    try {
        const now = Math.floor(Date.now() / 1000);
        const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({
            iss: sa.client_email,
            scope: "https://www.googleapis.com/auth/devstorage.full_control https://www.googleapis.com/auth/datastore",
            aud: "https://oauth2.googleapis.com/token",
            exp: now + 3600,
            iat: now
        })).toString('base64url');
        const message = `${header}.${payload}`;
        
        // [V9.3.2] Institutional PEM Restoration: Standard PKCS8 DER extraction
        const base64Der = sa.private_key
            .replace(/-----BEGIN PRIVATE KEY-----/g, "")
            .replace(/-----END PRIVATE KEY-----/g, "")
            .replace(/\s+/g, "");
             
        const binaryDer = Buffer.from(base64Der, 'base64');
        const key = await crypto.subtle.importKey(
            "pkcs8", 
            binaryDer,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false, 
            ["sign"]
        );
        const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(message));
        
        // Robust Base64URL encoding (Node standard)
        const encodedSig = Buffer.from(signature).toString('base64url');
        const jwt = `${message}.${encodedSig}`;
        
        const res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
        });
        const data = await res.json();
        return data.access_token;
    } catch (e) {
        console.error("🔌 Google OAuth Exchange Fail:", e.message);
        return null;
    }
}

// Firestore REST Client: $0 Managed State Layer
async function syncToFirestore(collectionName, data, env) {
  if (!env || !env.FIREBASE_PROJECT_ID) {
    console.warn("⚠️ FIREBASE_PROJECT_ID not set. Skipping Firestore sync.");
    return false;
  }

  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionName}`;
  
  // Transform flat JS object to Firestore-compatible fields JSON
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'number') fields[key] = { doubleValue: value };
    else if (typeof value === 'boolean') fields[key] = { booleanValue: value };
    else fields[key] = { stringValue: String(value) };
  }
  try {
    const headers = { "Content-Type": "application/json" };
    const token = await getGoogleAccessToken(env);
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ fields })
    });
    if (!res.ok) {
      console.error(`❌ Firestore Sync Fail (${collectionName}):`, await res.text());
      return false;
    }
    console.log(`📡 [Firestore] Successfully synced record to '${collectionName}'`);
    return true;
  } catch (e) {
    console.error(`⚠️ Firestore Connection Error:`, e.message);
    return false;
  }
}

/**
 * 📡 [V8.4] Institutional Consensus Polling Bridge
 * Fetches a specific document from Firestore via REST API.
 */
export async function getFirestoreDoc(collectionName, docId, env) {
    if (!env || !env.FIREBASE_PROJECT_ID) {
        console.warn("⚠️ FIREBASE_PROJECT_ID not set. Skipping Firestore fetch.");
        return null;
    }

    const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionName}/${docId}`;

    try {
        const headers = { "Content-Type": "application/json" };
        const token = await getGoogleAccessToken(env);
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(url, { method: "GET", headers: headers });
        if (!res.ok) {
            if (res.status !== 404) console.error(`❌ Firestore Fetch Fail (${docId}):`, await res.text());
            return null;
        }

        const data = await res.json();
        const result = {};
        if (data.fields) {
            for (const [key, value] of Object.entries(data.fields)) {
                if (value.stringValue !== undefined) result[key] = value.stringValue;
                else if (value.booleanValue !== undefined) result[key] = value.booleanValue;
                else if (value.integerValue !== undefined) result[key] = parseInt(value.integerValue);
                else if (value.doubleValue !== undefined) result[key] = parseFloat(value.doubleValue);
            }
        }
        return result;
    } catch (e) {
        console.error(`⚠️ Firestore Fetch Connection Error:`, e.message);
        return null;
    }
}

/**
 * Storage Bridge: BlogsPro Terminal
 * Abstracts file operations between Local (FS) and Serverless (Cloudflare R2/KV).
 */

async function saveBriefing(fileName, content, frequency, env = null) {
  const key = `briefings/${frequency}/${fileName}`;
  if (env && env.FIREBASE_STORAGE_BUCKET) {
    console.log(`📠 [Firebase Storage] Uploading: ${key}`);
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${env.FIREBASE_STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(key)}`;
    try {
      const headers = { "Content-Type": "text/html" };
      const token = await getGoogleAccessToken(env);
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(url, { method: "POST", headers, body: content });
      if (!res.ok) console.warn(`⚠️ Firebase Storage REST Fail: ${await res.text()}`);
      return key;
    } catch (e) {
      console.error(`🔌 Firebase Storage Connection Error:`, e.message);
    }
  }
  if (fs && path && typeof process !== 'undefined') {
    const rootDir = process.cwd();
    const targetDir = path.join(rootDir, "briefings", frequency);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const fullPath = path.join(targetDir, fileName);
    fs.writeFileSync(fullPath, content);
    console.log(`💾 [Local] Saved: ${fullPath}`);
    return fullPath;
  }
  return key;
}

// --------------------------------------------------
// KV LOCKING: BlogsPro Multi-Node Mutex
// --------------------------------------------------
async function acquireLock(lockKey, env, ttl = 300) {
  if (!env || !env.KV) return true;
  const existing = await env.KV.get(`lock:${lockKey}`);
  if (existing) return false;
  await env.KV.put(`lock:${lockKey}`, "LOCKED", { expirationTtl: ttl });
  return true;
}

async function releaseLock(lockKey, env) {
  if (!env || !env.KV) return;
  await env.KV.delete(`lock:${lockKey}`);
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
    if (env && env.KV) {
      console.log(`📇 [KV] Updating index: ${key}`);
      let index = await env.KV.get(key, { type: 'json' }) || [];
      index.unshift(entry);
      await env.KV.put(key, JSON.stringify(index.slice(0, 50)));
    } else if (fs && path) {
      const rootDir = process.cwd();
      const targetDir = path.join(rootDir, "briefings", frequency);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const indexPath = path.join(targetDir, "index.json");
      let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf-8")) : [];
      index.unshift(entry);
      fs.writeFileSync(indexPath, JSON.stringify(index.slice(0, 50), null, 2));
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
    const rootDir = process.cwd();
    const indexPath = path.join(rootDir, "briefings", frequency, "index.json");
    if (fs.existsSync(indexPath)) {
        return JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    }
  }
  return [];
}

async function saveSnapshot(data, frequency = 'daily', env, filename = null) {
  if (!env || !env.FIREBASE_STORAGE_BUCKET) {
    console.warn("⚠️ [StorageBridge] Missing FIREBASE_STORAGE_BUCKET. Snapshot skipped.");
    return;
  }
  const timestamp = Date.now();
  const isBinary = data instanceof Uint8Array || data instanceof ArrayBuffer;
  const extension = isBinary ? 'yjs' : 'json';
  const finalFilename = filename || `snapshot-${timestamp}.${extension}`;
  const key = `snapshots/${frequency}/${finalFilename}`;
  const lockKey = `snapshot-${frequency}`;
  
  // V7.1: Mutex Protection for Institutional Snapshots
  let retries = 3;
  while (!(await acquireLock(lockKey, env)) && retries > 0) {
    await new Promise(r => setTimeout(r, 1000));
    retries--;
  }

  try {
    const contentType = isBinary ? 'application/octet-stream' : 'application/json';
    const body = isBinary ? data : JSON.stringify(data);
    
    console.log(`📸 [StorageBridge] Saving ${frequency} snapshot (${extension}) to Firebase: ${key}`);
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${env.FIREBASE_STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(key)}`;
    
    const headers = { "Content-Type": contentType };
    const token = await getGoogleAccessToken(env);
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, { method: "POST", headers, body });
    if (!res.ok) throw new Error(`Firebase Storage Error: ${await res.text()}`);
    await syncToFirestore(`latest_snapshots`, { frequency, key, timestamp, type: extension, id: `latest_${frequency}` }, env);
    return key;
  } catch (e) {
    console.error(`⚠️ [StorageBridge] Snapshot Sync Fail:`, e.message);
    return null;
  }
}

async function getRecentSnapshots(frequency, limit = 1, env) {
  if (!env || !env.FIREBASE_PROJECT_ID || !env.FIREBASE_STORAGE_BUCKET) return [];
  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/latest_snapshots/latest_${frequency}`;
    const headers = { "Content-Type": "application/json" };
    const token = await getGoogleAccessToken(env);
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(firestoreUrl, { headers });
    if (!res.ok) {
      console.warn(`⚠️ [StorageBridge] Firestore pointer not found for ${frequency}:`, await res.text());
      return [];
    }
    const meta = await res.json();
    if (!meta.fields || !meta.fields.key) return [];
    const storageKey = meta.fields.key.stringValue;
    const storageUrl = `https://storage.googleapis.com/storage/v1/b/${env.FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(storageKey)}?alt=media`;
    const snapshotRes = await fetch(storageUrl, { headers });
    if (!snapshotRes.ok) {
      console.error(`🔌 [StorageBridge] Storage media retrieval failed:`, await snapshotRes.text());
      return [];
    }
    return [await snapshotRes.json()];
  } catch (e) {
    console.error(`⚠️ [StorageBridge] getRecentSnapshots Fail:`, e.message);
    return [];
  }
}

async function pushHistoricalData(data, env) {
  if (!env || !env.FIREBASE_STORAGE_BUCKET) return;
  const key = `snapshots/historical/market_baseline.json`;
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${env.FIREBASE_STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(key)}`;
  const headers = { "Content-Type": "application/json" };
  const token = await getGoogleAccessToken(env);
  if (token) headers["Authorization"] = `Bearer ${token}`;
  await fetch(url, { method: "POST", headers, body: JSON.stringify(data) });
}

async function getHistoricalData(env) {
  if (!env || !env.FIREBASE_STORAGE_BUCKET) return null;
  const key = `snapshots/historical/market_baseline.json`;
  try {
    const headers = {};
    const token = await getGoogleAccessToken(env);
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const storageUrl = `https://storage.googleapis.com/storage/v1/b/${env.FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(key)}?alt=media`;
    const res = await fetch(storageUrl, { headers });
    return res.ok ? await res.json() : null;
  } catch (e) {
    return null;
  }
}

async function pushTelemetryLog(event, metadata = {}, env) {
  if (!env || !env.FIREBASE_PROJECT_ID) return;
  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/telemetry_logs`;
    const headers = { "Content-Type": "application/json" };
    const token = await getGoogleAccessToken(env);
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const payload = {
      fields: {
        event: { stringValue: event },
        timestamp: { timestampValue: new Date().toISOString() },
        frequency: { stringValue: metadata.frequency || 'unknown' },
        jobId: { stringValue: metadata.jobId || 'local' },
        status: { stringValue: metadata.status || 'info' },
        latency: { integerValue: metadata.latency ? metadata.latency.toString() : '0' },
        message: { stringValue: metadata.message || '' },
        details: { stringValue: JSON.stringify(metadata.details || {}) }
      }
    };
    const res = await fetch(firestoreUrl, { method: "POST", headers, body: JSON.stringify(payload) });
    if (!res.ok) console.warn("⚠️ [Telemetry] Bridge Stalled:", await res.text());
  } catch (e) {
    console.warn("⚠️ [Telemetry] Failed to push trace:", e.message);
  }
}

export async function getPendingAuditsREST(env) {
  if (!env || !env.FIREBASE_PROJECT_ID) return [];
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/pending_audits`;
  
  try {
    const headers = { "Content-Type": "application/json" };
    const token = await getGoogleAccessToken(env);
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) {
      console.error("⚠️ [StorageBridge] Pending Audits REST fetch failed:", await res.text());
      return [];
    }
    const data = await res.json();
    if (!data.documents) return [];
    
    return data.documents.map(doc => {
      const id = doc.name.split('/').pop();
      const result = { id };
      for (const [key, value] of Object.entries(doc.fields)) {
        if (value.stringValue !== undefined) result[key] = value.stringValue;
        else if (value.integerValue !== undefined) result[key] = parseInt(value.integerValue);
        else if (value.doubleValue !== undefined) result[key] = parseFloat(value.doubleValue);
        else if (value.timestampValue !== undefined) result[key] = value.timestampValue;
        else if (value.booleanValue !== undefined) result[key] = value.booleanValue;
      }
      return result;
    }).filter(a => a.status === 'PENDING').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (e) {
    console.error("⚠️ [StorageBridge] getPendingAuditsREST Error:", e.message);
    return [];
  }
}

export async function updateAuditStatusREST(docId, status, feedback = "", env) {
  if (!env || !env.FIREBASE_PROJECT_ID) return;
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/pending_audits/${docId}?updateMask.fieldPaths=status&updateMask.fieldPaths=feedback&updateMask.fieldPaths=updatedAt`;
  
  try {
    const headers = { "Content-Type": "application/json" };
    const token = await getGoogleAccessToken(env);
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const payload = {
      fields: {
        status: { stringValue: status },
        feedback: { stringValue: feedback },
        updatedAt: { timestampValue: new Date().toISOString() }
      }
    };

    const res = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(payload) });
    if (!res.ok) console.error(`❌ [StorageBridge] Update Audit REST Fail (${docId}):`, await res.text());
    else console.log(`✅ [HIL] Audit ${docId} updated to: ${status} via REST`);
  } catch (e) {
    console.error("⚠️ [StorageBridge] updateAuditStatusREST Error:", e.message);
  }
}

export {
  getGoogleAccessToken,
  syncToFirestore,
  saveBriefing,
  updateIndex,
  getIndex,
  saveSnapshot,
  getRecentSnapshots,
  pushHistoricalData,
  getHistoricalData,
  pushTelemetryLog
};
