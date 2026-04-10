import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeInstitutionalPem } from './sanitizer.js';
const __dirname = (typeof process !== 'undefined' && import.meta && import.meta.url && import.meta.url.startsWith('file:'))
  ? path.dirname(fileURLToPath(import.meta.url))
  : "";
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
const isWorker = typeof caches !== 'undefined' && typeof Response !== 'undefined';

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

            const fs = await getFs();
            for (const saPath of possiblePaths) {
                if (fs && fs.existsSync(saPath)) {
                    sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
                    break;
                }
            }
        } catch (e) {
            console.warn("⚠️ [StorageBridge] Failed to load sa-file:", e.message);
        }
    }

    // [V9.3] Institutional Priority Logic: Match firebase-service.js stability
    const fs = await getFs();
    if (fs && fs.existsSync(saFile)) {
        try {
            sa = JSON.parse(fs.readFileSync(saFile, 'utf8'));
            // 💧 HYDRATE & HARDEN (V5.4.4)
            if (sa.private_key) sa.private_key = normalizeInstitutionalPem(sa.private_key);
            if (!sa.client_email && sa.project_id) {
                sa.client_email = `firebase-adminsdk-fbsvc@${sa.project_id}.iam.gserviceaccount.com`;
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
                sa.client_email = `firebase-adminsdk-fbsvc@${sa.project_id}.iam.gserviceaccount.com`;
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
            scope: "https://www.googleapis.com/auth/devstorage.full_control https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/drive.file",
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
             
        // [V10.2] Node/Worker Compatibility Layer: Use globalThis.crypto for consistent Subtle access
        const cryptoBridge = globalThis.crypto || (isNode ? (await import('node:crypto')).webcrypto : null);
        if (!cryptoBridge || !cryptoBridge.subtle) throw new Error("WebCrypto API unavailable");

        let binaryDer;
        try {
            binaryDer = Buffer.from(base64Der, 'base64');
            // Check if binary looks valid (starts with 0x30 for ASN.1 Sequence)
            if (binaryDer[0] !== 0x30) throw new Error("Not a valid ASN.1 sequence");
        } catch (e) {
            if (isNode) {
                console.log("🛠️ [StorageBridge] WebCrypto rejection. Attempting Node-Native Self-Heal...");
                const { createPrivateKey } = await import('node:crypto');
                const nativeKey = createPrivateKey(sa.private_key);
                const pkcs8Pem = nativeKey.export({ type: 'pkcs8', format: 'pem' });
                const cleanBase64 = pkcs8Pem
                    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
                    .replace(/-----END PRIVATE KEY-----/g, "")
                    .replace(/\s+/g, "");
                binaryDer = Buffer.from(cleanBase64, 'base64');
            } else {
                throw e;
            }
        }

        const key = await cryptoBridge.subtle.importKey(
            "pkcs8", 
            binaryDer,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false, 
            ["sign"]
        );
        const signature = await cryptoBridge.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(message));
        
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
  const fs = await getFs();
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
    } else if (isNode) {
      const fs = await getFs();
      if (fs && path) {
        const rootDir = process.cwd();
        const targetDir = path.join(rootDir, "briefings", frequency);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        const indexPath = path.join(targetDir, "index.json");
        let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf-8")) : [];
        index.unshift(entry);
        fs.writeFileSync(indexPath, JSON.stringify(index.slice(0, 50), null, 2));
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
    return await pushSovereignTrace(event, metadata, env);
}

/**
 * [V12.3] pushSovereignTrace
 * -------------------------
 * High-fidelity institutional audit logger.
 */
export async function pushSovereignTrace(event, metadata = {}, env) {
  if (!env || !env.FIREBASE_PROJECT_ID) return;
  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/telemetry_logs`;
    const headers = { "Content-Type": "application/json" };
    const token = await getGoogleAccessToken(env);
    if (token) headers["Authorization"] = `Bearer ${token}`;
    
    // Normalize numeric values for Firestore REST API
    const latency = metadata.latency ? metadata.latency.toString() : '0';
    
    const payload = {
      fields: {
        event: { stringValue: event },
        timestamp: { timestampValue: new Date().toISOString() },
        frequency: { stringValue: metadata.frequency || 'unknown' },
        jobId: { stringValue: metadata.jobId || 'local' },
        status: { stringValue: metadata.status || 'info' },
        latency: { integerValue: latency },
        role: { stringValue: metadata.role || 'generic' },
        model: { stringValue: metadata.model || 'unknown' },
        vertical: { stringValue: metadata.vertical || 'global' },
        message: { stringValue: metadata.message || '' },
        details: { stringValue: JSON.stringify(metadata.details || {}) }
      }
    };
    
    const res = await fetch(firestoreUrl, { method: "POST", headers, body: JSON.stringify(payload) });
    if (!res.ok) console.warn("⚠️ [Trace] Bridge Stalled:", await res.text());
  } catch (e) {
    console.warn("⚠️ [Trace] Failed to push breadcrumb:", e.message);
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

/**
 * 🛰️ [V10.1] Google Drive Rocket-Bucket Bridge
 * Saves a file to a specific Google Drive folder (Bucket).
 */
async function saveToGDriveBucket(fileName, content, env) {
    const folderId = env.GDRIVE_BUCKET_ID;
    if (!folderId) {
        console.warn("⚠️ [GDriveBridge] GDRIVE_BUCKET_ID missing. Falling back to local/trash.");
        return null;
    }

    try {
        const token = await getGoogleAccessToken(env);
        if (!token) throw new Error("OAuth Token generation failed.");
        
        // [V10.6] Shared Drive Hardening: Enable access to institutional Shared Drives
        const driveParams = "supportsAllDrives=true&includeItemsFromAllDrives=true";

        // Stage 1: Check if file exists to determine Update vs Create
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'+and+'${folderId}'+in+parents+and+trashed=false&fields=files(id)&${driveParams}`;
        const searchRes = await fetch(searchUrl, { headers: { "Authorization": `Bearer ${token}` } });
        const { files } = await searchRes.json();

        const isBinary = content instanceof Uint8Array || content instanceof ArrayBuffer || (typeof Buffer !== 'undefined' && Buffer.isBuffer(content));
        const contentType = fileName.endsWith('.pdf') ? 'application/pdf' : (isBinary ? 'application/octet-stream' : 'application/json');

        if (files && files.length > 0) {
            const fileId = files[0].id;
            url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`;
            method = "PATCH";
            
            const res = await fetch(url, {
                method,
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": contentType },
                body: isBinary ? content : (typeof content === 'string' ? content : JSON.stringify(content))
            });
            if (!res.ok) throw new Error(`GDrive Update Failed: ${await res.text()}`);
            console.log(`📡 [GDrive] Updated Bucket Item: ${fileName} (${contentType})`);
            return fileId;
        } else {
            const metadata = { name: fileName, parents: [folderId] };
            const boundary = "-------314159265358979323846";
            
            // Build multipart body
            let body;
            const contentBody = isBinary ? content : Buffer.from(typeof content === 'string' ? content : JSON.stringify(content));
            
            if (isNode && typeof Buffer !== 'undefined') {
                body = Buffer.concat([
                    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
                    Buffer.from(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
                    contentBody,
                    Buffer.from(`\r\n--${boundary}--`)
                ]);
            } else {
                // Browser/Worker fallback (simplified string-based, might fail for binary but this service is Node-heavy)
                const delimiter = `\r\n--${boundary}\r\n`;
                const close_delim = `\r\n--${boundary}--`;
                body = delimiter +
                    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                    JSON.stringify(metadata) +
                    delimiter +
                    `Content-Type: ${contentType}\r\n\r\n` +
                    (typeof content === 'string' ? content : JSON.stringify(content)) +
                    close_delim;
            }

            const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": `multipart/related; boundary=${boundary}`
                },
                body
            });
            if (!res.ok) throw new Error(`GDrive Upload Failed: ${await res.text()}`);
            const result = await res.json();
            console.log(`📡 [GDrive] Created Bucket Item: ${fileName} -> ${result.id} (${contentType})`);
            return result.id;
        }
    } catch (e) {
        console.error("❌ [GDriveBridge] Error:", e.message);
        return null;
    }
}

/**
 * 🛰️ [V10.1] GDrive Direct Download
 */
async function loadFromGDriveBucket(jobId, env) {
    const folderId = env.GDRIVE_BUCKET_ID;
    if (!folderId) return [];

    try {
        const token = await getGoogleAccessToken(env);
        if (!token) return [];

        const driveParams = "supportsAllDrives=true&includeItemsFromAllDrives=true";
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+name+contains+'${jobId}'+and+trashed=false&fields=files(id,name)&${driveParams}`;
        const searchRes = await fetch(searchUrl, { headers: { "Authorization": `Bearer ${token}` } });
        const { files } = await searchRes.json();

        if (!files || files.length === 0) return [];

        const fragments = await Promise.all(files.map(async (file) => {
            const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
            const res = await fetch(downloadUrl, { headers: { "Authorization": `Bearer ${token}` } });
            return await res.text();
        }));

        return fragments;
    } catch (e) {
        console.error("❌ [GDriveBridge] Load Error:", e.message);
        return [];
    }
}

/**
 * 🛰️ [V10.5] GCS Cloud Bucket Persistence
 * Saves a file to the project's primary Cloud Storage bucket.
 */
async function saveToCloudBucket(fileName, content, env) {
    const bucket = env.FIREBASE_STORAGE_BUCKET || "blogspro-asset";
    if (!bucket) {
        console.warn("⚠️ [CloudBridge] No bucket configured.");
        return null;
    }

    try {
        const url = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(fileName)}`;
        const isBinary = content instanceof Uint8Array || content instanceof ArrayBuffer || (typeof Buffer !== 'undefined' && Buffer.isBuffer(content));
        const contentType = fileName.endsWith('.pdf') ? 'application/pdf' : (isBinary ? 'application/octet-stream' : 'application/json');
        
        const headers = { "Content-Type": contentType };
        const token = await getGoogleAccessToken(env);
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(url, {
            method: "POST",
            headers,
            body: isBinary ? content : (typeof content === 'string' ? content : JSON.stringify(content))
        });

        if (!res.ok) throw new Error(`GCS Upload Failed: ${await res.text()}`);
        console.log(`✅ [CloudBridge] Uploaded: ${fileName} -> ${bucket}`);
        return fileName;
    } catch (e) {
        console.error("❌ [CloudBridge] Upload Error:", e.message);
        return null;
    }
}

/**
 * 🛰️ [V10.5] GCS Cloud Bucket Retrieval
 */
async function loadFromCloudBucket(jobId, env) {
    const bucket = env.FIREBASE_STORAGE_BUCKET || "blogspro-asset";
    if (!bucket || !jobId) return [];

    try {
        const token = await getGoogleAccessToken(env);
        const headers = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        // List objects with jobId prefix
        const listUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(`sectors/${jobId}/`)}`;
        const listRes = await fetch(listUrl, { headers });
        if (!listRes.ok) return [];

        const listData = await listRes.json();
        if (!listData.items) return [];

        // Aggregate content from all fragments
        const fragments = await Promise.all(listData.items.map(async (item) => {
            const mediaUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(item.name)}?alt=media`;
            const res = await fetch(mediaUrl, { headers });
            return res.ok ? await res.json() : null;
        }));

        return fragments.filter(f => f !== null);
    } catch (e) {
        console.error("❌ [CloudBridge] Load Error:", e.message);
        return [];
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
  pushTelemetryLog,
  saveToCloudBucket,
  loadFromCloudBucket,
  saveToGDriveBucket
};
