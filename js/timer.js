// ═══════════════════════════════════════════════
// timer.js — AI modal elapsed/remaining timer
// Controls: aiTimerBar, aiTimerElapsed, aiTimerRemaining,
//           aiTimerSpeed, aiTimerTrack, aiTimerChunkLog
// ═══════════════════════════════════════════════

let _timerInterval = null;
let _timerStart    = null;
let _timerEstimate = 0; // estimated total seconds

// Typical durations per phase (seconds)
const PHASE_ESTIMATES = {
  outline:  12,
  article:  45,
  metadata: 15,
  default:  30,
};

export function startTimer(phase = 'default') {
  stopTimer();
  _timerStart    = Date.now();
  _timerEstimate = PHASE_ESTIMATES[phase] || PHASE_ESTIMATES.default;

  const bar      = document.getElementById('aiTimerBar');
  const elapsed  = document.getElementById('aiTimerElapsed');
  const remain   = document.getElementById('aiTimerRemaining');
  const speed    = document.getElementById('aiTimerSpeed');
  const track    = document.getElementById('aiTimerTrack');
  const log      = document.getElementById('aiTimerChunkLog');

  if (!bar) return;
  bar.style.display = 'block';
  if (log) log.textContent = '';
  if (track) track.style.width = '0%';

  _timerInterval = setInterval(() => {
    const secs  = (Date.now() - _timerStart) / 1000;
    const mins  = Math.floor(secs / 60);
    const s     = Math.floor(secs % 60);
    if (elapsed) elapsed.textContent = `${mins}:${String(s).padStart(2,'0')}`;

    // Progress bar — clamp at 95% so it never "finishes" early
    const pct = Math.min(95, (secs / _timerEstimate) * 100);
    if (track) track.style.width = pct + '%';

    // Remaining estimate
    const remSecs = Math.max(0, Math.round(_timerEstimate - secs));
    if (remain) {
      if (remSecs <= 0) {
        remain.textContent = 'almost done…';
      } else {
        const rm = Math.floor(remSecs / 60);
        const rs = remSecs % 60;
        remain.textContent = rm > 0 ? `~${rm}m ${rs}s` : `~${rs}s`;
      }
    }

    // Tokens/s estimate (rough: avg 4 chars/token, 30 tokens/s for typical model)
    if (speed) speed.textContent = secs > 2 ? '~30 tok/s' : '—';

  }, 500);
}

export function stopTimer() {
  if (_timerInterval) {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }
  // Snap progress to 100% on completion
  const track = document.getElementById('aiTimerTrack');
  if (track) track.style.width = '100%';
}

export function hideTimer() {
  stopTimer();
  const bar = document.getElementById('aiTimerBar');
  if (bar) bar.style.display = 'none';
  const track = document.getElementById('aiTimerTrack');
  if (track) track.style.width = '0%';
}

export function timerLog(msg) {
  const log = document.getElementById('aiTimerChunkLog');
  if (!log) return;
  const line = document.createElement('div');
  line.textContent = msg;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

// Expose globally for any inline usage
window.startTimer = startTimer;
window.stopTimer  = stopTimer;
window.hideTimer  = hideTimer;

// ═══════════════════════════════════════════════
// Modal pipeline roadmap — shows live step status
// Steps: outline | article | metadata | done
// ═══════════════════════════════════════════════

const ROADMAP_STEPS = [
  { id: 'rms-outline',  label: 'Outline',  icon: '📋' },
  { id: 'rms-article',  label: 'Article',  icon: '✍️'  },
  { id: 'rms-metadata', label: 'Metadata', icon: '🏷'  },
  { id: 'rms-done',     label: 'Done',     icon: '🚀'  },
];

function buildRoadmap() {
  const track = document.getElementById('aiRoadmapTrack');
  if (!track || track.dataset.built) return;
  track.dataset.built = '1';
  track.innerHTML = `
    <div style="display:flex;align-items:center;gap:0;min-width:300px">
      ${ROADMAP_STEPS.map((s, i) => `
        <div id="${s.id}" style="display:flex;flex-direction:column;align-items:center;flex:1;opacity:0.35;transition:opacity 0.4s,transform 0.3s">
          <div style="width:34px;height:34px;border-radius:50%;background:var(--navy3);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:1rem;position:relative;z-index:1">${s.icon}</div>
          <div style="font-size:9px;font-weight:700;color:var(--cream);margin-top:5px;white-space:nowrap">${s.label}</div>
          <div id="${s.id}-badge" style="font-size:8px;margin-top:2px;color:var(--muted)">waiting</div>
        </div>
        ${i < ROADMAP_STEPS.length - 1 ? `<div style="flex:1;height:2px;background:var(--border);margin-bottom:22px;transition:background 0.4s" id="${s.id}-line"></div>` : ''}
      `).join('')}
    </div>`;
}

export function showRoadmap() {
  const el = document.getElementById('aiRoadmap');
  if (el) el.style.display = 'block';
  buildRoadmap();
  // Reset all steps
  ROADMAP_STEPS.forEach(s => {
    const node = document.getElementById(s.id);
    if (node) { node.style.opacity = '0.35'; node.style.transform = 'scale(1)'; }
    const badge = document.getElementById(`${s.id}-badge`);
    if (badge) { badge.textContent = 'waiting'; badge.style.color = 'var(--muted)'; }
    const line = document.getElementById(`${s.id}-line`);
    if (line) line.style.background = 'var(--border)';
  });
}

export function setRoadmapStep(stepId, status) {
  // status: 'active' | 'done' | 'error'
  const node  = document.getElementById(`rms-${stepId}`);
  const badge = document.getElementById(`rms-${stepId}-badge`);
  const prevLine = document.getElementById(`rms-${getPrevStepId(stepId)}-line`);

  if (!node) return;

  if (status === 'active') {
    node.style.opacity   = '1';
    node.style.transform = 'scale(1.1)';
    if (badge) { badge.textContent = '⏳ running'; badge.style.color = 'var(--gold)'; }
  } else if (status === 'done') {
    node.style.opacity   = '1';
    node.style.transform = 'scale(1)';
    if (badge) { badge.textContent = '✓ done'; badge.style.color = 'var(--green)'; }
    if (prevLine) prevLine.style.background = 'var(--green)';
    // Also light up the line leading to this step
    const myLine = document.getElementById(`rms-${stepId}-line`);
    if (myLine) myLine.style.background = 'rgba(201,168,76,0.4)';
  } else if (status === 'error') {
    if (badge) { badge.textContent = '✕ failed'; badge.style.color = '#fca5a5'; }
    node.style.opacity = '0.7';
  }
}

export function hideRoadmap() {
  const el = document.getElementById('aiRoadmap');
  if (el) el.style.display = 'none';
}

function getPrevStepId(stepId) {
  const ids = ROADMAP_STEPS.map(s => s.id.replace('rms-', ''));
  const i = ids.indexOf(stepId);
  return i > 0 ? ids[i - 1] : null;
}

window.showRoadmap    = showRoadmap;
window.setRoadmapStep = setRoadmapStep;
window.hideRoadmap    = hideRoadmap;
