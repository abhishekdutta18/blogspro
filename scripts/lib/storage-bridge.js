import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = (typeof process !== 'undefined' && import.meta && import.meta.url && import.meta.url.startsWith('file:')) 
  ? path.dirname(fileURLToPath(import.meta.url)) 
  : "";

// Firestore REST Client: $0 Managed State Layer
async function syncToFirestore(collection, data, env) {
  if (!env || !env.FIREBASE_PROJECT_ID) {
    console.warn("⚠️ FIREBASE_PROJECT_ID not set. Skipping Firestore sync.");
    return false;
  }

  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}`;
  
  // Transform flat JS object to Firestore-compatible fields JSON
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'number') fields[key] = { doubleValue: value };
    else if (typeof value === 'boolean') fields[key] = { booleanValue: value };
    else fields[key] = { stringValue: String(value) };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields })
    });
    if (!res.ok) {
      console.error(`❌ Firestore Sync Fail (${collection}):`, await res.text());
      return false;
    }
    console.log(`📡 [Firestore] Successfully synced record to '${collection}'`);
    return true;
  } catch (e) {
    console.error(`⚠️ Firestore Connection Error:`, e.message);
    return false;
  }
}

/**
 * Storage Bridge: BlogsPro Terminal
 * Abstracts file operations between Local (FS) and Serverless (Cloudflare R2/KV).
 */

async function saveBriefing(fileName, content, frequency, env = null) {
  const key = `briefings/${frequency}/${fileName}`;
  
  if (env && env.FIREBASE_STORAGE_BUCKET) {
    console.log(`📦 [Firebase Storage] Uploading: ${key}`);
    // Workers use the Google Cloud Storage JSON API (REST)
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${env.FIREBASE_STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(key)}`;
    
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/html" },
        body: content
      });
      if (!res.ok) console.warn(`⚠️ Firebase Storage REST Fail: ${await res.text()}`);
      return key;
    } catch (e) {
      console.error(`❌ Firebase Storage Connection Error:`, e.message);
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

async function updateIndex(entry, frequency, env = null) {
  const key = `briefings/${frequency}/index.json`;
  
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

export { 
  saveBriefing, updateIndex, getIndex, syncToFirestore,
  saveSnapshot, getRecentSnapshots, saveHistoricalData, getHistoricalData 
};
export default { 
  saveBriefing, updateIndex, getIndex, syncToFirestore,
  saveSnapshot, getRecentSnapshots, saveHistoricalData, getHistoricalData 
};


/**
 * Snapshot Tier: BlogsPro Swarm 3.0
 * Manages frequency-specific data snapshots and historical trends.
 */

async function saveSnapshot(data, frequency, env) {
  if (!env || !env.FIREBASE_STORAGE_BUCKET) return;
  const timestamp = Date.now();
  const key = `snapshots/${frequency}/${timestamp}.json`;
  
  console.log(`📸 [Snapshot] Saving ${frequency} telemetry to Firebase: ${key}`);
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${env.FIREBASE_STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(key)}`;
  
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    
    // Also maintain a 'latest' pointer in Firestore for fast retrieval
    await syncToFirestore(`latest_snapshots`, {
        frequency,
        key,
        timestamp,
        id: `latest_${frequency}`
    }, env);
  } catch (e) {
    console.error(`⚠️ Snapshot Sync Fail:`, e.message);
  }
}

async function getRecentSnapshots(frequency, limit = 1, env) {
  if (!env || !env.FIREBASE_PROJECT_ID) return [];

  // Node.js: Use Admin SDK for Cloud Storage
  if (isNode) {
    const admin = await getFirebaseAdmin();
    if (admin && env.FIREBASE_STORAGE_BUCKET) {
        try {
            if (!admin.apps.length) admin.initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
            const doc = await admin.firestore().collection('latest_snapshots').doc(`latest_${frequency}`).get();
            if (doc.exists) {
                const storageKey = doc.data().key;
                const file = admin.storage().bucket(env.FIREBASE_STORAGE_BUCKET).file(storageKey);
                const [content] = await file.download();
                return [JSON.parse(content.toString())];
            }
        } catch (e) {
            console.warn("⚠️ [StorageBridge] Admin Cloud Retrieval failed, falling back to REST:", e.message);
        }
    }
  }

  try {
    // 1. Get the latest snapshot pointer from Firestore
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/latest_snapshots/latest_${frequency}`);
    if (!res.ok) return [];

    const meta = await res.json();
    if (!meta.fields || !meta.fields.key) return [];

    const storageKey = meta.fields.key.stringValue;
    const storageUrl = `https://storage.googleapis.com/${env.FIREBASE_STORAGE_BUCKET}/${storageKey}`;

    // 2. Fetch the actual JSON snapshot from Storage
    const snapshotRes = await fetch(storageUrl);
    if (!snapshotRes.ok) return [];

    const data = await snapshotRes.json();
    return [data]; 
  } catch (e) {
    console.error(`⚠️ [StorageBridge] getRecentSnapshots Fail:`, e.message);
    return [];
  }
}

async function saveHistoricalData(data, env) {
  if (!env || !env.FIREBASE_STORAGE_BUCKET) return;
  const key = `snapshots/historical/market_baseline.json`;
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${env.FIREBASE_STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(key)}`;
  
  console.log(`🏛️ [Historical] Updating global market baseline in Firebase`);
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

async function getHistoricalData(env) {
  if (!env || !env.FIREBASE_STORAGE_BUCKET) return null;
  const key = `snapshots/historical/market_baseline.json`;
  try {
    const res = await fetch(`https://storage.googleapis.com/${env.FIREBASE_STORAGE_BUCKET}/${key}`);
    return res.ok ? await res.json() : null;
  } catch (e) {
    return null;
  }
}
