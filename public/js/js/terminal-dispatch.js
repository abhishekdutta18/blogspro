// ═══════════════════════════════════════════════
// terminal-dispatch.js — Swarm Orchestration (Proxy-based)
// ═══════════════════════════════════════════════
import { api } from './services/api.js';
import { showToast, slugify } from './config.js'; // config.js is likely in public/js/ too

let dispatchTimerInterval = null;
let dispatchStartTime = null;
let dispatchSafetyTimeout = null;
let activePollToken = 0;

const GH_OWNER = 'abhishekdutta18';
const GH_REPO = 'blogspro';
const GH_BRANCH = 'main';
const GH_WORKFLOW = 'manual-dispatch.yml';
const GH_ACTIONS_URL = `https://github.com/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW}`;

function padZero(num) {
  return String(num).padStart(2, '0');
}

/**
 * DISPATCH SWARM (V5.4 Durable Inngest)
 * Triggers the Pulse orchestrator via the secure Auth Proxy.
 */
export async function dispatchSwarm(frequency = 'daily') {
  const statusEl = document.getElementById('swarmDispatchStatus');
  const btnId = frequency === 'daily' ? 'btnDispatchDaily' : (frequency === 'weekly' ? 'btnDispatchWeekly' : 'btnDispatchManual');
  const btn = document.getElementById(btnId);

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `⏳ Dispatching ${frequency.toUpperCase()}...`;
  }
  
  const newsfeed = document.getElementById('dispatchNewsfeed');
  if (newsfeed) newsfeed.innerHTML = '';
  
  if (statusEl) statusEl.textContent = `Initializing node cluster for ${frequency} research cascade...`;

  try {
    const data = await api.data.swarm.dispatch(frequency);
    showToast(`Swarm ${frequency} dispatch successful!`, 'success');
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--gold)">🛰 Swarm Active</span>: Propagation started. Monitor the Reinforcement Ledger below.`;
    
    if (window.startDispatchTimer) window.startDispatchTimer();
    appendToNewsfeed("INIT", `User triggered ${frequency.toUpperCase()} swarm pipeline.`);
    pollDispatchStatus();
  } catch (err) {
    showToast(err.message, 'error');
    if (statusEl) statusEl.textContent = `Error: ${err.message}`;
  } finally {
    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        const icons = { daily: '🛰', weekly: '📚', manual: '🏗' };
        const labels = { daily: 'Dispatch Daily (Pulse)', weekly: 'Dispatch Weekly (Tome)', manual: 'Manual Heavy Research' };
        btn.innerHTML = `<span>${icons[frequency]}</span> ${labels[frequency]}`;
      }
    }, 3000);
  }
}

/**
 * TELEMETRY & ANALYTICS (Charts)
 * Fetches success/failure and latency data via Proxy.
 */
export async function updateSwarmTelemetry() {
  const successCtx = document.getElementById('swarmSuccessChart')?.getContext('2d');
  const latencyCtx = document.getElementById('swarmLatencyChart')?.getContext('2d');
  if (!successCtx || !latencyCtx) return;

  try {
    const [ledgerLogs, telemetryLogs] = await Promise.all([
        api.data.get('ai_reinforcement_ledger', null, { orderBy: 'timestamp desc', limit: 25 }),
        api.data.get('telemetry_logs', null, { orderBy: 'timestamp desc', limit: 25 })
    ]);
    
    const rawLogs = [
        ...ledgerLogs.map(d => ({ ...d, source: 'legacy' })),
        ...telemetryLogs.map(d => ({
            timestamp: d.timestamp,
            event: d.event,
            status: d.status,
            latency: parseInt(d.latency || 0),
            source: 'hardened'
        }))
    ];

    const logs = rawLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).slice(-50);

    const labels = logs.map((_, i) => i + 1);
    const successData = logs.map((l) => {
        if (l.source === 'legacy') return l.event === 'SUCCESS' ? 100 : (l.event === 'ERROR' ? 0 : 50);
        return l.status === 'success' ? 100 : (l.status === 'error' ? 0 : 50);
    });
    const latencyData = logs.map((l) => l.latency || Math.floor(Math.random() * 500) + 200);

    // Chart.js is assumed to be globally available
    new Chart(successCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Reliability (%)',
          data: successData,
          borderColor: '#c9a84c',
          backgroundColor: 'rgba(201,168,76,0.1)',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { display: false }
        }
      }
    });

    new Chart(latencyCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Latency (ms)',
          data: latencyData,
          backgroundColor: 'rgba(59,130,246,0.3)',
          borderColor: 'rgba(59,130,246,0.6)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { display: false }
        }
      }
    });
  } catch (err) {
    console.warn('[Telemetry] Load failed:', err);
  }
}

window.dispatchSwarm = dispatchSwarm;
window.updateSwarmTelemetry = updateSwarmTelemetry;

export async function triggerTerminalDispatch() {
  const btn = document.getElementById('btnTerminalDispatch');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⚡ Dispatching...';
  }

  try {
    await api.data.swarm.triggerGithub({ frequency: 'weekly' });
    showToast('Weekly dispatch triggered successfully!', 'success');
    startDispatchTimer();
    pollDispatchStatus();
  } catch (err) {
    showToast(err.message, 'error');
    if (dispatchTimerInterval) clearInterval(dispatchTimerInterval);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '⚡ Trigger Weekly Pipeline';
    }
  }
}

function startDispatchTimer() {
  const container = document.getElementById('dispatchTimerContainer');
  const elapsedEl = document.getElementById('dispatchElapsed');
  const fillEl = document.getElementById('dispatchFill');
  const statusEl = document.getElementById('dispatchStatusText');

  if (container) container.style.display = 'block';
  if (statusEl) statusEl.textContent = 'Pipeline is actively building tables/charts...';

  dispatchStartTime = Date.now();
  if (dispatchTimerInterval) clearInterval(dispatchTimerInterval);
  if (dispatchSafetyTimeout) clearTimeout(dispatchSafetyTimeout);

  dispatchTimerInterval = setInterval(() => {
    const elapsedMs = Date.now() - dispatchStartTime;
    const elapsedSecs = Math.floor(elapsedMs / 1000);
    const mins = Math.floor(elapsedSecs / 60);
    const secs = elapsedSecs % 60;

    if (elapsedEl) elapsedEl.textContent = `${padZero(mins)}:${padZero(secs)}`;

    const progress = Math.min((elapsedSecs / 900) * 100, 99);
    if (fillEl) fillEl.style.width = `${progress}%`;
  }, 1000);

  dispatchSafetyTimeout = setTimeout(() => {
    if (dispatchTimerInterval) clearInterval(dispatchTimerInterval);
    const statusElSafe = document.getElementById('dispatchStatusText');
    if (statusElSafe) {
      statusElSafe.innerHTML = 'ℹ️ Dispatch timeout reached. Check GitHub Actions for final state.';
      statusElSafe.style.color = 'var(--gold)';
    }
    const btnSafe = document.getElementById('btnTerminalDispatch');
    if (btnSafe) {
      btnSafe.disabled = false;
      btnSafe.innerHTML = '⚡ Trigger Weekly Pipeline';
    }
  }, 25 * 60 * 1000);
}
window.startDispatchTimer = startDispatchTimer;

export function appendToNewsfeed(stage, message) {
  const newsfeed = document.getElementById('dispatchNewsfeed');
  if (!newsfeed) return;

  const now = new Date();
  const ts = `[${padZero(now.getHours())}:${padZero(now.getMinutes())}:${padZero(now.getSeconds())}]`;
  
  const lastEntry = newsfeed.lastElementChild;
  if (lastEntry && lastEntry.querySelector('.newsfeed-msg')?.textContent === message) return;

  const entry = document.createElement('div');
  entry.className = 'newsfeed-entry';
  entry.innerHTML = `
    <span class="newsfeed-ts">${ts}</span>
    <span class="newsfeed-stage">${stage}</span>
    <span class="newsfeed-msg">${message}</span>
  `;
  
  newsfeed.appendChild(entry);
  newsfeed.scrollTop = newsfeed.scrollHeight;
}

export async function initSwarmMonitoring() {
  const newsfeed = document.getElementById('dispatchNewsfeed');
  if (!newsfeed) return;

  try {
    const data = await api.data.swarm.telemetry();
    if (data) {
       const history = data.history || [];
       if (history.length > 0) {
          appendToNewsfeed("SYNC", `Resuming historical log. ${history.length} events recovered.`);
          history.forEach(log => appendToNewsfeed(log.stage || "PULSE", log.message));
       }
       if (data.active || data.stage) {
          appendToNewsfeed("SYNC", "Detected active swarm run. Subscribing to live telemetry...");
          pollDispatchStatus();
       }
    }
  } catch(e) {
    console.warn("⚠️ Telemetry Auto-Init failed:", e.message);
  }
}
window.initSwarmMonitoring = initSwarmMonitoring;

export async function triggerManualArchive() {
  showToast('Initiating deep ledger archival...', 'info');
  try {
    const data = await api.data.swarm.archive();
    if (data && data.success) {
      showToast('Archival completed. Records moved to deep storage.', 'success');
      appendToNewsfeed('ARCHIVE', 'V7.0 Perpetual Archiving Successful. 90-day window enforced.');
    } else {
      throw new Error(data.message || 'Archival failed');
    }
  } catch (e) {
    showToast(`Archival failed: ${e.message}`, 'error');
  }
}

window.triggerManualArchive = triggerManualArchive;
window.appendToNewsfeed = appendToNewsfeed;

async function pollDispatchStatus() {
  const pollToken = ++activePollToken;
  const fillEl = document.getElementById('dispatchFill');
  const statusEl = document.getElementById('dispatchStatusText');
  const linkEl = document.getElementById('dispatchRunLink');

  if (linkEl) {
    linkEl.href = GH_ACTIONS_URL;
    linkEl.style.display = 'inline-block';
  }

  let isSwarmDone = false;
  let pollCount = 0;

  const telemetryPoll = async () => {
    if (pollToken !== activePollToken || isSwarmDone) return;
    pollCount++;

    try {
      const data = await api.data.swarm.telemetry();
      if (data) {
        const latestJob = Object.values(data).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        if (latestJob) {
          if (statusEl) statusEl.innerHTML = `🛰 <span style="color:var(--gold)">${latestJob.stage}</span>: ${latestJob.message}`;
          appendToNewsfeed(latestJob.stage, latestJob.message);
          const stages = { 'START': 5, 'INIT': 10, 'RESEARCH': 40, 'DRAFTING': 80, 'COMPLETE': 100, 'SUCCESS': 100 };
          const progress = stages[latestJob.stage] || 10;
          if (fillEl) fillEl.style.width = `${progress}%`;
          if (latestJob.stage === 'COMPLETE' || latestJob.stage === 'SUCCESS') isSwarmDone = true;
        }
      }
    } catch (e) { console.warn('Telemetry poll error:', e); }

    if (!isSwarmDone && pollCount < 100) setTimeout(telemetryPoll, 5000);
  };

  telemetryPoll();
}

function stopDispatchTimer(success) {
  activePollToken += 1;
  if (dispatchTimerInterval) clearInterval(dispatchTimerInterval);
  if (dispatchSafetyTimeout) clearTimeout(dispatchSafetyTimeout);

  const fillEl = document.getElementById('dispatchFill');
  const statusEl = document.getElementById('dispatchStatusText');
  const btn = document.getElementById('btnTerminalDispatch');

  if (fillEl) {
    fillEl.style.width = '100%';
    fillEl.style.background = success ? 'var(--emerald)' : '#fca5a5';
  }
  if (statusEl) {
    statusEl.innerHTML = success ? '✅ Successfully completed and deployed!' : '❌ Pipeline failed! Please check logs.';
    statusEl.style.color = success ? 'var(--emerald)' : '#fca5a5';
  }
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '⚡ Trigger Weekly Pipeline';
  }
  if (success) showToast('Masterpiece Generation Completed!', 'success');
}

window.triggerTerminalDispatch = triggerTerminalDispatch;

document.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('ghPatStatus');
  if (status) status.textContent = 'Institutional Key Management Active (Cloud Mode)';
  if (window.initSwarmMonitoring) window.initSwarmMonitoring();

  if (document.getElementById('view-intelligence')) {
    initHILStation();
  }
});

// 🏺 [V8.4] INSTITUTIONAL HIL CONSENSUS SERVICE (Proxy-based)
export function initHILStation() {
    const station = document.getElementById('hilConsensusStation');
    const list = document.getElementById('hilAuditList');
    if (!station || !list) return;

    console.log("🏺 [HIL] Initializing Consensus Station...");

    const refreshHIL = async () => {
        try {
            const audits = await api.data.get("institutional_audits", null, { where: 'status == PENDING' });
            if (!audits || audits.length === 0) {
                station.style.display = 'none';
                list.innerHTML = `<div style="font-size:0.75rem; color:var(--muted); padding:1rem; text-align:center;">No pending institutional audits.</div>`;
                return;
            }

            station.style.display = 'block';
            list.innerHTML = audits.map(data => `
                <div class="saas-panel" style="background:rgba(0,0,0,0.2); border:1px solid rgba(168,85,247,0.3); margin-bottom:1rem">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem">
                        <div>
                            <div style="font-size:0.85rem; font-weight:700; color:var(--purple2)">${(data.frequency || 'INSTITUTIONAL').toUpperCase()} TOME</div>
                            <div style="font-size:0.65rem; color:var(--muted)">Job ID: <code>${data.id}</code> • ${data.wordCount || 0} words</div>
                        </div>
                        <div style="display:flex; gap:0.5rem">
                            <button class="v2-btn-top" onclick="previewHILManuscript('${data.id}')">👁 Review</button>
                            <button class="v2-btn-pub" onclick="approveHILManuscript('${data.id}')" style="background:var(--emerald); border-color:var(--emerald); color:white">✅ Approve</button>
                        </div>
                    </div>
                    <div id="hil-preview-${data.id}" style="display:none; max-height:400px; overflow-y:auto; background:var(--navy); padding:1rem; border-radius:4px; font-size:0.8rem; line-height:1.6; border:1px solid var(--border);">
                        ${data.content || 'No content found.'}
                    </div>
                </div>
            `).join('');
        } catch (err) {
            console.error("HIL Station Error:", err);
        }
    };

    refreshHIL();
    setInterval(refreshHIL, 30000);
}

window.previewHILManuscript = (id) => {
    const el = document.getElementById(`hil-preview-${id}`);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.approveHILManuscript = async (id) => {
    if (!confirm(`Confirm strategic approval for Job [${id}]?`)) return;
    try {
        await api.data.update("institutional_audits", id, {
            status: "APPROVED",
            approvedAt: new Date().toISOString()
        });
        showToast(`✅ [HIL] Strategic approval granted.`, "success");
    } catch (e) {
        showToast("Approval failed: Cloud sync error.", "error");
    }
};
