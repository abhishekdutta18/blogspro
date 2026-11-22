// miro-sync-server.js — VPS host for the MiroSync swarm bridge (replaces the Cloudflare Durable Object).
//
//   node scripts/miro-sync-server.js
//
// Env:
//   PORT                       listen port (default 8787; bind is 127.0.0.1 unless MIRO_SYNC_HOST is set)
//   MIRO_SYNC_HOST             listen address (default 127.0.0.1 — the TLS reverse proxy fronts it)
//   MIRO_SYNC_DATA_DIR         absolute dir for the Yjs state file (default <cwd>/data/miro-sync)
//   MIRO_SYNC_TOKEN            when set, /push, /snapshot and catch-all writes need "Bearer <token>"
//   MIRO_SYNC_BACKUP_MINUTES   off-box saveSnapshot cadence when the doc changed (default 30, 0 = off)
//   FIREBASE_STORAGE_BUCKET / FIREBASE_PROJECT_ID + knowledge/firebase-service-account.json for saveSnapshot
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Y from 'yjs';
import { WebSocketServer } from 'ws';
import { MiroSyncCore } from './lib/miro-sync-core.js';
import { createFileStore } from './lib/miro-sync-file-store.js';
import { saveSnapshot } from './lib/storage-bridge.js';

const DEFAULT_PORT = 8787;
const PERSIST_DEBOUNCE_MS = 2000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_WS_FRAME_BYTES = 10 * 1024 * 1024;
const DEFAULT_BACKUP_MINUTES = 30;

function jsonLogger(base = {}) {
  const write = (stream, level, args) => {
    const [msg, ...rest] = args;
    stream.write(`${JSON.stringify({ t: new Date().toISOString(), level, msg: String(msg), ...(rest.length ? { detail: rest.map(String) } : {}), ...base })}\n`);
  };
  return {
    info: (...a) => write(process.stdout, 'info', a),
    warn: (...a) => write(process.stderr, 'warn', a),
    error: (...a) => write(process.stderr, 'error', a),
  };
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Payload too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Translates a Node request into a Fetch API Request the core understands. */
async function toFetchRequest(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const url = `${proto}://${req.headers.host || 'localhost'}${req.url}`;
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const headers = Object.entries(req.headers).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]]));
  return new Request(url, { method: req.method, headers, body: hasBody ? await readBody(req) : undefined });
}

async function writeFetchResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function startBackups(core, env, logger) {
  const minutes = Number(env.MIRO_SYNC_BACKUP_MINUTES ?? DEFAULT_BACKUP_MINUTES);
  if (!minutes || !env.FIREBASE_STORAGE_BUCKET) return () => {};
  let dirty = false;
  const markDirty = () => { dirty = true; };
  core.doc.on('update', markDirty);
  const timer = setInterval(async () => {
    if (!dirty) return;
    dirty = false;
    const key = await saveSnapshot(Y.encodeStateAsUpdate(core.doc), 'miro-sync-state', env, `state-${Date.now()}.yjs`);
    if (!key) { dirty = true; logger.warn('[MiroSync] off-box backup failed; will retry next interval'); }
  }, minutes * 60 * 1000);
  timer.unref();
  return () => { clearInterval(timer); core.doc.off('update', markDirty); };
}

/**
 * Boots the service. Returns handles so tests (and the signal handler) can shut it down cleanly.
 * @param {{ port?: number, host?: string, dataDir?: string, env?: object, logger?: object }} [opts]
 */
export async function startServer({
  port = Number(process.env.PORT || DEFAULT_PORT),
  host = process.env.MIRO_SYNC_HOST || '127.0.0.1',
  dataDir = process.env.MIRO_SYNC_DATA_DIR || path.join(process.cwd(), 'data', 'miro-sync'),
  env = process.env,
  logger = jsonLogger({ svc: 'miro-sync' }),
} = {}) {
  const core = await new MiroSyncCore({ storage: createFileStore(dataDir), env, logger, persistDelayMs: PERSIST_DEBOUNCE_MS }).load();
  const stopBackups = startBackups(core, env, logger);

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, sessions: core.sessions.size, jobs: core.doc.getMap('swarm-progress').size }));
        return;
      }
      await writeFetchResponse(res, await core.handleRequest(await toFetchRequest(req)));
    } catch (err) {
      logger.error('[MiroSync] request failed:', err.message);
      if (!res.headersSent) res.writeHead(err.status || 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.status ? err.message : 'Internal error' }));
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_FRAME_BYTES });
  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const session = core.openSession((bytes) => ws.send(bytes));
      ws.on('message', (data) => session.receive(data));
      ws.on('close', () => session.close());
      ws.on('error', () => session.close());
    });
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  logger.info(`[MiroSync] listening on ${host}:${server.address().port}, state in ${dataDir}`);

  const close = async () => {
    stopBackups();
    wss.clients.forEach((ws) => ws.terminate());
    await new Promise((resolve) => server.close(resolve));
    await core.persist();
    core.destroy();
  };
  return { server, core, close, port: server.address().port };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const logger = jsonLogger({ svc: 'miro-sync' });
  const service = await startServer({ logger });
  const shutdown = (signal) => {
    logger.info(`[MiroSync] ${signal} received, flushing state`);
    service.close().then(() => process.exit(0), (err) => { logger.error('[MiroSync] shutdown failed:', err.message); process.exit(1); });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
