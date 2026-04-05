/**
 * BlogsPro HIL Audit Station (V1.0)
 * ================================
 * Premium Human-in-the-Loop review dashboard for BlogsPro AI Swarm.
 */

import { initFirebase, getPendingAudits, updateAuditStatus } from "./lib/firebase-service.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 0. Security (Token Handshake)
    const clientToken = url.searchParams.get("token") || request.headers.get("X-Swarm-Token");
    if (!clientToken || clientToken !== env.SWARM_INTERNAL_TOKEN) {
      return new Response("Unauthorized. Access denied.", { status: 403 });
    }

    // 1. API: Get Pending Audits
    if (url.pathname === "/api/pending") {
      const audits = await getPendingAudits();
      return new Response(JSON.stringify(audits), { headers: { "Content-Type": "application/json" } });
    }

    // 2. API: Action (Approve/Reject)
    if (url.pathname === "/api/action" && request.method === "POST") {
      const { id, action, feedback } = await request.json();
      await updateAuditStatus(id, action === 'approve' ? 'APPROVED' : 'REJECTED', feedback);
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    // 2.1 Telegram Webhook Gateway (Phase 8.1)
    if (url.pathname === "/telegram/webhook" && request.method === "POST") {
      const update = await request.json();
      if (update.callback_query) {
        const query = update.callback_query;
        const [action, auditId] = query.data.split(':');
        
        await updateAuditStatus(auditId, action === 'approve' ? 'APPROVED' : 'REJECTED', `via Telegram (${query.from.username})`);
        
        // Respond to Telegram to stop loading spinner & update message
        const botToken = env.TELEGRAM_BOT_TOKEN;
        const feedbackText = `✅ Manuscript ${auditId.slice(-6)} ${action.toUpperCase()}D by @${query.from.username}`;
        
        await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: query.id, text: feedbackText })
        });

        await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text: `${query.message.text}\n\n📝 *RESULT:* \`${action.toUpperCase()}D\` by @${query.from.username}`
          })
        });
      }
      return new Response("OK");
    }

    // 3. Serve Dashboard UI
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BlogsPro | HIL Audit Station</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
        <style>
            :root {
                --gold: #BFA100;
                --slate: #F8FAFC;
                --carbon: #0F172A;
                --muted: #94A3B8;
                --glass: rgba(255, 255, 255, 0.03);
            }
            body {
                background: var(--carbon);
                color: var(--slate);
                font-family: 'Outfit', sans-serif;
                margin: 0;
                display: flex;
                height: 100vh;
                overflow: hidden;
            }
            #sidebar {
                width: 320px;
                background: rgba(0, 0, 0, 0.3);
                border-right: 1px solid rgba(255, 255, 255, 0.05);
                display: flex;
                flex-direction: column;
            }
            .sidebar-header {
                padding: 24px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }
            .sidebar-header h1 {
                font-size: 1.2rem;
                margin: 0;
                color: var(--gold);
                letter-spacing: 2px;
                text-transform: uppercase;
            }
            #audit-list {
                flex: 1;
                overflow-y: auto;
            }
            .audit-item {
                padding: 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.03);
                cursor: pointer;
                transition: 0.2s;
            }
            .audit-item:hover { background: var(--glass); }
            .audit-item.active { background: rgba(191, 161, 0, 0.1); border-left: 4px solid var(--gold); }
            .audit-item h3 { margin: 0 0 8px 0; font-size: 0.9rem; }
            .audit-item p { margin: 0; font-size: 0.8rem; color: var(--muted); }

            #main {
                flex: 1;
                display: flex;
                flex-direction: column;
                background: radial-gradient(circle at top right, rgba(191, 161, 0, 0.05), transparent);
            }
            #toolbar {
                padding: 16px 40px;
                background: rgba(0, 0, 0, 0.2);
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            #content {
                flex: 1;
                padding: 60px 10%;
                overflow-y: auto;
                font-family: 'Inter', sans-serif;
                line-height: 1.8;
            }
            .btn {
                padding: 10px 24px;
                border-radius: 8px;
                border: none;
                cursor: pointer;
                font-weight: 600;
                transition: 0.3s;
                text-transform: uppercase;
                letter-spacing: 1px;
                font-size: 0.8rem;
            }
            .btn-approve { background: var(--gold); color: black; }
            .btn-approve:hover { filter: brightness(1.2); box-shadow: 0 0 20px rgba(191,161,0,0.3); }
            .btn-reject { background: transparent; color: #ef4444; border: 1px solid #ef4444; }
            .btn-reject:hover { background: #ef4444; color: white; }

            /* Markdown Styling */
            #markdown-preview h2 { color: var(--gold); border-bottom: 1px solid rgba(191,161,0,0.2); padding-bottom: 8px; margin-top: 40px; }
            #markdown-preview table { width: 100%; border-collapse: collapse; margin: 20px 0; background: var(--glass); }
            #markdown-preview th, #markdown-preview td { border: 1px solid rgba(255,255,255,0.05); padding: 12px; text-align: left; }
            #markdown-preview th { background: rgba(255,255,255,0.03); color: var(--gold); font-size: 0.8rem; text-transform: uppercase; }
            #markdown-preview chart-data { display: block; background: #000; color: #0f0; padding: 10px; font-family: monospace; font-size: 0.8rem; border-radius: 4px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div id="sidebar">
            <div class="sidebar-header">
                <h1>HIL Station</h1>
            </div>
            <div id="audit-list">
                <div style="padding:40px; text-align:center; color:var(--muted)">Loading pending audits...</div>
            </div>
        </div>
        <div id="main">
            <div id="toolbar">
                <div id="current-title">Select a manuscript...</div>
                <div id="actions" style="display:none">
                    <button class="btn btn-reject" onclick="handleAction('reject')">Reject</button>
                    <button class="btn btn-approve" onclick="handleAction('approve')">Approve & Publish</button>
                </div>
            </div>
            <div id="content">
                <div id="markdown-preview"></div>
            </div>
        </div>

        <script>
            let currentId = null;
            let audits = [];

            async function loadAudits() {
                const res = await fetch(\`/api/pending?token=${clientToken}\`);
                audits = await res.json();
                renderList();
            }

            function renderList() {
                const list = document.getElementById('audit-list');
                if (audits.length === 0) {
                    list.innerHTML = '<div style="padding:40px; text-align:center; color:var(--muted)">All caught up! No pending audits.</div>';
                    return;
                }
                list.innerHTML = audits.map(a => \`
                    <div class="audit-item \${a.id === currentId ? 'active' : ''}" onclick="selectAudit('\${a.id}')">
                        <h3>\${a.frequency.toUpperCase()} :: \${a.jobId.slice(-6)}</h3>
                        <p>Generated: \${new Date(a.metadata.generatedAt).toLocaleTimeString()}</p>
                    </div>
                \`).join('');
            }

            function selectAudit(id) {
                currentId = id;
                const audit = audits.find(a => a.id === id);
                document.getElementById('current-title').innerText = \`Reviewing: \${audit.jobId}\`;
                document.getElementById('markdown-preview').innerHTML = marked.parse(audit.content);
                document.getElementById('actions').style.display = 'flex';
                renderList();
            }

            async function handleAction(action) {
                if (!confirm(\`Are you sure you want to \${action} this manuscript?\`)) return;
                const res = await fetch(\`/api/action?token=${clientToken}\`, {
                    method: 'POST',
                    body: JSON.stringify({ id: currentId, action })
                });
                if (res.ok) {
                    audits = audits.filter(a => a.id !== currentId);
                    currentId = null;
                    document.getElementById('markdown-preview').innerHTML = '';
                    document.getElementById('actions').style.display = 'none';
                    document.getElementById('current-title').innerText = 'Select a manuscript...';
                    renderList();
                }
            }

            loadAudits();
        </script>
    </body>
    </html>
    `;

    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }
};
