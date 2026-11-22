// miro-terminal-html.js — the MiroSync swarm terminal page (GET /terminal).
// Served by both the Cloudflare Durable Object and the VPS Node service; all its fetches are relative,
// so it talks to whichever host served it.
import { chartPageAssets } from "../../js/chart-engine/index.js";

export const TERMINAL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BlogsPro Institutional Swarm Terminal | V7.0</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;700&family=JetBrains+Mono&display=swap" rel="stylesheet">
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
        .chart-container { min-height: 160px; width: 100%; }
        /* Engine figures arrive server-rendered with their own card chrome; sit them flush in the panels. */
        .chart-host > .bp-chart { margin: 0 !important; padding: 0 !important; border: 0 !important; background: transparent !important; }
        /* Fallback for browsers without container queries: the engine CSS below swaps in the narrow SVG in the
           ~250px sidebar; without it, scale the 480px-min wide SVG down rather than scroll, so both OASIS gauges
           stay visible. Exact values remain in each chart's "View data" table. */
        #chart_latency svg, #chart_oasis svg { min-width: 0 !important; }

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
    ${chartPageAssets()}
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
                    <div id="chart_latency" class="chart-container chart-host"></div>
                </div>

                <div class="panel">
                    <div class="stat-label">OASIS [GHOST vs LIVE]</div>
                    <div id="chart_oasis" class="chart-container chart-host"></div>
                </div>
            </section>
        </aside>

        <!-- CENTER: OBSERVATORY -->
        <section class="pane" style="background: radial-gradient(circle at top, #0A0A0A, #050505);">
            <div class="pane-header">Consensus Observatory</div>
            <section>
                <div class="panel" style="border-color: #333;">
                    <div class="stat-label">Disagreement Heatmap (Variance Matrices)</div>
                    <div id="chart_heatmap" class="chart-host" style="min-height: 250px;"></div>
                </div>

                <div class="panel" style="border-color: #333;">
                    <div class="stat-label">Alignment Evolution (Institutional Drift)</div>
                    <div id="chart_timeline" class="chart-host" style="min-height: 180px;"></div>
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
        // Chart panels arrive as server-rendered SVG/HTML from /telemetry/charts (shared chart engine).
        // A null section means no new data: keep whatever the panel last showed.
        const CHART_HOSTS = { latency: 'chart_latency', heatmap: 'chart_heatmap', timeline: 'chart_timeline', oasis: 'chart_oasis' };

        async function updateCharts() {
            const res = await fetch('/telemetry/charts');
            if (!res.ok) throw new Error('charts HTTP ' + res.status);
            const charts = await res.json();
            if (!charts) return;
            Object.entries(CHART_HOSTS).forEach(([key, id]) => {
                if (charts[key] !== null) document.getElementById(id).innerHTML = charts[key];
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
                    await updateCharts();
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

        poll();

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
`;
