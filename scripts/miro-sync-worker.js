// miro-sync-worker.js — legacy Cloudflare host for the MiroSync swarm bridge.
//
// All routing and Yjs logic lives in scripts/lib/miro-sync-core.js and is shared with the VPS
// service (scripts/miro-sync-server.js). Keep this worker deployable until the VPS cutover is
// confirmed; see docs/miro-sync-vps-cutover.md before deleting it.
import { MiroSyncCore } from './lib/miro-sync-core.js';

/** Durable Object storage adapter matching MiroSyncCore's {get, put} contract. */
function doStorage(state) {
  return {
    get: async (key) => state.storage.get(key),
    put: async (key, value) => state.storage.put(key, value),
  };
}

/**
 * MiroSync Durable Object. Persists immediately after each mutation (persistDelayMs: 0) because a
 * DO can be evicted at any time; the Node host debounces instead.
 */
export class MiroSyncS {
  constructor(state, env) {
    this.core = new MiroSyncCore({ storage: doStorage(state), env, persistDelayMs: 0 });
    state.blockConcurrencyWhile(() => this.core.load());
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return this.core.handleRequest(request);

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const session = this.core.openSession((bytes) => server.send(bytes));
    server.addEventListener('message', (event) => session.receive(event.data));
    server.addEventListener('close', () => session.close());
    server.addEventListener('error', () => session.close());
    return new Response(null, { status: 101, webSocket: client });
  }

  async scheduled() {
    await this.core.archiveOldRecords();
  }
}

// Global router worker
export default {
  async fetch(request, env) {
    const id = env.MIRO_SYNC_DO.idFromName('global-swarm-bridge');
    return env.MIRO_SYNC_DO.get(id).fetch(request);
  },
};

/**
 * Registry Stubs to satisfy Wrangler Global Bindings
 */
export class DataIngestorS { constructor(state) { this.state = state; } async fetch() { return new Response('DH_STUB'); } }
export class ManuscriptAggregatorS { constructor(state) { this.state = state; } async fetch() { return new Response('MA_STUB'); } }
