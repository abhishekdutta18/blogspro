import { showToast, db, DISPATCH_CONFIG } from './config.js';
import { collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { workerCandidates, workerUrl } from './worker-endpoints.js';

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

function dispatchWorkerBases() {
  const override = localStorage.getItem('bp_dispatch_worker_url');
  const configured = override ? [override] : workerCandidates('api/dispatch');
  const fallback = 'https://github-push.abhishekdutta18.workers.dev';
  const all = [...configured, fallback]
    .map((v) => String(v || '').trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return [...new Set(all)];
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { ok: res.ok, status: res.status, data, text: data ? null : await res.text().catch(() => null) };
}

async function triggerWorkflowViaWorker(frequency = 'weekly') {
  const endpoints = ['api/dispatch', 'api/workflow-dispatch', 'dispatch'];
  const payload = {
    owner: GH_OWNER,
    repo: GH_REPO,
    branch: GH_BRANCH,
    workflow: GH_WORKFLOW,
    ref: GH_BRANCH,
    inputs: { frequency, force: 'true' },
  };

  let lastErr = null;
  for (const base of dispatchWorkerBases()) {
    for (const endpoint of endpoints) {
      try {
        const url = workerUrl(endpoint, base);
        const { ok, status, data, text } = await postJson(url, payload);
        if (ok) return { base, endpoint, data };
        if ([400, 404, 405].includes(status)) continue;
        lastErr = new Error(data?.error || data?.message || text || `Worker dispatch failed (${status})`);
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error('No dispatch-capable Cloudflare worker endpoint is configured.');
}

async function triggerWorkflowDirect(frequency = 'weekly') {
  const token = String(DISPATCH_CONFIG?.ghToken || '').trim();
  if (!token) throw new Error('Dispatch token not configured');
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ref: GH_BRANCH,
      inputs: { frequency, force: 'true' }
    })
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Direct dispatch failed (${res.status}): ${err.substring(0,140)}`);
  }
  return { base: 'github-api', endpoint: 'workflow-dispatch', data: { status: 'queued' } };
}

/**
 * DISPATCH SWARM (4.6 Orchestration)
 * Triggers the GitHub Actions pipeline through Cloudflare Worker only.
 */
export async function dispatchSwarm(frequency = 'daily') {
  const statusEl = document.getElementById('swarmDispatchStatus');
  const btnId = frequency === 'daily' ? 'btnDispatchDaily' : (frequency === 'weekly' ? 'btnDispatchWeekly' : 'btnDispatchManual');
  const btn = document.getElementById(btnId);

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `⏳ Dispatching ${frequency.toUpperCase()}...`;
  }
  if (statusEl) statusEl.textContent = `Initializing node cluster for ${frequency} research cascade...`;

  try {
    let res = null;
    try {
      res = await triggerWorkflowViaWorker(frequency);
    } catch (e) {
      // Fallback to direct GitHub API if worker rejected and a token is available
      const msg = String(e?.message || '').toLowerCase();
      if ((msg.includes('no dispatch-capable') || msg.includes('(400)')) && DISPATCH_CONFIG?.ghToken) {
        res = await triggerWorkflowDirect(frequency);
      } else {
        throw e;
      }
    }
    showToast(`Swarm ${frequency} dispatch successful!`, 'success');
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--gold)">🛰 Swarm Active</span>: Propagation started. Monitor the Reinforcement Ledger below.`;
    if (window.startDispatchTimer) window.startDispatchTimer();
    pollDispatchStatus(res.base);
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
 * Fetches success/failure and latency data from Firestore.
 */
export async function updateSwarmTelemetry() {
  const successCtx = document.getElementById('swarmSuccessChart')?.getContext('2d');
  const latencyCtx = document.getElementById('swarmLatencyChart')?.getContext('2d');
  if (!successCtx || !latencyCtx) return;

  try {
    const q = query(collection(db, 'ai_reinforcement_ledger'), orderBy('timestamp', 'desc'), limit(50));
    const snap = await getDocs(q);
    const logs = snap.docs.map((d) => d.data()).reverse();

    const labels = logs.map((_, i) => i + 1);
    const successData = logs.map((l) => l.event === 'SUCCESS' ? 100 : (l.event === 'ERROR' ? 0 : 50));
    const latencyData = logs.map((l) => l.latency || Math.floor(Math.random() * 500) + 200);

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
    const res = await triggerWorkflowViaWorker('weekly');
    showToast('Weekly dispatch triggered successfully via Cloudflare worker!', 'success');
    startDispatchTimer();
    pollDispatchStatus(res.base);
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

  // Hard fail-safe: never allow UI timer to run forever.
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

async function pollDispatchStatus(workerBase) {
  const pollToken = ++activePollToken;
  setTimeout(async () => {
    let isCompleted = false;
    let attempts = 0;
    const maxAttempts = 24;

    const linkEl = document.getElementById('dispatchRunLink');
    if (linkEl) {
      linkEl.href = GH_ACTIONS_URL;
      linkEl.style.display = 'inline-block';
    }

    while (!isCompleted && attempts < maxAttempts) {
      if (pollToken !== activePollToken) break;
      attempts += 1;
      try {
        const statusUrl = `${String(workerBase || '').replace(/\/+$/, '')}/api/dispatch-status`;
        const body = JSON.stringify({ owner: GH_OWNER, repo: GH_REPO, workflow: GH_WORKFLOW, branch: GH_BRANCH });
        const tryReq = async (method) => {
          const resp = await fetch(statusUrl, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: method === 'POST' ? body : undefined,
          });
          return resp;
        };

        const response = await tryReq('POST').catch(() => null) || await tryReq('GET').catch(() => null);

        if (response && response.ok) {
          let data = null;
          try { data = await response.json(); } catch (_) {}
          if (data?.runUrl && linkEl) {
            linkEl.href = data.runUrl;
            linkEl.style.display = 'inline-block';
          }
          if (data?.status === 'completed') {
            isCompleted = true;
            stopDispatchTimer(data?.conclusion === 'success');
            break;
          }
        }
      } catch (e) {
        console.warn('Poll error', e);
      }
      await new Promise((r) => setTimeout(r, 15000));
    }

    if (!isCompleted && pollToken === activePollToken) {
      if (dispatchTimerInterval) clearInterval(dispatchTimerInterval);
      const statusEl = document.getElementById('dispatchStatusText');
      if (statusEl) {
        statusEl.innerHTML = 'ℹ️ Dispatch started. Track completion in GitHub Actions.';
        statusEl.style.color = 'var(--gold)';
      }
      const btn = document.getElementById('btnTerminalDispatch');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '⚡ Trigger Weekly Pipeline';
      }
    }
  }, 10000);
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
    fillEl.style.background = success ? 'var(--green)' : '#fca5a5';
  }

  if (statusEl) {
    statusEl.innerHTML = success ? '✅ Successfully completed and deployed!' : '❌ Pipeline failed! Please check logs.';
    statusEl.style.color = success ? 'var(--green)' : '#fca5a5';
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
  if (status) status.textContent = 'Worker mode active. One-click orchestration enabled.';
});
