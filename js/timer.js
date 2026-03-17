// ═══════════════════════════════════════════════
// timer.js — Real-time AI generation progress
// Shows actual elapsed, actual words/s, and
// real time-remaining based on section progress.
// ═══════════════════════════════════════════════

let _timerInterval  = null;
let _timerStart     = null;

// Real progress state — updated by ai-writer.js each section
let _sectionsTotal     = 1;
let _sectionsDone      = 0;
let _wordsAtLastUpdate = 0;
let _timeAtLastUpdate  = 0;
let _wordsPerSec       = 0;   // rolling real measurement
let _secTimeHistory    = [];  // array of ms per section (for avg)

// ─────────────────────────────────────────────
// startTimer — called once at generation start
// ─────────────────────────────────────────────
export function startTimer(totalSections = 1) {
  stopTimer();
  _timerStart         = Date.now();
  _sectionsTotal      = Math.max(1, totalSections);
  _sectionsDone       = 0;
  _wordsAtLastUpdate  = 0;
  _timeAtLastUpdate   = Date.now();
  _wordsPerSec        = 0;
  _secTimeHistory     = [];

  const bar   = document.getElementById('aiTimerBar');
  const track = document.getElementById('aiTimerTrack');
  const log   = document.getElementById('aiTimerChunkLog');
  const speed = document.getElementById('aiTimerSpeed');
  const elapsed = document.getElementById('aiTimerElapsed');
  const remain  = document.getElementById('aiTimerRemaining');

  if (!bar) return;
  bar.style.display = 'block';
  if (log)     log.textContent     = '';
  if (track)   track.style.width   = '0%';
  if (speed)   speed.textContent   = '—';
  if (elapsed) elapsed.textContent = '0:00';
  if (remain)  remain.textContent  = '—';

  _timerInterval = setInterval(_tick, 500);
}

// ─────────────────────────────────────────────
// updateProgress — called after each section completes
// sectionsDone : how many sections finished so far
// wordsWritten : total words in editor right now
// ─────────────────────────────────────────────
export function updateProgress(sectionsDone, wordsWritten) {
  const now = Date.now();

  // Measure real words/s over the last section
  const deltaWords = wordsWritten - _wordsAtLastUpdate;
  const deltaSecs  = (now - _timeAtLastUpdate) / 1000;

  if (deltaSecs > 0.5 && deltaWords > 0) {
    const instantRate = deltaWords / deltaSecs;
    // Smooth with a rolling average
    _secTimeHistory.push(instantRate);
    if (_secTimeHistory.length > 5) _secTimeHistory.shift();
    _wordsPerSec = _secTimeHistory.reduce((a, b) => a + b, 0) / _secTimeHistory.length;
  }

  _sectionsDone      = sectionsDone;
  _wordsAtLastUpdate = wordsWritten;
  _timeAtLastUpdate  = now;

  // Update progress bar immediately on each section completion
  const pct = Math.min(97, (_sectionsDone / _sectionsTotal) * 100);
  const track = document.getElementById('aiTimerTrack');
  if (track) track.style.width = pct + '%';
}

// ─────────────────────────────────────────────
// _tick — runs every 500ms to update display
// ─────────────────────────────────────────────
function _tick() {
  if (!_timerStart) return;
  const nowMs  = Date.now();
  const secs   = (nowMs - _timerStart) / 1000;

  // Elapsed
  const mins = Math.floor(secs / 60);
  const s    = Math.floor(secs % 60);
  const elapsed = document.getElementById('aiTimerElapsed');
  if (elapsed) elapsed.textContent = `${mins}:${String(s).padStart(2, '0')}`;

  // Real words/s
  const speed = document.getElementById('aiTimerSpeed');
  if (speed) {
    if (_wordsPerSec > 0) {
      speed.textContent = Math.round(_wordsPerSec) + ' w/s';
    } else if (secs > 3) {
      // Fallback: count words currently in editor / elapsed
      const editorText = document.getElementById('editor')?.textContent || '';
      const currentWords = editorText.trim().split(/\s+/).filter(Boolean).length;
      if (currentWords > 0) {
        const rate = currentWords / secs;
        speed.textContent = Math.round(rate) + ' w/s';
      } else {
        speed.textContent = '…';
      }
    }
  }

  // Real time remaining
  const remain = document.getElementById('aiTimerRemaining');
  if (remain && _sectionsDone > 0 && _sectionsTotal > 0) {
    const sectionsLeft  = _sectionsTotal - _sectionsDone;
    const avgSecPerSection = secs / _sectionsDone;         // actual avg so far
    const estimatedRemSecs = sectionsLeft * avgSecPerSection;

    if (estimatedRemSecs <= 5) {
      remain.textContent = 'almost done…';
    } else if (estimatedRemSecs < 60) {
      remain.textContent = `~${Math.round(estimatedRemSecs)}s`;
    } else {
      const rm = Math.floor(estimatedRemSecs / 60);
      const rs = Math.round(estimatedRemSecs % 60);
      remain.textContent = `~${rm}m ${rs}s`;
    }
  } else if (remain && _sectionsDone === 0) {
    remain.textContent = 'starting…';
  }

  // Progress bar moves in real-time between section completions too
  if (_sectionsDone < _sectionsTotal) {
    const basePct    = (_sectionsDone / _sectionsTotal) * 100;
    const nextPct    = ((_sectionsDone + 1) / _sectionsTotal) * 100;
    // Micro-advance within current section based on elapsed time
    const avgSecPerSection = _sectionsDone > 0 ? secs / _sectionsDone : 30;
    const secsSinceUpdate  = (nowMs - _timeAtLastUpdate) / 1000;
    const microAdv = Math.min(0.9, secsSinceUpdate / avgSecPerSection);
    const pct = Math.min(97, basePct + (nextPct - basePct) * microAdv);
    const track = document.getElementById('aiTimerTrack');
    if (track) track.style.width = pct + '%';
  }
}

// ─────────────────────────────────────────────
export function stopTimer() {
  if (_timerInterval) {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }
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

window.startTimer = startTimer;
window.stopTimer  = stopTimer;
window.hideTimer  = hideTimer;

// ═══════════════════════════════════════════════
// Roadmap — dynamic pipeline step indicators
// Shows real provider names and time estimates
// ═══════════════════════════════════════════════
const ROADMAP_STEPS = [
  { id: 'rms-outline',  label: 'Outline',  icon: '📋' },
  { id: 'rms-article',  label: 'Article',  icon: '✍️'  },
  { id: 'rms-metadata', label: 'Metadata', icon: '🏷'  },
  { id: 'rms-done',     label: 'Done',     icon: '🚀'  },
];

// Track providers used per step for dynamic display
let _stepProviders = {};
let _timeIncreaseReasons = [];

function buildRoadmap() {
  const track = document.getElementById('aiRoadmapTrack');
  if (!track) return;
  // Always rebuild to reflect dynamic provider info
  track.innerHTML = `
    <div style="display:flex;align-items:center;width:100%;max-width:520px;margin:0 auto">
      ${ROADMAP_STEPS.map((s, i) => `
        <div id="${s.id}" style="display:flex;flex-direction:column;align-items:center;flex:0 0 80px;opacity:0.35;transition:opacity 0.4s,transform 0.3s">
          <div style="width:28px;height:28px;border-radius:50%;background:var(--navy3);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:0.8rem;z-index:1">${s.icon}</div>
          <div style="font-size:9px;font-weight:700;color:var(--cream);margin-top:4px;white-space:nowrap">${s.label}</div>
          <div id="${s.id}-badge" style="font-size:8px;margin-top:1px;color:var(--muted)">waiting</div>
          <div id="${s.id}-provider" style="font-size:7px;margin-top:1px;color:var(--muted);max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
        </div>
        ${i < ROADMAP_STEPS.length - 1 ? `<div style="flex:1;height:1.5px;background:var(--border);margin-bottom:28px;transition:background 0.4s;min-width:20px" id="${s.id}-line"></div>` : ''}
      `).join('')}
    </div>
    <div id="rms-time-reason" style="font-size:0.65rem;color:var(--muted);text-align:center;margin-top:6px;min-height:14px"></div>`;
}

export function showRoadmap() {
  _stepProviders = {};
  _timeIncreaseReasons = [];
  const el = document.getElementById('aiRoadmap');
  if (el) {
    el.style.display = 'block';
    const header = el.querySelector('div:first-child');
    if (header) header.style.padding = '0.35rem 0.75rem';
    const track = document.getElementById('aiRoadmapTrack');
    if (track) track.style.padding = '0.5rem 0.75rem';
  }
  buildRoadmap();
  ROADMAP_STEPS.forEach(s => {
    const node = document.getElementById(s.id);
    if (node) { node.style.opacity = '0.35'; node.style.transform = 'scale(1)'; }
    const badge = document.getElementById(`${s.id}-badge`);
    if (badge) { badge.textContent = 'waiting'; badge.style.color = 'var(--muted)'; }
    const line = document.getElementById(`${s.id}-line`);
    if (line) line.style.background = 'var(--border)';
  });
}

export function setRoadmapStep(stepId, status, providerName) {
  const node     = document.getElementById(`rms-${stepId}`);
  const badge    = document.getElementById(`rms-${stepId}-badge`);
  const provEl   = document.getElementById(`rms-${stepId}-provider`);
  const prevId   = getPrevStepId(stepId);
  const prevLine = prevId ? document.getElementById(`rms-${prevId}-line`) : null;
  if (!node) return;

  // Show provider name dynamically
  if (providerName && provEl) {
    _stepProviders[stepId] = providerName;
    provEl.textContent = providerName;
    provEl.style.color = 'var(--gold)';
  }

  if (status === 'active') {
    node.style.opacity   = '1';
    node.style.transform = 'scale(1.1)';
    if (badge) { badge.textContent = '⏳ running'; badge.style.color = 'var(--gold)'; }
  } else if (status === 'done') {
    node.style.opacity   = '1';
    node.style.transform = 'scale(1)';
    if (badge) { badge.textContent = '✓ done'; badge.style.color = 'var(--green)'; }
    if (prevLine) prevLine.style.background = 'var(--green)';
    const myLine = document.getElementById(`rms-${stepId}-line`);
    if (myLine) myLine.style.background = 'rgba(201,168,76,0.4)';
  } else if (status === 'error') {
    if (badge) { badge.textContent = '✕ failed'; badge.style.color = '#fca5a5'; }
    node.style.opacity = '0.7';
  }
}

// FEATURE 6: Show reason when time estimate increases
export function addTimeReason(reason) {
  _timeIncreaseReasons.push(reason);
  const el = document.getElementById('rms-time-reason');
  if (el) {
    el.textContent = reason;
    el.style.color = '#fca5a5';
    // Fade back to normal after 5s
    setTimeout(() => { if (el) { el.style.color = 'var(--muted)'; } }, 5000);
  }
}

export function hideRoadmap() {
  const el = document.getElementById('aiRoadmap');
  if (el) el.style.display = 'none';
}

function getPrevStepId(stepId) {
  const ids = ROADMAP_STEPS.map(s => s.id.replace('rms-', ''));
  const i   = ids.indexOf(stepId);
  return i > 0 ? ids[i - 1] : null;
}

window.showRoadmap    = showRoadmap;
window.setRoadmapStep = setRoadmapStep;
window.hideRoadmap    = hideRoadmap;
window.addTimeReason  = addTimeReason;
