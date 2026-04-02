import * as Y from 'yjs';
import * as sync from 'y-protocols/dist/sync.cjs';
import * as awareness from 'y-protocols/dist/awareness.cjs';
import { encoding, decoding } from 'lib0';
import { saveSnapshot } from './lib/storage-bridge.js';

/**
 * MiroSync Durable Object
 * $0 Serverless Bridge between Swarm and Affine
 */
export class MiroSyncS {
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

    // Handle snapshot export to Firebase
    if (url.pathname === '/snapshot') {
      const update = Y.encodeStateAsUpdate(this.doc);
      const filename = `snapshot-${Date.now()}.yjs`;
      await saveSnapshot(update, 'miro-sync', this.env, filename);
      return new Response(JSON.stringify({ success: true, filename }), {
        headers: { 
          'Content-Type': 'application/json',
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 1. Served Institutional Terminal UI
    if (url.pathname === '/terminal' && request.method === 'GET') {
      return new Response(TERMINAL_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // 1.5. Failsafe Telemetry Snapshot (Conflict-Free JSON Stream)
    if (url.pathname === '/telemetry' && request.method === 'GET') {
      const progressMap = this.doc.getMap('swarm-progress');
      
      // 🧹 Pruning Routine: Remove entries older than 3 months
      const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      let prunedCount = 0;

      for (const [key, value] of progressMap.entries()) {
        const timestamp = new Date(value.timestamp).getTime();
        if (!isNaN(timestamp) && (now - timestamp) > THREE_MONTHS_MS) {
          progressMap.delete(key);
          prunedCount++;
        }
      }
      if (prunedCount > 0) console.log(`🧹 [MiroSync] Pruned ${prunedCount} legacy swarm entries.`);

      const data = Object.fromEntries(progressMap.entries());
      
      // 🚀 optimization: Only send the 5 most recent jobs to the client to prevent payload bloat
      const sortedKeys = Object.keys(data).sort((a, b) => 
        new Date(data[b].timestamp).getTime() - new Date(data[a].timestamp).getTime()
      );
      
      const filteredData = {};
      sortedKeys.slice(0, 5).forEach(k => filteredData[k] = data[k]);

      return new Response(JSON.stringify(filteredData), {
        headers: { 
          'Content-Type': 'application/json',
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 2. High-Performance Telemetry Push
    if (url.pathname === '/push' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { source, content, stage, message } = body;
        const text = this.doc.getText('miro-consensus');
        const timestamp = new Date().toISOString();

        if (source === "SWARM_PROGRESS" || body.event === 'SWARM_START') {
          const progressMap = this.doc.getMap('swarm-progress');
          const entry = { 
            ...body, 
            stage: stage || body.event || 'PROGRESS', 
            message: message || body.message || 'Telemetry Sync...',
            timestamp 
          };
          progressMap.set(body.jobId || 'latest', entry);
        } else {
          const formattedEntry = `\n\n═══════════════════════════════════════\n🕵️ SOURCE: ${source || 'MiroFish Consensus'}\n📅 DATE: ${timestamp}\n═══════════════════════════════════════\n\n${content}\n\n`;
          text.insert(text.length, formattedEntry);
        }

        // --- HARDENED BROADCAST: Notify all connected terminal clients ---
        const update = Y.encodeStateAsUpdate(this.doc);
        const encoder = encoding.createEncoder();
        encoding.writeUint8(encoder, 0); // messageSync
        sync.writeUpdate(encoder, update);
        this.broadcast(encoding.toUint8Array(encoder));

        return new Response(JSON.stringify({ status: 'success' }), {
          status: 200,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { 
          status: 500,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // 3. Default Durable Object State Sync (WebSocket + Yjs)
    try {
      if (request.headers.get('Upgrade') === 'websocket') {
        const [client, server] = new WebSocketPair();
        await this.handleSession(server);
        return new Response(null, { status: 101, webSocket: client });
      }

      // Persist the full state using V2 serialization for efficiency
      const update = Y.encodeStateAsUpdateV2(this.doc);
      await this.state.storage.put('doc', update);

      // Transition to V1 for client-side broadcast if needed
      const updateV1 = Y.encodeStateAsUpdate(this.doc);
      const encoder = encoding.createEncoder();
      encoding.writeUint8(encoder, 0); // messageSync
      sync.writeUpdate(encoder, updateV1);
      this.broadcast(encoding.toUint8Array(encoder));

      return new Response(JSON.stringify({ success: true, stored: update.byteLength }), {
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

const TERMINAL_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BlogsPro Swarm Terminal | Institutional Real-Time Logic</title>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Outfit:wght@400;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --gold: #BFA100;
            --gold-dim: rgba(191, 161, 0, 0.4);
            --bg: #0A0A0A;
            --surface: #141414;
            --border: #2A2A2A;
            --text: #E0E0E0;
            --success: #00FF9D;
            --warning: #FFBF00;
            --error: #FF4D4D;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            background: var(--bg); 
            color: var(--text); 
            font-family: 'Outfit', sans-serif; 
            overflow: hidden;
            height: 100vh;
        }

        header {
            height: 60px;
            border-bottom: 2px solid var(--gold);
            display: flex;
            align-items: center;
            padding: 0 30px;
            background: rgba(10, 10, 10, 0.8);
            backdrop-filter: blur(10px);
            justify-content: space-between;
            z-index: 100;
        }

        .title-block { display: flex; align-items: center; gap: 15px; }
        .logo { color: var(--gold); font-weight: 700; letter-spacing: 2px; font-size: 20px; }
        .status-pill { 
            background: var(--gold-dim); 
            color: var(--gold); 
            padding: 4px 12px; 
            border-radius: 20px; 
            font-size: 12px; 
            font-family: 'JetBrains Mono', monospace;
            border: 1px solid var(--gold);
        }

        main {
            display: grid;
            grid-template-columns: 400px 1fr;
            grid-template-rows: 1fr 300px;
            height: calc(100vh - 60px);
        }

        .sidebar {
            background: var(--surface);
            border-right: 1px solid var(--border);
            padding: 20px;
            overflow-y: auto;
        }

        h3 { 
            color: var(--gold); 
            font-size: 14px; 
            text-transform: uppercase; 
            letter-spacing: 1px; 
            margin-bottom: 20px; 
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .vertical-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-bottom: 30px;
        }

        .vertical-node {
            aspect-ratio: 1;
            background: #1A1A1A;
            border: 1px solid var(--border);
            border-radius: 4px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-size: 9px;
            text-align: center;
            color: #666;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .vertical-node.active { 
            border-color: var(--gold); 
            color: var(--gold); 
            box-shadow: 0 0 15px var(--gold-dim);
            animation: pulse 2s infinite;
        }

        .vertical-node.complete { 
            border-color: var(--success); 
            color: var(--success); 
            background: rgba(0, 255, 157, 0.05);
        }

        .vertical-node i { font-size: 14px; margin-bottom: 5px; }

        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.6; }
            100% { opacity: 1; }
        }

        .console {
            grid-row: 2;
            grid-column: 1 / 3;
            background: #000;
            border-top: 1px solid var(--border);
            padding: 20px;
            font-family: 'JetBrains Mono', monospace;
            overflow-y: auto;
            font-size: 12px;
            line-height: 1.6;
        }

        .log-entry { margin-bottom: 5px; display: flex; gap: 15px; }
        .log-time { color: var(--gold); opacity: 0.6; }
        .log-msg { color: #BBB; }
        .log-msg.highlight { color: var(--gold); font-weight: 700; }
        .log-msg.success { color: var(--success); }

        .workspace {
            padding: 40px;
            display: flex;
            flex-direction: column;
            gap: 30px;
            overflow-y: auto;
        }

        .progress-container {
            background: var(--surface);
            padding: 30px;
            border-radius: 12px;
            border: 1px solid var(--border);
        }

        .progress-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 15px;
        }

        .progress-bar-bg {
            height: 8px;
            background: #222;
            border-radius: 4px;
            overflow: hidden;
            border: 1px solid #333;
        }

        .progress-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #8A7500, var(--gold));
            width: 0%;
            transition: width 1s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 0 0 10px var(--gold);
        }

        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
        }

        .metric-card {
            background: #1A1A1A;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid var(--border);
            position: relative;
        }

        .metric-label { font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 5px; }
        .metric-value { font-size: 24px; color: var(--gold); font-weight: 700; }

        .bg-glow {
            position: fixed;
            top: 20%;
            left: 50%;
            width: 600px;
            height: 600px;
            background: radial-gradient(circle, var(--gold-dim) 0%, transparent 70%);
            filter: blur(80px);
            z-index: -1;
            opacity: 0.3;
        }
    </style>
</head>
<body>
    <div class="bg-glow"></div>
    
    <header>
        <div class="title-block">
            <span class="logo">BLOGSPRO 4.0</span>
            <span class="status-pill" id="global-status">SWARM_IDLE</span>
        </div>
        <div class="control-block">
            <span id="conn-status" style="color: #666; font-size: 11px; margin-right: 15px;">📡 SYNC_OK</span>
            <span id="current-job" style="font-family: 'JetBrains Mono'; font-size: 12px; color: #666;">NO_ACTIVE_JOB</span>
        </div>
    </header>

    <main>
        <section class="sidebar">
            <h3>Vertical Grid</h3>
            <div class="vertical-grid" id="node-grid"></div>

            <h3>Metrics</h3>
            <div class="metrics-grid" style="grid-template-columns: 1fr;">
                <div class="metric-card">
                    <div class="metric-label">Token Rotation</div>
                    <div class="metric-value" id="model-usage" style="font-size: 14px;">Groq / Gemini / Mistral</div>
                </div>
            </div>
        </section>

        <section class="workspace">
            <div class="progress-container">
                <div class="progress-header">
                    <span id="stage-label" style="color: var(--gold); font-weight: 700;">INITIALIZING_ENVIRONMENT</span>
                    <span id="percentage-label">0%</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" id="progress-fill"></div>
                </div>
            </div>

            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-label">Consensus Desk</div>
                    <div class="metric-value" id="consensus-status" style="font-size: 16px; color: #666;">WAITING...</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Fidelity Governor</div>
                    <div class="metric-value" id="governor-status" style="font-size: 16px; color: #666;">STANDBY</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Deep-Reflect</div>
                    <div class="metric-value" id="reflect-status" style="font-size: 16px; color: #666;">ACTIVE</div>
                </div>
            </div>
        </section>

        <section class="console" id="log-console">
            <div class="log-entry">
                <span class="log-time">Awaiting Sync...</span>
                <span class="log-msg highlight">SYSTEM_START: Institutional Swarm Hub Active.</span>
            </div>
        </section>
    </main>

    <script>
        const nodeGrid = document.getElementById('node-grid');
        const logConsole = document.getElementById('log-console');
        const verticals = ["Macro", "Banking", "Cards", "Equities", "Debt", "FX", "Digital", "Reg", "Comm", "EM", "Asset", "Scribe", "Capital", "Insure", "GIFT", "Pay"];
        
        // Initial Grid Setup
        verticals.forEach((v, i) => {
            const n = document.createElement('div');
            n.className = 'vertical-node';
            n.id = 'node-' + i;
            n.innerHTML = '<i>' + v.substring(0, 3) + '</i>' + v;
            nodeGrid.appendChild(n);
        });

        function addLog(msg, type = '') {
            const t = new Date().toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' });
            const e = document.createElement('div');
            e.className = 'log-entry';
            e.innerHTML = '<span class="log-time">[' + t + ']</span><span class="log-msg ' + type + '">' + msg + '</span>';
            logConsole.prepend(e);
        }

        let lastJobId = null;
        let isPolling = false;
        let consecutiveErrors = 0;

        async function pollTelemetry() {
            if (isPolling) return;
            isPolling = true;

            try {
                // Use a short timeout to prevent hanging UI during worker cold-starts
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000);

                const res = await fetch('/telemetry', { signal: controller.signal });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json();
                    consecutiveErrors = 0;
                    document.getElementById('conn-status').innerText = '📡 SYNC_OK';
                    document.getElementById('conn-status').style.color = '#00FF41';

                    let latest = null;
                    let maxTime = 0;
                    for (const jobId in data) {
                        const dt = new Date(data[jobId].timestamp).getTime();
                        if (!isNaN(dt) && dt > maxTime) { 
                            maxTime = dt; 
                            latest = data[jobId]; 
                        }
                    }

                    if (latest) {
                        if (latest.jobId !== lastJobId) {
                            lastJobId = latest.jobId;
                            addLog('🚀 Synchronizing With Swarm: ' + lastJobId, 'highlight');
                        }
                        updateUI(latest);
                    }
                } else {
                    throw new Error('HTTP_' + res.status);
                }
            } catch (e) {
                consecutiveErrors++;
                document.getElementById('conn-status').innerText = '⏳ RECOVERING... (' + consecutiveErrors + ')';
                document.getElementById('conn-status').style.color = '#FF9900';
                
                if (consecutiveErrors > 5) {
                    // Force a softer reset of the polling flag to allow fresh attempts
                    isPolling = false; 
                }
                console.warn('Telemetry recovery attempt:', e.message);
            } finally {
                isPolling = false;
            }
        }

        function updateUI(data) {
            document.getElementById('current-job').innerText = data.jobId;
            document.getElementById('global-status').innerText = 'SWARM_' + data.stage;
            document.getElementById('stage-label').innerText = data.message;

            if (data.stage === 'VERTICAL_START') {
                const p = Math.round((data.index / 16) * 90);
                document.getElementById('progress-fill').style.width = p + '%';
                document.getElementById('percentage-label').innerText = p + '%';
                const n = document.getElementById('node-' + data.index);
                if (n && !n.classList.contains('active')) { 
                    n.classList.add('active'); 
                    addLog('[' + data.vertical + '] Analyzing sector context...'); 
                }
            }
            if (data.stage === 'VERTICAL_COMPLETE') {
                const n = document.getElementById('node-' + data.index);
                if (n && !n.classList.contains('complete')) {
                    n.classList.remove('active'); 
                    n.classList.add('complete'); 
                    addLog('[' + data.vertical + '] Sector Analysis Complete.', 'success');
                }
            }
            if (data.stage === 'CONSENSUS_START') {
                document.getElementById('consensus-status').innerText = '10-AGENT_ACTIVE';
                document.getElementById('consensus-status').style.color = '#BFA100';
            }
        }

        // --- HARDENED POLL LOOP: 1.5s interval ---
        setInterval(pollTelemetry, 1500);
        pollTelemetry(); // Immediate trigger
    </script>
</body>
</html>
`;

/**
 * Registry Stubs to satisfy Wrangler Global Bindings
 */
export class DataIngestorS { constructor(state) { this.state = state; } async fetch(req) { return new Response("DH_STUB"); } }
export class ManuscriptAggregatorS { constructor(state) { this.state = state; } async fetch(req) { return new Response("MA_STUB"); } }

// --- TRANSITION STUBS (V5.4.2) ---
// We keep the original class exports to satisfy existing live bindings in other scripts.
// These will be fully removed once pulse and mirofish have successfully migrated to the *S classes.
export class MiroSync { constructor(state) { this.state = state; } async fetch(req) { return new Response("LEGACY_STUB"); } }
export class DataIngestor { constructor(state) { this.state = state; } async fetch(req) { return new Response("LEGACY_STUB"); } }
export class ManuscriptAggregator { constructor(state) { this.state = state; } async fetch(req) { return new Response("LEGACY_STUB"); } }
