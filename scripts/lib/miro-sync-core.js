// miro-sync-core.js — runtime-neutral MiroSync swarm bridge.
//
// One Yjs doc (maps: swarm-progress, swarm-archive, affine-health; text: final-manuscript) plus the
// HTTP routes and y-protocols WebSocket sessions that read and write it. Both hosts wrap this class:
//   - scripts/miro-sync-worker.js   (Cloudflare Durable Object, legacy)
//   - scripts/miro-sync-server.js   (Node service on the VPS)
// Hosts supply a `storage` with async get(key)/put(key, bytes), the env, and transport for sessions.
import * as Y from 'yjs';
// ESM entry points on purpose: the dist/*.cjs builds require() a second copy of yjs, which breaks
// Yjs's constructor checks ("Yjs was already imported").
import * as sync from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { encoding, decoding } from 'lib0';
import { saveSnapshot } from './storage-bridge.js';
import { renderTerminalCharts } from './miro-terminal-charts.js';
import { TERMINAL_HTML } from './miro-terminal-html.js';

export const DOC_KEY = 'doc';
export const TELEMETRY_JOB_LIMIT = 5;
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const ARCHIVE_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export const TELEMETRY_CORS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
});
const OPEN_CORS = Object.freeze({ 'Access-Control-Allow-Origin': '*' });
const PUSH_CORS = Object.freeze({ ...OPEN_CORS, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' });

const SILENT_LOGGER = Object.freeze({ info: () => {}, warn: (...a) => console.warn(...a), error: (...a) => console.error(...a) });

function json(body, { status = 200, headers = OPEN_CORS } = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function syncUpdateMessage(update) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  sync.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

/** Builds the next swarm-progress entry for a /push body, or null when the source writes nothing there. */
export function nextProgressEntry(prev, body, id, timestamp) {
  const { source, stage, message, trace, agentScores, health, rl } = body;
  const base = prev || { jobId: id, timestamp };
  if (source === 'SWARM_PROGRESS' || body.event === 'SWARM_START') {
    const seeded = prev || { jobId: id, stages: [], logs: [], trace: [], timestamp };
    return {
      ...seeded,
      stage: stage || body.event || seeded.stage || 'PROGRESS',
      message: message || body.message || seeded.message || 'Telemetry Sync...',
      timestamp,
      ...(trace ? { trace: [...(seeded.trace || []), trace] } : {}),
      ...(agentScores ? { agentScores } : {}),
      ...(body.latency ? { latency: body.latency } : {}),
    };
  }
  if (source === 'GHOST_PREDICTION') {
    return { ...base, ghostProjection: { summary: body.summary, telemetry: body.telemetry, latency: body.latency, timestamp } };
  }
  if (source === 'MIRO_METRICS') {
    return {
      ...base,
      agentScores: agentScores || base.agentScores || [],
      disagreementVariance: body.disagreementVariance || 0,
      swarmSentiment: body.swarmSentiment || 50,
      consensusTimeline: body.consensusTimeline || [],
      ...(body.logicChain ? { logicChain: body.logicChain } : {}),
    };
  }
  if (source === 'KEY_HEALTH' || source === 'RL_METRICS') {
    return { ...base, ...(health ? { health } : {}), ...(rl ? { rl } : {}), ...(body.latency ? { latency: body.latency } : {}) };
  }
  return null;
}

export class MiroSyncCore {
  /**
   * @param {{ storage: {get(k:string):Promise<Uint8Array|undefined>, put(k:string, v:Uint8Array):Promise<void>},
   *           env?: object, logger?: object, persistDelayMs?: number }} opts
   *   persistDelayMs: debounce for writes after a mutation; 0 persists immediately, null leaves it to the host.
   */
  constructor({ storage, env = {}, logger = SILENT_LOGGER, persistDelayMs = null }) {
    this.storage = storage;
    this.env = env;
    this.logger = logger;
    this.persistDelayMs = persistDelayMs;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.awareness.setLocalState(null);
    this.sessions = new Map();
    this.persistTimer = null;
    this.awareness.on('update', ({ added, updated, removed }, origin) => this.relayAwareness([...added, ...updated, ...removed], origin));
  }

  /** Stops timers (debounced persist, awareness heartbeat) so the host process can exit. */
  destroy() {
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
    this.awareness.destroy();
  }

  async load() {
    const stored = await this.storage.get(DOC_KEY);
    if (stored) Y.applyUpdate(this.doc, stored);
    return this;
  }

  /** Writes the full doc (V1 encoding, the format load() reads) and returns its size in bytes. */
  async persist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
    const update = Y.encodeStateAsUpdate(this.doc);
    await this.storage.put(DOC_KEY, update);
    return update.byteLength;
  }

  schedulePersist() {
    if (this.persistDelayMs === null || this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persist().catch((err) => this.logger.error('[MiroSync] persist failed:', err.message));
    }, this.persistDelayMs);
  }

  /** Newest-first [jobId, job] entries from the shared swarm-progress map. */
  recentJobs(limit) {
    return [...this.doc.getMap('swarm-progress').entries()]
      .sort(([, a], [, b]) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  isAuthorized(request) {
    const token = this.env.MIRO_SYNC_TOKEN;
    return !token || request.headers.get('Authorization') === `Bearer ${token}`;
  }

  async handleRequest(request) {
    const url = new URL(request.url);
    const route = ROUTES.find((r) => r.path === url.pathname && (!r.method || r.method === request.method));
    if (route?.auth && !this.isAuthorized(request)) return json({ error: 'Unauthorized' }, { status: 401 });
    try {
      return await (route ? route.handle(this, request, url) : this.handleDefault(request));
    } catch (err) {
      this.logger.error(`[MiroSync] ${request.method} ${url.pathname} failed:`, err.message);
      return json({ error: err.message }, { status: 500 });
    }
  }

  async handleDefault(request) {
    if (!this.isAuthorized(request)) return json({ error: 'Unauthorized' }, { status: 401 });
    const stored = await this.persist();
    this.broadcast(syncUpdateMessage(Y.encodeStateAsUpdate(this.doc)));
    return json({ success: true, stored }, { headers: {} });
  }

  async handlePush(request) {
    const body = await request.json();
    const timestamp = new Date().toISOString();
    const id = body.jobId || 'latest';
    const progressMap = this.doc.getMap('swarm-progress');
    const entry = nextProgressEntry(progressMap.get(id), body, id, timestamp);
    if (entry) progressMap.set(id, entry);

    if (body.source === 'KEY_HEALTH' || body.source === 'RL_METRICS') {
      const affine = this.doc.getMap('affine-health');
      affine.set('last_update', timestamp);
      if (body.health) affine.set('key_health', body.health);
      if (body.rl) affine.set('rl_performance', body.rl);
    } else if (body.source === 'FINAL_MANUSCRIPT') {
      const finalText = this.doc.getText('final-manuscript');
      this.doc.transact(() => {
        finalText.delete(0, finalText.length);
        finalText.insert(0, String(body.content ?? ''));
      });
      const filename = `final-${body.frequency || 'pulse'}-${Date.now()}.yjs`;
      await saveSnapshot(Y.encodeStateAsUpdate(this.doc), 'miro-sync-final', this.env, filename);
    }

    this.broadcast(syncUpdateMessage(Y.encodeStateAsUpdate(this.doc)));
    this.schedulePersist();
    return json({ status: 'success' }, { headers: PUSH_CORS });
  }

  /**
   * Moves swarm-progress records older than 90 days into swarm-archive, exporting the doc and the
   * pruned batch through saveSnapshot (written only where the media store has a disk).
   */
  async archiveOldRecords() {
    const progressMap = this.doc.getMap('swarm-progress');
    const archiveMap = this.doc.getMap('swarm-archive');
    const now = Date.now();
    const stale = [...progressMap.entries()].filter(([, v]) => {
      const t = new Date(v.timestamp).getTime();
      return !Number.isNaN(t) && now - t > ARCHIVE_AGE_MS;
    });
    if (stale.length === 0) return { archivedCount: 0, activeCount: progressMap.size };

    this.doc.transact(() => {
      stale.forEach(([key, value]) => { archiveMap.set(key, value); progressMap.delete(key); });
    });
    const date = new Date();
    const folder = `${new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date).toUpperCase()}${date.getFullYear()}`;
    const base = `archive/${folder}`;
    await saveSnapshot(Y.encodeStateAsUpdate(this.doc), `${base}/state`, this.env, `miro-archive-binary-${Date.now()}.yjs`);
    await saveSnapshot(Object.fromEntries(stale), `${base}/telemetry`, this.env, `miro-pruned-batch-${Date.now()}.json`);
    await this.persist();
    this.logger.info(`[MiroSync] Archived ${stale.length} records to ${folder}.`);
    return { archivedCount: stale.length, activeCount: progressMap.size };
  }

  /**
   * Opens a y-protocols session. `send(bytes)` delivers to the peer; the caller forwards each inbound
   * binary frame to `receive` and calls `close` when the socket ends.
   */
  openSession(send) {
    const id = crypto.randomUUID();
    const session = { send, clientIds: new Set() };
    this.sessions.set(id, session);

    const step1 = encoding.createEncoder();
    encoding.writeVarUint(step1, MESSAGE_SYNC);
    sync.writeSyncStep1(step1, this.doc);
    send(encoding.toUint8Array(step1));

    const states = [...this.awareness.getStates().keys()];
    if (states.length > 0) send(this.awarenessMessage(states));

    return {
      receive: (data) => this.receive(id, new Uint8Array(data)),
      close: () => this.closeSession(id),
    };
  }

  receive(sessionId, message) {
    try {
      const decoder = decoding.createDecoder(message);
      const type = decoding.readVarUint(decoder);
      if (type === MESSAGE_SYNC) return this.receiveSync(sessionId, message, decoder);
      if (type === MESSAGE_AWARENESS) {
        const update = decoding.readVarUint8Array(decoder);
        this.trackAwarenessClients(sessionId, update);
        awarenessProtocol.applyAwarenessUpdate(this.awareness, update, sessionId);
      }
    } catch (err) {
      this.logger.error('[MiroSync] WS message rejected:', err.message);
    }
    return undefined;
  }

  receiveSync(sessionId, message, decoder) {
    const reply = encoding.createEncoder();
    encoding.writeVarUint(reply, MESSAGE_SYNC);
    const syncType = sync.readSyncMessage(decoder, reply, this.doc, null);
    if (syncType !== sync.messageYjsSyncStep1 && syncType !== sync.messageYjsSyncStep2) {
      this.broadcast(message, sessionId);
      this.schedulePersist();
    } else if (syncType === sync.messageYjsSyncStep2) {
      this.schedulePersist();
    }
    if (encoding.length(reply) > 1) this.sessions.get(sessionId)?.send(encoding.toUint8Array(reply));
  }

  trackAwarenessClients(sessionId, update) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const decoder = decoding.createDecoder(update);
    const count = decoding.readVarUint(decoder);
    for (let i = 0; i < count; i++) {
      session.clientIds.add(decoding.readVarUint(decoder));
      decoding.readVarUint(decoder); // clock
      decoding.readVarString(decoder); // state JSON
    }
  }

  awarenessMessage(clientIds) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, clientIds));
    return encoding.toUint8Array(encoder);
  }

  relayAwareness(changedIds, originSessionId) {
    if (changedIds.length === 0 || this.sessions.size === 0) return;
    this.broadcast(this.awarenessMessage(changedIds), originSessionId);
  }

  closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    if (session.clientIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(this.awareness, [...session.clientIds], null);
    }
  }

  broadcast(message, senderId) {
    for (const [id, session] of this.sessions) {
      if (id === senderId) continue;
      try {
        session.send(message);
      } catch {
        this.closeSession(id);
      }
    }
  }
}

const ROUTES = Object.freeze([
  { path: '/sync', method: 'POST', handle: async (core) => json({ success: true, size: await core.persist() }) },
  {
    path: '/archive', method: 'GET',
    handle: async (core) => {
      await core.archiveOldRecords();
      return json({ success: true, message: 'V7.0 Proactive Archiving Initiated', timestamp: new Date().toISOString() });
    },
  },
  { path: '/archive', method: 'POST', handle: async (core) => json(await core.archiveOldRecords()) },
  {
    path: '/snapshot', auth: true,
    handle: async (core) => {
      const filename = `snapshot-${Date.now()}.yjs`;
      await saveSnapshot(Y.encodeStateAsUpdate(core.doc), 'miro-sync', core.env, filename);
      return json({ success: true, filename });
    },
  },
  {
    path: '/terminal', method: 'GET',
    handle: async () => new Response(TERMINAL_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
  },
  {
    path: '/telemetry', method: 'GET',
    handle: async (core) => json(Object.fromEntries(core.recentJobs(TELEMETRY_JOB_LIMIT)), { headers: TELEMETRY_CORS }),
  },
  { path: '/telemetry', method: 'OPTIONS', handle: async () => new Response(null, { headers: TELEMETRY_CORS }) },
  {
    path: '/telemetry/charts', method: 'GET',
    handle: async (core) => {
      const [latest] = core.recentJobs(1);
      return json(latest ? renderTerminalCharts(latest[1]) : null, { headers: TELEMETRY_CORS });
    },
  },
  { path: '/push', method: 'POST', auth: true, handle: (core, request) => core.handlePush(request) },
  {
    path: '/check-step', method: 'GET',
    handle: async (core, _request, url) => {
      const jobId = url.searchParams.get('jobId');
      const stepId = url.searchParams.get('stepId');
      const job = core.doc.getMap('swarm-progress').get(jobId);
      const completed = Boolean(job?.trace?.some((t) => t.stepId === stepId && t.status === 'COMPLETED'));
      return json({ status: completed ? 'COMPLETED' : 'PENDING', jobId, stepId });
    },
  },
  {
    path: '/styles', method: 'GET',
    handle: async () => json({
      manual: 'BLOGSPRO_STYLE_V6',
      lastUpdate: new Date().toISOString(),
      guidelines: {
        typography: 'Outfit, JetBrains Mono',
        colors: { background: '#050505', accent: '#daaf37', ghost: '#888888' },
        tone: 'Institutional, High-Density, Data-First',
      },
    }),
  },
  {
    path: '/archive/list', method: 'GET',
    handle: async (core) => json(Object.fromEntries(core.doc.getMap('swarm-archive').entries())),
  },
  {
    path: '/archive/retrieve', method: 'GET',
    handle: async (core, _request, url) => {
      const entry = core.doc.getMap('swarm-archive').get(url.searchParams.get('id'));
      return entry ? json(entry) : json({ error: 'Record not found in warm archive.' }, { status: 404 });
    },
  },
]);
