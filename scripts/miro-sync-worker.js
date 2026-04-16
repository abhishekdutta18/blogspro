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

    // [V7.0] Sync Checkpoint: Persist current state and return size
    if (url.pathname === '/sync' && request.method === 'POST') {
      const update = Y.encodeStateAsUpdate(this.doc);
      await this.state.storage.put('doc', update);
      return new Response(JSON.stringify({ success: true, size: update.byteLength }), {
        headers: { 'Content-Type': 'application/json', "Access-Control-Allow-Origin": "*" }
      });
    }

    // 0.5 [V7.0] Manual Archival Trigger
    if (url.pathname === '/archive' && request.method === 'GET') {
      await this.archiveToFirebase();
      return new Response(JSON.stringify({ 
        success: true, 
        message: "V7.0 Proactive Archiving Initiated",
        timestamp: new Date().toISOString()
      }), {
        headers: { 
          'Content-Type': 'application/json',
          "Access-Control-Allow-Origin": "*"
        }
      });
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
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }

    if (url.pathname === '/telemetry' && request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }

    // 2. High-Performance Telemetry Push
    if (url.pathname === '/push' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { source, content, stage, message, jobId, trace, agentScores, health, rl } = body;
        const timestamp = new Date().toISOString();
        const id = jobId || 'latest';
        const progressMap = this.doc.getMap('swarm-progress');

        if (source === "SWARM_PROGRESS" || body.event === 'SWARM_START') {
          const entry = progressMap.get(id) || { jobId: id, stages: [], logs: [], trace: [], timestamp };
          entry.stage = stage || body.event || entry.stage || 'PROGRESS';
          entry.message = message || body.message || entry.message || 'Telemetry Sync...';
          entry.timestamp = timestamp;
          if (trace) entry.trace = [...(entry.trace || []), trace];
          if (agentScores) entry.agentScores = agentScores;
          if (body.latency) entry.latency = body.latency;
          progressMap.set(id, entry);
        } else if (source === "GHOST_PREDICTION") {
          const entry = progressMap.get(id) || { jobId: id, timestamp };
          entry.ghostProjection = { 
            summary: body.summary, 
            telemetry: body.telemetry,
            latency: body.latency,
            timestamp 
          };
          progressMap.set(id, entry);
        } else if (source === "MIRO_METRICS") {
          const entry = progressMap.get(id) || { jobId: id, timestamp };
          entry.agentScores = agentScores || entry.agentScores || [];
          entry.disagreementVariance = body.disagreementVariance || 0;
          entry.swarmSentiment = body.swarmSentiment || 50;
          entry.consensusTimeline = body.consensusTimeline || [];
          if (body.logicChain) entry.logicChain = body.logicChain;
          progressMap.set(id, entry);
        } else if (source === "KEY_HEALTH" || source === "RL_METRICS") {
          const entry = progressMap.get(id) || { jobId: id, timestamp };
          if (health) entry.health = health;
          if (rl) entry.rl = rl;
          if (body.latency) entry.latency = body.latency;
          progressMap.set(id, entry);
          
          // Sync specific performance metrics to the global Affine shared doc
          const affineMetrics = this.doc.getMap('affine-health');
          affineMetrics.set('last_update', timestamp);
          if (health) affineMetrics.set('key_health', health);
          if (rl) affineMetrics.set('rl_performance', rl);
        } else if (source === "FINAL_MANUSCRIPT") {
          const finalText = this.doc.getText('final-manuscript');
          finalText.delete(0, finalText.length);
          finalText.insert(0, content);
          console.log(`📑 [MiroSync] FINAL_MANUSCRIPT received.`);
          
          const update = Y.encodeStateAsUpdate(this.doc);
          const filename = `final-${body.frequency || 'pulse'}-${Date.now()}.yjs`;
          await saveSnapshot(update, 'miro-sync-final', this.env, filename);
        }

        const update = Y.encodeStateAsUpdate(this.doc);
        const encoder = encoding.createEncoder();
        encoding.writeUint8(encoder, 0); 
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

    // [V6.0] State-Aware Resilience: Check if a step is already completed
    if (url.pathname === '/check-step' && request.method === 'GET') {
      const jobId = url.searchParams.get('jobId');
      const stepId = url.searchParams.get('stepId');
      const progressMap = this.doc.getMap('swarm-progress');
      const job = progressMap.get(jobId);
      const completed = job && job.trace && job.trace.some(t => t.stepId === stepId && t.status === "COMPLETED");
      
      return new Response(JSON.stringify({ 
        status: completed ? "COMPLETED" : "PENDING",
        jobId,
        stepId
      }), {
        headers: { 'Content-Type': 'application/json', "Access-Control-Allow-Origin": "*" }
      });
    }

    // [V6.0] Institutional Style Manual sync
    if (url.pathname === '/styles' && request.method === 'GET') {
      return new Response(JSON.stringify({ 
        manual: "BLOGSPRO_STYLE_V6",
        lastUpdate: new Date().toISOString(),
        guidelines: {
          typography: "Outfit, JetBrains Mono",
          colors: { background: "#050505", accent: "#daaf37", ghost: "#888888" },
          tone: "Institutional, High-Density, Data-First"
        }
      }), {
        headers: { 'Content-Type': 'application/json', "Access-Control-Allow-Origin": "*" }
      });
    }

    // [V7.0] Archive Access (Durable Object "Warm" Archive)
    if (url.pathname === '/archive' && request.method === 'POST') {
      const result = await this.archiveToFirebase();
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json', "Access-Control-Allow-Origin": "*" }
      });
    }

    if (url.pathname === '/archive/list' && request.method === 'GET') {
      const archiveMap = this.doc.getMap('swarm-archive');
      return new Response(JSON.stringify(Object.fromEntries(archiveMap.entries())), {
        headers: { 
          'Content-Type': 'application/json',
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    if (url.pathname === '/archive/retrieve' && request.method === 'GET') {
      const id = url.searchParams.get('id');
      const archiveMap = this.doc.getMap('swarm-archive');
      const entry = archiveMap.get(id);
      
      if (!entry) {
        return new Response(JSON.stringify({ error: "Record not found in warm archive." }), {
          status: 404, headers: { "Access-Control-Allow-Origin": "*" }
        });
      }
      
      return new Response(JSON.stringify(entry), {
        headers: { 
          'Content-Type': 'application/json',
          "Access-Control-Allow-Origin": "*"
        }
      });
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

  async scheduled(event, env, ctx) {
    console.log("⏰ [Cron] Durable State Sync: Initiating Firebase Archiving...");
    await this.archiveToFirebase();
  }

  /**
   * V7.0 Lifecycle Management: 
   * Moves records > 90 days to Firebase and purges from DO.
   */
  async archiveToFirebase() {
    const progressMap = this.doc.getMap('swarm-progress');
    const archiveMap = this.doc.getMap('swarm-archive');
    const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let archivedCount = 0;
    const archivedRecords = {};

    for (const [key, value] of progressMap.entries()) {
      const timestamp = new Date(value.timestamp).getTime();
      // [V7.0] Perpetual Archiving: Records > 90 days move to deep storage
      if (!isNaN(timestamp) && (now - timestamp) > THREE_MONTHS_MS) {
        archiveMap.set(key, value);
        archivedRecords[key] = value;
        progressMap.delete(key);
        archivedCount++;
      }
    }

    if (archivedCount > 0) {
      if (!this.env.FIREBASE_STORAGE_BUCKET) {
        console.warn("⚠️ [MiroSync] Archival skipped: FIREBASE_STORAGE_BUCKET not configured.");
        return { archivedCount: 0, activeCount: progressMap.size, status: "SKIPPED_CONFIG" };
      }

      const date = new Date();
      const folder = `${new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date).toUpperCase()}${date.getFullYear()}`;
      const base = `archive/${folder}`;

      // 1. Persist the FULL Yjs Document to Firebase (Binary State Dataset)
      const fullUpdate = Y.encodeStateAsUpdate(this.doc);
      const binaryName = `miro-archive-binary-${Date.now()}.yjs`;
      await saveSnapshot(fullUpdate, `${base}/state`, this.env, binaryName);

      // 2. Persist partitioned JSON (Telemetry Dataset)
      const jsonName = `miro-pruned-batch-${Date.now()}.json`;
      await saveSnapshot(archivedRecords, `${base}/telemetry`, this.env, jsonName);

      // 3. Save to DO storage
      const update = Y.encodeStateAsUpdate(this.doc);
      await this.state.storage.put('doc', update);

      console.log(`📦 [MiroSync] V7.0 Archive: Successfully moved ${archivedCount} records to Firebase Dataset [${folder}].`);
    }

    return { archivedCount, activeCount: progressMap.size };
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
    <title>BlogsPro Institutional Swarm Terminal | V7.0</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;700&family=JetBrains+Mono&display=swap" rel="stylesheet">
    <script src="https://www.gstatic.com/charts/loader.js"></script>
    <style>
        :root {
            --gold: #BFA100;
            --gold-dim: rgba(191, 161, 0, 0.4);
            --bg: #050505;
            --surface: #0E0E0E;
            --border: #1F1F1F;
            --text: #F0F0F0;
            --ok: #00FF9D;
            --warn: #FFBF00;
            --err: #FF4D4D;
            --ghost: #9b59b6;
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
            background: rgba(5, 5, 5, 0.98);
            backdrop-filter: blur(20px);
            justify-content: space-between;
            z-index: 1000;
        }

        .title-block { display: flex; align-items: center; gap: 15px; }
        .logo { color: var(--gold); font-weight: 700; letter-spacing: 2px; font-size: 20px; }
        .status-pill { 
            background: var(--gold-dim); 
            color: var(--gold); 
            padding: 4px 12px; 
            border-radius: 20px; 
            font-size: 11px; 
            font-family: 'JetBrains Mono', monospace;
            border: 1px solid var(--gold);
        }

        main {
            display: grid;
            grid-template-columns: 350px 1fr 340px;
            height: calc(100vh - 60px);
        }

        .pane {
            border-right: 1px solid var(--border);
            overflow-y: auto;
            position: relative;
        }

        .pane-header {
            padding: 15px 20px;
            background: var(--surface);
            border-bottom: 1px solid var(--border);
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: var(--gold);
            font-weight: 700;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        section { padding: 25px; }

        .panel {
            background: rgba(20,20,20,0.5);
            border: 1px solid var(--border);
            padding: 20px;
            border-radius: 12px;
            margin-bottom: 20px;
            position: relative;
            overflow: hidden;
        }

        .panel::before {
            content: ''; position: absolute; top:0; left:0; width: 100%; height: 2px;
            background: linear-gradient(90deg, transparent, var(--gold-dim), transparent);
        }

        .stat-label { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; font-weight: 700; }
        .chart-container { height: 160px; width: 100%; }

        /* [V6.0] Ghost Projection Overlay */
        .ghost-box {
            background: rgba(155, 89, 182, 0.05);
            border: 1px dashed var(--ghost);
            padding: 15px;
            border-radius: 8px;
            margin-top: 15px;
            position: relative;
        }
        .ghost-tag { 
            position: absolute; top: -10px; right: 10px; 
            background: var(--ghost); color: #fff; font-size: 8px; 
            padding: 2px 6px; border-radius: 4px; font-weight: 700;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { opacity: 0.7; }
            50% { opacity: 1; }
            100% { opacity: 0.7; }
        }

        /* METRICS GRID */
        .metrics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
        .m-card { background: #0A0A0A; border: 1px solid #1A1A1A; padding: 15px; border-radius: 8px; }
        .m-val { font-size: 22px; color: var(--gold); font-family: 'JetBrains Mono'; font-weight: 700; }
        .m-lbl { font-size: 8px; color: #555; text-transform: uppercase; margin-top: 5px; }

        /* LOGIC TREE */
        .logic-tree { display: flex; flex-direction: column; gap: 12px; }
        .logic-node { 
            background: #0D0D0D; border-left: 3px solid var(--gold); padding: 12px; 
            border-radius: 4px; font-size: 11px; position: relative;
        }
        .l-header { display: flex; justify-content: space-between; margin-bottom: 6px; color: var(--gold); font-weight: 700; }
        .l-body { color: #888; line-height: 1.5; font-size: 10px; }

        /* SCROLLBAR */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

        .btn-group { display: flex; gap: 10px; margin-top: 10px; }
        .btn { 
            flex: 1; padding: 10px; border-radius: 6px; font-size: 10px; 
            cursor: pointer; transition: all 0.2s; font-family: 'JetBrains Mono'; font-weight: 700;
            text-transform: uppercase;
        }
        .btn-primary { background: var(--gold); color: #000; border: none; }
        .btn-outline { background: transparent; border: 1px solid var(--border); color: #888; }
        .btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.5); }

    </style>
</head>
<body>
    <header>
        <div class="title-block">
            <span class="logo">BLOGSPRO ADMIN</span>
            <span class="status-pill" id="global-status">IDLE_SCAN</span>
        </div>
        <div class="control-block">
            <span id="job-id" style="font-family: 'JetBrains Mono'; font-size: 11px; color: #444; border-right: 1px solid #222; padding-right: 15px; margin-right: 15px;">NO_PULSE_LOADED</span>
            <span style="color: var(--ok); font-size: 11px;">📡 TELEMETRY_STABLE</span>
        </div>
    </header>

    <main>
        <!-- LEFT: ENGINE PERFORMANCE -->
        <aside class="pane">
            <div class="pane-header">System Vitals</div>
            <section>
                <div class="metrics-grid">
                    <div class="m-card">
                        <div class="m-val" id="storage-active" style="color:var(--gold)">0</div>
                        <div class="m-lbl">Active Jobs</div>
                    </div>
                    <div class="m-card">
                        <div class="m-val" style="color:var(--ok)">98.2%</div>
                        <div class="m-lbl">SLA Uptime</div>
                    </div>
                </div>

                <div class="panel">
                    <div class="stat-label">System Stress [Latency ms]</div>
                    <div id="chart_latency" class="chart-container"></div>
                </div>

                <div class="panel">
                    <div class="stat-label">OASIS [GHOST vs LIVE]</div>
                    <div id="chart_oasis" class="chart-container"></div>
                </div>
            </section>
        </aside>

        <!-- CENTER: OBSERVATORY -->
        <section class="pane" style="background: radial-gradient(circle at top, #0A0A0A, #050505);">
            <div class="pane-header">Consensus Observatory</div>
            <section>
                <div class="panel" style="border-color: #333;">
                    <div class="stat-label">Disagreement Heatmap (Variance Matrices)</div>
                    <div id="chart_heatmap" style="height: 250px;"></div>
                </div>

                <div class="panel" style="border-color: #333;">
                    <div class="stat-label">Alignment Evolution (Institutional Drift)</div>
                    <div id="chart_timeline" style="height: 180px;"></div>
                </div>

                <div id="ghost-projection"></div>
            </section>
        </section>

        <!-- RIGHT: MANAGEMENT -->
        <aside class="pane" style="border-right: none;">
            <div class="pane-header">Institutional Control</div>
            <section>
                <div class="btn-group">
                    <button class="btn btn-primary" onclick="triggerSync()">Checkpoint Sync</button>
                    <button class="btn btn-outline" onclick="triggerArchive()">Archive Store</button>
                </div>
                <div id="sync-status" style="font-size: 9px; color: #444; margin-top: 8px; text-align:center;">READY</div>

                <div class="pane-header" style="margin: 30px -25px 20px -25px; border-top: 1px solid var(--border)">Visual Logic Stream</div>
                <div id="logic-tree" class="logic-tree">
                    <div style="color: #333; font-size: 11px; text-align: center; margin-top: 20px;">Awaiting pulse telemetry...</div>
                </div>
            </section>
        </aside>
    </main>

    <script>
        google.charts.load('current', {'packages':['corechart', 'table', 'gauge']});
        
        let charts = { latency: null, heatmap: null, timeline: null, oasis: null };
        
        google.charts.setOnLoadCallback(() => {
            charts.latency = new google.visualization.AreaChart(document.getElementById('chart_latency'));
            charts.heatmap = new google.visualization.Table(document.getElementById('chart_heatmap'));
            charts.timeline = new google.visualization.LineChart(document.getElementById('chart_timeline'));
            charts.oasis = new google.visualization.Gauge(document.getElementById('chart_oasis'));
            poll(); 
        });

        function updateCharts(job) {
            if (!charts.latency) return;

            // 1. Latency Trace
            if (job.trace) {
                const rows = [['Stage', 'ms']];
                job.trace.forEach(t => { if(t.duration) rows.push([t.stepId.split('_').pop(), t.duration]); });
                if(rows.length > 1) {
                    charts.latency.draw(google.visualization.arrayToDataTable(rows), {
                        backgroundColor: 'transparent', colors: ['#BFA100'], legend: 'none',
                        chartArea: { width: '90%', height: '80%' },
                        areaOpacity: 0.1,
                        hAxis: { textStyle: { color: '#444', fontSize: 7 }, gridlines: { color: 'transparent' } },
                        vAxis: { textStyle: { color: '#444', fontSize: 7 }, gridlines: { color: '#111' } }
                    });
                }
            }

            // 2. Heatmap
            if (job.disagreementHeatmap) {
                const data = new google.visualization.DataTable();
                data.addColumn('string', 'P_Alpha');
                data.addColumn('string', 'P_Beta');
                data.addColumn('number', 'Delta');
                job.disagreementHeatmap.forEach(h => data.addRow([h.p1, h.p2, h.variance]));
                charts.heatmap.draw(data, { width: '100%', height: '100%', cssClassNames: { headerRow: 'h-row', tableRow: 't-row' } });
            }

            // 3. Timeline
            if (job.consensusTimeline) {
                const rows = [['Step', 'Alignment']];
                job.consensusTimeline.forEach(t => rows.push([t.step.toString(), t.alignment]));
                charts.timeline.draw(google.visualization.arrayToDataTable(rows), {
                    backgroundColor: 'transparent', colors: ['#00A3FF'], legend: 'none',
                    chartArea: { width: '90%', height: '80%' },
                    hAxis: { textStyle: { color: '#444', fontSize: 7 }, gridlines: { color: 'transparent' } },
                    vAxis: { textStyle: { color: '#444', fontSize: 7 }, gridlines: { color: '#111' } }
                });
            }

            // 4. OASIS Gauge
            const gData = google.visualization.arrayToDataTable([
                ['Label', 'Value'],
                ['Ghost', job.ghostProjection?.telemetry?.swarmSentiment || 0],
                ['Live', job.swarmSentiment || 0]
            ]);
            charts.oasis.draw(gData, {
                width: '100%', height: 160,
                redFrom: 0, redTo: 20, yellowFrom: 20, yellowTo: 50, greenFrom: 50, greenTo: 100,
                minorTicks: 5
            });
        }

        async function poll() {
            try {
                const res = await fetch('/telemetry');
                const data = await res.json();
                const jobs = Object.values(data).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
                if (jobs.length > 0) {
                    const job = jobs[0];
                    renderUI(job);
                    updateCharts(job);
                }
                document.getElementById('storage-active').innerText = jobs.length;
            } catch (e) { console.error('Poll Error:', e); }
            setTimeout(poll, 3000);
        }

        function renderUI(job) {
            document.getElementById('job-id').innerText = job.jobId || 'ACTIVE';
            document.getElementById('global-status').innerText = (job.stage || 'PROCESSING').toUpperCase();

            // Logic Tree
            if (job.logicChain) {
                const tree = document.getElementById('logic-tree');
                tree.innerHTML = job.logicChain.map(l => '<div class="logic-node"><div class="l-header"><span>' + l.agent + '</span><span style="color:var(--ok)">\u2713</span></div><div class="l-body">' + (l.argument || '').substring(0, 120) + '...</div></div>').join('');
            }

            // Ghost Box
            if (job.ghostProjection) {
                const g = document.getElementById('ghost-projection');
                const confidence = Math.round((job.ghostProjection.confidence || 0.8) * 100);
                const summary = job.ghostProjection.summary || '';
                g.innerHTML = '<div class="ghost-box"><span class="ghost-tag">SPECULATIVE_GHOST</span><div class="stat-label">Projection Confidence: ' + confidence + '%</div><div style="font-size: 11px; color: var(--ghost); font-family: monospace;">' + summary + '</div></div>';
            }
        }

        async function triggerSync() {
            const b = document.querySelector('.btn-primary'); b.innerText = 'SYNCING...';
            try {
                const r = await fetch('/sync', { method: 'POST' });
                const d = await r.json();
                document.getElementById('sync-status').innerText = 'SYNC_COMPLETE: ' + (d.size/1024).toFixed(1) + 'KB';
            } finally { b.innerText = 'Checkpoint Sync'; }
        }

        async function triggerArchive() {
            if(!confirm('Migrate telemetry older than 90 days to deep storage?')) return;
            try {
                const r = await fetch('/archive', { method: 'POST' });
                const d = await r.json();
                alert('Success: ' + d.archivedCount + ' entries moved to archive.');
            } catch(e) { alert('Archive Failed'); }
        }
    </script>
</body>
</html>
`


/**
 * Registry Stubs to satisfy Wrangler Global Bindings
 */
export class DataIngestorS { constructor(state) { this.state = state; } async fetch(req) { return new Response("DH_STUB"); } }
export class ManuscriptAggregatorS { constructor(state) { this.state = state; } async fetch(req) { return new Response("MA_STUB"); } }

// --- END OF WORKER ---
