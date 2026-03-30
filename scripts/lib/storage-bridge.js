import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = typeof process !== 'undefined' ? path.dirname(fileURLToPath(import.meta.url)) : "";

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
  
  if (env && env.BLOOMBERG_ASSETS) {
    console.log(`📦 [R2] Uploading: ${key}`);
    await env.BLOOMBERG_ASSETS.put(key, content, {
      httpMetadata: { contentType: 'text/html' }
    });
    return key;
  } else if (fs && path) {
    const targetDir = path.join(__dirname, "../../../", "briefings", frequency);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const fullPath = path.join(targetDir, fileName);
    fs.writeFileSync(fullPath, content);
    console.log(`💾 [Local] Saved: ${fullPath}`);
    return fullPath;
  }
  throw new Error("Storage environment not recognized (No R2 or FS).");
}

async function updateIndex(entry, frequency, env = null) {
  const key = `briefings/${frequency}/index.json`;
  
  if (env && env.KV) {
    console.log(`📇 [KV] Updating index: ${key}`);
    let index = await env.KV.get(key, { type: 'json' }) || [];
    index.unshift(entry);
    await env.KV.put(key, JSON.stringify(index.slice(0, 50)));
  } else if (fs && path) {
    const targetDir = path.join(__dirname, "../../../", "briefings", frequency);
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
  } else if (fs && path) {
    const indexPath = path.join(__dirname, "../../../", "briefings", frequency, "index.json");
    return fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf-8")) : [];
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
  if (!env || !env.BLOOMBERG_ASSETS) return;
  const timestamp = Date.now();
  const key = `snapshots/${frequency}/${timestamp}.json`;
  
  console.log(`📸 [Snapshot] Saving ${frequency} telemetry: ${key}`);
  await env.BLOOMBERG_ASSETS.put(key, JSON.stringify(data), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { frequency, timestamp: String(timestamp) }
  });

  // Also maintain a 'latest' pointer in KV for fast retrieval
  if (env.KV) {
    await env.KV.put(`latest_snapshot_${frequency}`, JSON.stringify({ key, timestamp }));
  }
}

async function getRecentSnapshots(frequency, limit = 5, env) {
  if (!env || !env.BLOOMBERG_ASSETS) return [];
  
  const list = await env.BLOOMBERG_ASSETS.list({ prefix: `snapshots/${frequency}/` });
  if (!list.objects || list.objects.length === 0) return [];

  const sorted = list.objects.sort((a, b) => b.uploaded - a.uploaded).slice(0, limit);
  
  const contents = await Promise.all(sorted.map(async obj => {
    const res = await env.BLOOMBERG_ASSETS.get(obj.key);
    return res ? await res.json() : null;
  }));
  
  return contents.filter(c => c !== null);
}

/**
 * Historical Tier: Aggregated Long-Term Intelligence
 */
async function saveHistoricalData(data, env) {
  if (!env || !env.BLOOMBERG_ASSETS) return;
  const key = `snapshots/historical/market_baseline.json`;
  
  console.log(`🏛️ [Historical] Updating global market baseline`);
  await env.BLOOMBERG_ASSETS.put(key, JSON.stringify(data), {
    httpMetadata: { contentType: 'application/json' }
  });
}

async function getHistoricalData(env) {
  if (!env || !env.BLOOMBERG_ASSETS) return null;
  const key = `snapshots/historical/market_baseline.json`;
  const res = await env.BLOOMBERG_ASSETS.get(key);
  return res ? await res.json() : null;
}

