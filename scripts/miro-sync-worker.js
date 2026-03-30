import * as Y from 'yjs';
import * as sync from 'y-protocols/dist/sync.cjs';
import * as awareness from 'y-protocols/dist/awareness.cjs';
import { encoding, decoding } from 'lib0';

/**
 * MiroSync Durable Object
 * $0 Serverless Bridge between Swarm and Affine
 */
export class MiroSync {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.doc = new Y.Doc();
    this.sessions = new Map();
    
    // Load snapshot from persistent storage if available
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get('doc');
      if (stored) {
        Y.applyUpdate(this.doc, stored);
      }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    
    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      
      await this.handleSession(server);
      
      return new Response(null, { status: 101, webSocket: client });
    }

    // Handle snapshot export to R2
    if (url.pathname === '/snapshot') {
      const update = Y.encodeStateAsUpdate(this.doc);
      const filename = `snapshot-${Date.now()}.yjs`;
      await this.env.snapshots.put(filename, update);
      return new Response(JSON.stringify({ success: true, filename }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Handle high-performance internal push from Swarm workers
    if (url.pathname === '/push' && request.method === 'POST') {
      try {
        const { content, source } = await request.json();
        const text = this.doc.getText('miro-consensus');
        const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        
        // Block-based append with institutional markers
        const formattedEntry = `\n\n═══════════════════════════════════════\n🕵️ SOURCE: ${source || 'MiroFish Consensus'}\n📅 DATE: ${timestamp}\n═══════════════════════════════════════\n\n${content}\n\n`;
        
        text.insert(text.length, formattedEntry);
        
        // Persist the full state
        const update = Y.encodeStateAsUpdate(this.doc);
        await this.state.storage.put('doc', update);

        // Broadcast update to all active Affine/WebSocket clients
        const encoder = encoding.createEncoder();
        encoding.writeUint8(encoder, 0); // messageSync
        sync.writeUpdate(encoder, update);
        this.broadcast(encoding.toUint8Array(encoder));

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('MiroSync Active', { status: 200 });
  }

  async handleSession(ws) {
    ws.accept();
    
    const id = crypto.randomUUID();
    this.sessions.set(id, ws);

    // Send Sync Step 1
    const encoder = encoding.createEncoder();
    encoding.writeUint8(encoder, 0); // messageSync
    sync.writeSyncStep1(encoder, this.doc);
    ws.send(encoding.toUint8Array(encoder));

    ws.addEventListener('message', async (event) => {
      try {
        const message = new Uint8Array(event.data);
        const decoder = decoding.createDecoder(message);
        const type = decoding.readUint8(decoder);

        if (type === 0) { // messageSync
          const encoder = encoding.createEncoder();
          encoding.writeUint8(encoder, 0);
          const syncType = sync.readSyncMessage(decoder, encoder, this.doc, null);
          if (syncType !== sync.messageSyncStep1 && syncType !== sync.messageSyncStep2) {
             // broadcast update
             this.broadcast(message, id);
             // Persist to local DO storage
             await this.state.storage.put('doc', Y.encodeStateAsUpdate(this.doc));
          }
          if (encoding.length(encoder) > 1) {
            ws.send(encoding.toUint8Array(encoder));
          }
        }
      } catch (err) {
        console.error('WS Error:', err);
      }
    });

    ws.addEventListener('close', () => {
      this.sessions.delete(id);
    });
  }

  broadcast(message, senderId) {
    for (const [id, ws] of this.sessions) {
      if (id !== senderId) {
        try {
          ws.send(message);
        } catch (e) {
          this.sessions.delete(id);
        }
      }
    }
  }
}

// Global router worker
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const id = env.MIRO_SYNC_DO.idFromName('global-swarm-bridge');
    const obj = env.MIRO_SYNC_DO.get(id);
    return obj.fetch(request);
  }
};
