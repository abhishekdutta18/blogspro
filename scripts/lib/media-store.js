/**
 * media-store.js — file storage for pipeline output (manuscripts, PDFs, research fragments,
 * snapshots) on the VPS disk. It replaces the Google Cloud Storage bucket and the Google
 * Drive folder; keys keep the bucket layout ("manuscripts/<id>.pdf", "sectors/<jobId>/…").
 *
 * Root directory: MEDIA_DIR from `env` or process.env, else <cwd>/media. On the VPS the
 * pipeline runs in the web root, so files are served by nginx at https://blogspro.in/media/<key>.
 *
 * Node only. In a Cloudflare Worker there is no disk: calls log a warning and return null / [],
 * as the bucket helpers did when the bucket was unreachable.
 */
import path from 'node:path';

const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);

async function nodeFs() {
  if (!isNode) return null;
  const { promises } = await import('node:fs');
  return promises;
}

function mediaRoot(env) {
  const configured = (env && env.MEDIA_DIR) || (isNode && process.env.MEDIA_DIR);
  return path.resolve(configured || path.join(process.cwd(), 'media'));
}

/** Resolves a storage key inside the media root; refuses keys that escape it. */
export function resolveKey(key, env) {
  const root = mediaRoot(env);
  const normalized = String(key || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const target = path.resolve(root, normalized);
  if (!normalized || (target !== root && !target.startsWith(root + path.sep))) {
    throw new Error(`Invalid media key: ${key}`);
  }
  return target;
}

function toBytes(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (typeof content === 'string') return content;
  return JSON.stringify(content);
}

/** @returns {Promise<string|null>} the key on success */
export async function saveFile(key, content, env) {
  const fs = await nodeFs();
  if (!fs) {
    console.warn(`⚠️ [MediaStore] No disk in this runtime; ${key} not saved.`);
    return null;
  }
  try {
    const target = resolveKey(key, env);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Write then rename, so a reader never sees a half-written file.
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, toBytes(content));
    await fs.rename(temp, target);
    return key;
  } catch (error) {
    console.error(`❌ [MediaStore] Save failed for ${key}: ${error.message}`);
    return null;
  }
}

/** @returns {Promise<string|null>} UTF-8 text, or null when missing */
export async function readText(key, env) {
  const fs = await nodeFs();
  if (!fs) return null;
  try {
    return await fs.readFile(resolveKey(key, env), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`⚠️ [MediaStore] Read failed for ${key}: ${error.message}`);
    return null;
  }
}

/** @returns {Promise<any|null>} parsed JSON, or null when missing or invalid */
export async function readJson(key, env) {
  const text = await readText(key, env);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    console.warn(`⚠️ [MediaStore] ${key} is not valid JSON.`);
    return null;
  }
}

/**
 * Files under a key prefix ("sectors/job-1/"), recursively, as keys relative to the root.
 * @returns {Promise<string[]>}
 */
export async function listKeys(prefix, env) {
  const fs = await nodeFs();
  if (!fs) return [];
  const root = mediaRoot(env);
  let start;
  try {
    start = resolveKey(prefix, env);
  } catch {
    return [];
  }
  const keys = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn(`⚠️ [MediaStore] List failed for ${prefix}: ${error.message}`);
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (!entry.name.endsWith('.tmp')) keys.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  await walk(start);
  return keys.sort();
}
