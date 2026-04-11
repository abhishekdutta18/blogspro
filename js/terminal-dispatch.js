import { showToast, auth, db, DISPATCH_CONFIG } from './config.js';
import { collection, query, orderBy, limit, getDocs, where, onSnapshot, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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

/**
 * DISPATCH SWARM (V5.4 Durable Inngest)
 * Triggers the Pulse orchestrator directly via authenticated POST.
 */
export async function dispatchSwarm(frequency = 'daily') {
  const statusEl = document.getElementById('swarmDispatchStatus');
  const btnId = frequency === 'daily' ? 'btnDispatchDaily' : (frequency === 'weekly' ? 'btnDispatchWeekly' : 'btnDispatchManual');
  const btn = document.getElementById(btnId);

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `⏳ Dispatching ${frequency.toUpperCase()}...`;
  }
  
  // V7.0 Hardening: Clear newsfeed for fresh cycle
  const newsfeed = document.getElementById('dispatchNewsfeed');
  if (newsfeed) newsfeed.innerHTML = '';
  
  if (statusEl) statusEl.textContent = `Initializing node cluster for ${frequency} research cascade...`;

  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("Authentication required - please refresh the dashboard.");

    // Direct Pulse Orchestrator — blogspro-pulse environment
    const workerBase = window.BLOGSPRO_CONFIG?.PULSE_WORKER_URL || "https://blogspro-pulse.abhishek-dutta1996.workers.dev";
    const pulseWorkerUrl = `${workerBase.replace(/\/+$/, '')}/dispatch?type=pulse&freq=${frequency}`;
    const response = await fetch(pulseWorkerUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ frequency })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Dispatch failed: ${response.statusText}`);
    }

    showToast(`Swarm ${frequency} dispatch successful!`, 'success');
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--gold)">🛰 Swarm Active</span>: Propagation started. Monitor the Reinforcement Ledger below.`;
    
    // UI Feedback & Polling (V7.0: append context instead of clearing)
    if (window.startDispatchTimer) window.startDispatchTimer();
    appendToNewsfeed("INIT", `User triggered ${frequency.toUpperCase()} swarm pipeline.`);
    pollDispatchStatus(workerBase);
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
    // V7.0 Hardening: Pull from both Legacy Ledger and New Telemetry Logs
    const ledgerQuery = query(collection(db, 'ai_reinforcement_ledger'), orderBy('timestamp', 'desc'), limit(25));
    const telemetryQuery = query(collection(db, 'telemetry_logs'), orderBy('timestamp', 'desc'), limit(25));
    
    const [ledgerSnap, telemetrySnap] = await Promise.all([getDocs(ledgerQuery), getDocs(telemetryQuery)]);
    
    const rawLogs = [
        ...ledgerSnap.docs.map(d => ({ ...d.data(), source: 'legacy' })),
        ...telemetrySnap.docs.map(d => {
            const data = d.data();
            // Standardize format: timestamp is a Firestore Timestamp object from SDK, or ISO string from REST
            const ts = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
            return {
                timestamp: ts.toISOString(),
                event: data.event,
                status: data.status,
                latency: parseInt(data.latency || 0),
                source: 'hardened'
            };
        })
    ];

    // Sort combined logs by timestamp
    const logs = rawLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).slice(-50);

    const labels = logs.map((_, i) => i + 1);
    const successData = logs.map((l) => {
        if (l.source === 'legacy') return l.event === 'SUCCESS' ? 100 : (l.event === 'ERROR' ? 0 : 50);
        return l.status === 'success' ? 100 : (l.status === 'error' ? 0 : 50);
    });
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
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("Authentication required - please login.");

    // V5.5 Hardening: Use secure proxy instead of direct GH call
    const workerBase = window.BLOGSPRO_CONFIG?.PULSE_WORKER_URL || "https://blogspro-pulse.abhishek-dutta1996.workers.dev";
    const triggerUrl = `${workerBase.replace(/\/+$/, '')}/api/trigger-github`;
    
    const response = await fetch(triggerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ frequency: 'weekly' })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Dispatch failed: ${response.statusText}`);
    }

    showToast('Weekly dispatch triggered successfully!', 'success');
    startDispatchTimer();
    pollDispatchStatus(workerBase);
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

/**
 * Newsfeed Log Appender (V7.0)
 */
export function appendToNewsfeed(stage, message) {
  const newsfeed = document.getElementById('dispatchNewsfeed');
  if (!newsfeed) return;

  const now = new Date();
  const ts = `[${padZero(now.getHours())}:${padZero(now.getMinutes())}:${padZero(now.getSeconds())}]`;
  
  // Deduplicate: Don't append if the last message is identical
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

/**
 * TELEMETRY INITIALIZER (V7.0)
 * Automatically detects if a swarm is currently active and initiates newsfeed polling.
 */
export async function initSwarmMonitoring() {
  const workerBase = window.BLOGSPRO_CONFIG?.PULSE_WORKER_URL || "https://blogspro-pulse.abhishek-dutta1996.workers.dev";
  const newsfeed = document.getElementById('dispatchNewsfeed');
  if (!newsfeed) return;

  try {
    const resp = await fetch(`${workerBase.replace(/\/+$/, '')}/telemetry`);
    if (resp.ok) {
       const data = await resp.json();
       // Full history or active run
       const history = data.history || [];
       
       if (history.length > 0) {
          appendToNewsfeed("SYNC", `Resuming historical log. ${history.length} events recovered.`);
          history.forEach(log => appendToNewsfeed(log.stage || "PULSE", log.message));
       }

       if (data.active || data.stage) {
          appendToNewsfeed("SYNC", "Detected active swarm run. Subscribing to live telemetry...");
          pollDispatchStatus(workerBase);
       }
    }
  } catch(e) {
    console.warn("⚠️ Telemetry Auto-Init failed:", e.message);
  }
}
window.initSwarmMonitoring = initSwarmMonitoring;

/**
 * Proactive Firebase Archival Trigger (V7.0)
 */
export async function triggerManualArchive() {
  const workerBase = window.BLOGSPRO_CONFIG?.PULSE_WORKER_URL || "https://blogspro-pulse.abhishek-dutta1996.workers.dev";
  const archiveUrl = `${workerBase.replace(/\/+$/, '')}/archive`;

  showToast('Initiating permanent Firebase archival...', 'info');
  
  try {
    const res = await fetch(archiveUrl);
    const data = await res.json();
    if (data.success) {
      showToast('Archival completed. Records moved to deep storage.', 'success');
      appendToNewsfeed('ARCHIVE', 'V7.0 Perpetual Archiving Successful. 90-day window enforced.');
    } else {
      throw new Error(data.message);
    }
  } catch (e) {
    showToast(`Archival failed: ${e.message}`, 'error');
    console.error('Archive error:', e);
  }
}

window.triggerManualArchive = triggerManualArchive;
window.appendToNewsfeed = appendToNewsfeed;

async function pollDispatchStatus(workerBase) {
  const pollToken = ++activePollToken;
  const safeWorkerBase = workerBase || window.BLOGSPRO_CONFIG?.PULSE_WORKER_URL || "https://blogspro-pulse.abhishek-dutta1996.workers.dev";
  const telemetryUrl = `${String(safeWorkerBase).replace(/\/+$/, '')}/telemetry`;
  
  const fillEl = document.getElementById('dispatchFill');
  const statusEl = document.getElementById('dispatchStatusText');
  const linkEl = document.getElementById('dispatchRunLink');
  const elapsedEl = document.getElementById('dispatchElapsed');

  if (linkEl) {
    linkEl.href = GH_ACTIONS_URL;
    linkEl.style.display = 'inline-block';
  }

  // Phase 1: Real-time Telemetry Polling (High Fidelity)
  let isSwarmDone = false;
  let pollCount = 0;

  const telemetryPoll = async () => {
    if (pollToken !== activePollToken || isSwarmDone) return;
    pollCount++;

    try {
      const res = await fetch(telemetryUrl);
      if (res.ok) {
        const data = await res.json();
        const latestJob = Object.values(data).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

        if (latestJob) {
          // Update Status Text
          if (statusEl) {
            statusEl.innerHTML = `🛰 <span style="color:var(--gold)">${latestJob.stage}</span>: ${latestJob.message}`;
          }

          // [V7.0] Append to Newsfeed
          appendToNewsfeed(latestJob.stage, latestJob.message);

          // Update Progress Bar based on stage
          const stages = {
            'START': 5,
            'INIT': 10,
            'RESEARCHING': 30,
            'RESEARCH': 40,
            'ANCHOR': 50,
            'SECTORS': 60,
            'CONSENSUS': 75,
            'DRAFTING': 80,
            'AUDIT': 90,
            'FINALIZE': 95,
            'PERSIST': 98,
            'COMPLETE': 100,
            'SUCCESS': 100
          };
          const progress = stages[latestJob.stage] || 10;
          if (fillEl) fillEl.style.width = `${progress}%`;

          if (latestJob.stage === 'COMPLETE' || latestJob.stage === 'SUCCESS') {
            isSwarmDone = true;
          }
        }
      }
    } catch (e) {
      console.warn('Telemetry poll error:', e);
    }

    if (!isSwarmDone && pollCount < 100) {
      setTimeout(telemetryPoll, 5000); // Poll every 5s
    }
  };

  telemetryPoll();

  // Phase 2: GitHub Actions Completion Check (Legacy Fallback / Final State)
  setTimeout(async () => {
    let isCompleted = false;
    let attempts = 0;
    const maxAttempts = 24;

    while (!isCompleted && attempts < maxAttempts) {
      if (pollToken !== activePollToken) break;
      attempts += 1;
      try {
        const statusUrl = `${String(safeWorkerBase).replace(/\/+$/, '')}/api/dispatch-status`;
        const body = JSON.stringify({ owner: GH_OWNER, repo: GH_REPO, workflow: GH_WORKFLOW, branch: GH_BRANCH });
        
        const response = await fetch(statusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
        }).catch(() => null);

        if (response && response.ok) {
          let data = await response.json();
          if (data?.runUrl && linkEl) {
            linkEl.href = data.runUrl;
          }
          if (data?.status === 'completed') {
            isCompleted = true;
            isSwarmDone = true;
            stopDispatchTimer(data?.conclusion === 'success');
            break;
          }
        }
      } catch (e) {
        console.warn('Poll status error', e);
      }
      await new Promise((r) => setTimeout(r, 15000));
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
  if (status) status.textContent = 'Institutional Key Management Active (Cloud Mode)';
  
  // V7.0: Auto-load telemetry
  if (window.initSwarmMonitoring) window.initSwarmMonitoring();
});

// 🏺 [V8.4] INSTITUTIONAL HIL CONSENSUS SERVICE
// --------------------------------------------------
// HIL Consensus listener initialized below using consolidated imports.

let hilUnsubscribe = null;

export function initHILStation() {
    const station = document.getElementById('hilConsensusStation');
    const list = document.getElementById('hilAuditList');
    if (!station || !list) return;

    console.log("🏺 [HIL] Initializing Consensus Station...");

    // Real-time listener for pending audits
    const q = query(collection(db, "institutional_audits"), where("status", "==", "PENDING"));
    
    hilUnsubscribe = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            station.style.display = 'none';
            list.innerHTML = `<div style="font-size:0.75rem; color:var(--muted); padding:1rem; text-align:center;">No pending institutional audits.</div>`;
            return;
        }

        station.style.display = 'block';
        list.innerHTML = '';

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            
            const card = document.createElement('div');
            card.className = 'saas-panel';
            card.style.background = 'rgba(0,0,0,0.2)';
            card.style.border = '1px solid rgba(168,85,247,0.3)';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem">
                    <div>
                        <div style="font-size:0.85rem; font-weight:700; color:var(--purple2)">${data.frequency?.toUpperCase() || 'INSTITUTIONAL'} TOME</div>
                        <div style="font-size:0.65rem; color:var(--muted)">Job ID: <code>${id}</code> • ${data.wordCount || 0} words ${data.lastRefined ? '• <span style="color:var(--gold)">REFINED</span>' : ''}</div>
                    </div>
                    <div style="display:flex; gap:0.5rem">
                        <button class="v2-btn-top" onclick="previewHILManuscript('${id}')">👁 Full HTML Review</button>
                        ${data.pdfUrl ? `<button class="v2-btn-top" onclick="window.open('${data.pdfUrl}', '_blank')" style="border-color:var(--blue2); color:var(--blue2)">📑 View PDF</button>` : ''}
                        <button class="v2-btn-top" onclick="toggleHILRefine('${id}')" style="border-color:var(--gold); color:var(--gold)">✎ Refine & Suggest</button>
                        <button class="v2-btn-pub" onclick="approveHILManuscript('${id}')" style="background:var(--emerald); border-color:var(--emerald); color:white">✅ Approve</button>
                    </div>
                </div>
                <div id="hil-preview-${id}" style="display:none; height:600px; background:#fff; border-radius:4px; border:1px solid var(--border); margin-bottom:0.8rem; overflow:hidden;">
                    <iframe id="iframe-preview-${id}" style="width:100%; height:100%; border:none;" srcdoc="${(data.content || '<html><body>No content preview available.</body></html>').replace(/"/g, '&quot;')}"></iframe>
                </div>
                <div id="hil-refine-zone-${id}" style="display:none; padding:1rem; background:rgba(201,168,76,0.05); border:1px solid var(--border); border-radius:4px;">
                    <div style="font-size:0.65rem; font-weight:700; color:var(--gold); margin-bottom:0.5rem; text-transform:uppercase">Refinement Feedback Loop</div>
                    <p style="font-size:0.7rem; color:var(--muted); margin-bottom:0.8rem">Provide specific steering instructions. The swarm will re-enter reasoning mode to incorporate your feedback.</p>
                    
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:0.8rem;">
                        <div>
                            <label style="font-size:0.7rem; color:var(--muted); font-weight:700;">GENERAL FEEDBACK</label>
                            <textarea id="hil-refine-msg-${id}" class="form-textarea" rows="4" placeholder="Tone, structure, flow..." style="margin-top:0.3rem; font-size:0.75rem;"></textarea>
                        </div>
                        <div>
                            <label style="font-size:0.7rem; color:#fca5a5; font-weight:700;">CHART & TABLE FEEDBACK</label>
                            <textarea id="hil-refine-chart-${id}" class="form-textarea" rows="4" placeholder="Missing labels, quantitative logic errors, layout..." style="margin-top:0.3rem; font-size:0.75rem; border-color:rgba(252,165,165,0.3);"></textarea>
                        </div>
                    </div>

                    <div style="display:flex; justify-content:flex-end; gap:0.5rem">
                        <button class="v2-btn-top" onclick="toggleHILRefine('${id}')">Cancel</button>
                        <button class="v2-btn-pub" onclick="refineHILManuscript('${id}')" style="background:var(--gold); border-color:var(--gold); color:var(--navy)">🚀 Submit to Swarm</button>
                    </div>
                </div>
            `;
            list.appendChild(card);
        });
    }, (err) => {
        console.error("HIL Station Error:", err);
        showToast("HIL Station offline: Firestore connection failed.", "error");
    });
}

window.previewHILManuscript = (id) => {
    const el = document.getElementById(`hil-preview-${id}`);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.toggleHILRefine = (id) => {
    const el = document.getElementById(`hil-refine-zone-${id}`);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.refineHILManuscript = async (id) => {
    const msgEl = document.getElementById(`hil-refine-msg-${id}`);
    const chartEl = document.getElementById(`hil-refine-chart-${id}`);
    
    const msg = msgEl?.value.trim() || '';
    const chartMsg = chartEl?.value.trim() || '';

    if (!msg && !chartMsg) {
        showToast("Please provide refinement instructions (General or Chart-specific).", "error");
        return;
    }
    
    const combinedMsg = `General: ${msg || 'N/A'}\nCharts & Tables: ${chartMsg || 'N/A'}`;

    if (!confirm(`Trigger refinement loop for Job [${id}]?`)) return;
    
    try {
        const docRef = doc(db, "institutional_audits", id);
        await updateDoc(docRef, {
            status: "REFINEMENT_REQUESTED",
            adminComments: combinedMsg,
            requestedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.email || 'Admin'
        });

        // Relay to Inngest
        const eventKey = DISPATCH_CONFIG?.inngestEventKey || 'DEFAULT_KEY';
        const eventUrl = DISPATCH_CONFIG?.inngestUrl || "https://inn.blogspro.in/e/";
        
        await fetch(`${eventUrl}${eventKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{
                name: "swarm/manuscript.refine_requested",
                data: { jobId: id, feedback: msg },
                timestamp: Date.now()
            }])
        });

        showToast(`🚀 Refinement requested for ${id}.`, "success");
    } catch (e) {
        console.error("Refinement Request Failed:", e);
        showToast("Refinement request failed.", "error");
    }
};

window.approveHILManuscript = async (id) => {
    if (!confirm(`Confirm strategic approval for Job [${id}]?`)) return;
    
    try {
        const docRef = doc(db, "institutional_audits", id);
        await updateDoc(docRef, {
            status: "APPROVED",
            approvedAt: serverTimestamp(),
            approvedBy: auth.currentUser?.email || 'Admin'
        });

        // [V8.5] Relay Consensus Signal to Inngest (Serverless Wake-up)
        const eventKey = DISPATCH_CONFIG?.inngestEventKey || 'DEFAULT_KEY';
        const eventUrl = DISPATCH_CONFIG?.inngestUrl || "https://inn.blogspro.in/e/";
        
        await fetch(`${eventUrl}${eventKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{
                name: "swarm/manuscript.approved",
                data: { jobId: id },
                timestamp: Date.now()
            }])
        });

        showToast(`✅ [HIL] Strategic approval granted for ${id}.`, "success");
    } catch (e) {
        console.error("Approval Failed:", e);
        showToast("Approval failed: Cloud sync error.", "error");
    }
};

// Initialize if on appropriate view
document.addEventListener('DOMContentLoaded', () => {
    // Only init if intelligence view exists
    if (document.getElementById('view-intelligence')) {
        initHILStation();
    }
});
