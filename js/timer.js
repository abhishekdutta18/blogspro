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
// ═══════════════════════════════════════════════
// Roadmap — dynamic pipeline with live LLM names
// ═══════════════════════════════════════════════

// Real provider metadata (mirrors ai-core.js PROVIDER_META)
const PROVIDER_DISPLAY = {
  groq:        { label: 'Kimi K2',        color: '#f55036', icon: '🌙' },
  openrouter:  { label: 'Qwen3 235B',     color: '#7c3aed', icon: '🐼' },
  together:    { label: 'DeepSeek V3',    color: '#0ea5e9', icon: '🔍' },
  deepinfra:   { label: 'Llama 3.3 70B', color: '#10b981', icon: '🦙' },
  gemini:      { label: 'Gemini 2.0',     color: '#4285f4', icon: '✨' },
  mistral:     { label: 'Mistral Large',  color: '#ff6b35', icon: '🌀' },
  deepseek:    { label: 'DeepSeek Chat',  color: '#3b82f6', icon: '💬' },
};

// Ordered fallback chain — matches providers.js TEXT_PROVIDERS
const PROVIDER_CHAIN = ['groq','openrouter','together','deepinfra','gemini','mistral','deepseek'];

const ROADMAP_STEPS = [
  { id: 'outline',  label: 'Outline',   icon: '📋', desc: 'Building structure' },
  { id: 'article',  label: 'Article',   icon: '✍️',  desc: 'Writing sections'  },
  { id: 'metadata', label: 'Metadata',  icon: '🏷',  desc: 'SEO fields'        },
  { id: 'done',     label: 'Complete',  icon: '🚀',  desc: 'Finalising'        },
];

// Track which provider responded for each step
const _stepProviders = {};

function _providerPill(provider) {
  if (!provider) return '';
  const p = PROVIDER_DISPLAY[provider];
  if (!p) return `<span style="font-size:0.6rem;color:var(--muted)">${provider}</span>`;
  return `<span style="
    display:inline-flex;align-items:center;gap:3px;
    font-size:0.6rem;font-weight:700;
    color:${p.color};
    background:${p.color}18;
    border:1px solid ${p.color}44;
    border-radius:3px;padding:1px 5px;
    white-space:nowrap;margin-top:2px;
    font-family:var(--mono,monospace)
  ">${p.icon} ${p.label}</span>`;
}

function _buildProviderChain(activeProvider) {
  return PROVIDER_CHAIN.map(id => {
    const p   = PROVIDER_DISPLAY[id];
    const act = id === activeProvider;
    return `<div style="
      display:flex;align-items:center;gap:4px;
      opacity:${act ? '1' : '0.3'};
      transition:opacity 0.3s;
      " id="rmchain-${id}">
      <span style="font-size:0.65rem">${p.icon}</span>
      <span style="font-size:0.62rem;font-weight:${act ? '700' : '400'};
                   color:${act ? p.color : 'var(--muted)'};">${p.label}</span>
      ${act ? `<span style="font-size:0.55rem;color:${p.color}">●</span>` : ''}
    </div>`;
  }).join('');
}

function buildRoadmap() {
  const track = document.getElementById('aiRoadmapTrack');
  if (!track) return;
  // Always rebuild so provider info can update
  track.innerHTML = `
    <div style="display:flex;align-items:flex-start;width:100%;gap:0;overflow-x:auto;padding-bottom:4px">
      ${ROADMAP_STEPS.map((s, i) => `
        <div style="display:flex;align-items:flex-start;flex:1;min-width:0">
          <div id="rms-${s.id}" style="
            display:flex;flex-direction:column;align-items:center;
            min-width:64px;flex:0 0 64px;
            opacity:0.3;transition:opacity 0.4s,transform 0.3s">
            <div id="rms-${s.id}-circle" style="
              width:32px;height:32px;border-radius:50%;
              background:var(--navy2,#111c30);
              border:1.5px solid var(--border);
              display:flex;align-items:center;justify-content:center;
              font-size:0.85rem;z-index:1;
              transition:border-color 0.3s,background 0.3s">
              ${s.icon}
            </div>
            <div style="font-size:0.65rem;font-weight:700;color:var(--cream);margin-top:4px;text-align:center">${s.label}</div>
            <div id="rms-${s.id}-badge" style="font-size:0.58rem;color:var(--muted);margin-top:1px;text-align:center">waiting</div>
            <div id="rms-${s.id}-provider" style="margin-top:2px"></div>
          </div>
          ${i < ROADMAP_STEPS.length - 1 ? `
            <div style="flex:1;padding-top:15px;min-width:8px">
              <div id="rms-${s.id}-line" style="height:1.5px;background:var(--border);transition:background 0.4s,width 0.6s ease;width:100%"></div>
            </div>` : ''}
        </div>`).join('')}
    </div>
    <div id="rms-provider-chain" style="
      display:none;
      flex-wrap:wrap;gap:0.35rem;
      margin-top:0.6rem;
      padding-top:0.5rem;
      border-top:1px solid rgba(255,255,255,0.06)">
    </div>`;
}

// Update provider chain display (called when a section resolves)
export function updateRoadmapProvider(stepId, provider) {
  _stepProviders[stepId] = provider;

  // Update the step's provider pill
  const el = document.getElementById(`rms-${stepId}-provider`);
  if (el) el.innerHTML = _providerPill(provider);

  // Update the header badges
  const badges = document.getElementById('aiRoadmapModelBadges');
  if (badges) {
    // Show all unique providers used so far
    const unique = [...new Set(Object.values(_stepProviders))];
    badges.innerHTML = unique.map(p => _providerPill(p)).join('');
  }

  // Show chain panel with active provider highlighted
  const chain = document.getElementById('rms-provider-chain');
  if (chain) {
    chain.style.display = 'flex';
    chain.innerHTML = `
      <span style="font-size:0.6rem;font-weight:700;letter-spacing:0.08em;
                   text-transform:uppercase;color:var(--muted);width:100%">
        Active LLM
      </span>` + _buildProviderChain(provider);
  }
}

export function showRoadmap() {
  const el = document.getElementById('aiRoadmap');
  if (el) el.style.display = 'block';

  // Reset all step providers
  Object.keys(_stepProviders).forEach(k => delete _stepProviders[k]);

  buildRoadmap();

  // Reset all steps to waiting state
  ROADMAP_STEPS.forEach(s => {
    const node    = document.getElementById(`rms-${s.id}`);
    const badge   = document.getElementById(`rms-${s.id}-badge`);
    const circle  = document.getElementById(`rms-${s.id}-circle`);
    const provEl  = document.getElementById(`rms-${s.id}-provider`);
    const line    = document.getElementById(`rms-${s.id}-line`);
    if (node)   { node.style.opacity = '0.3'; node.style.transform = 'scale(1)'; }
    if (badge)  { badge.textContent = 'waiting'; badge.style.color = 'var(--muted)'; }
    if (circle) { circle.style.borderColor = 'var(--border)'; circle.style.background = 'var(--navy2,#111c30)'; }
    if (provEl) { provEl.innerHTML = ''; }
    if (line)   { line.style.background = 'var(--border)'; }
  });

  // Clear header badges
  const badges = document.getElementById('aiRoadmapModelBadges');
  if (badges) badges.innerHTML = '';
}

export function setRoadmapStep(stepId, status, provider) {
  const node   = document.getElementById(`rms-${stepId}`);
  const badge  = document.getElementById(`rms-${stepId}-badge`);
  const circle = document.getElementById(`rms-${stepId}-circle`);
  const prevId = getPrevStepId(stepId);
  const prevLine = prevId ? document.getElementById(`rms-${prevId}-line`) : null;

  if (!node) return;

  if (status === 'active') {
    node.style.opacity   = '1';
    node.style.transform = 'scale(1.08)';
    if (badge)  { badge.textContent = '⏳ running…'; badge.style.color = '#c9a84c'; }
    if (circle) { circle.style.borderColor = '#c9a84c'; circle.style.background = 'rgba(201,168,76,0.08)'; }
    if (prevLine) prevLine.style.background = '#4ade80';

  } else if (status === 'done') {
    node.style.opacity   = '1';
    node.style.transform = 'scale(1)';
    if (badge)  { badge.textContent = '✓ done'; badge.style.color = '#4ade80'; }
    if (circle) { circle.style.borderColor = '#4ade80'; circle.style.background = 'rgba(74,222,128,0.08)'; }
    if (prevLine) prevLine.style.background = '#4ade80';
    const myLine = document.getElementById(`rms-${stepId}-line`);
    if (myLine) myLine.style.background = 'rgba(201,168,76,0.35)';
    if (provider) updateRoadmapProvider(stepId, provider);

  } else if (status === 'error') {
    node.style.opacity = '0.8';
    if (badge)  { badge.textContent = '✕ failed'; badge.style.color = '#fca5a5'; }
    if (circle) { circle.style.borderColor = '#fca5a5'; }
  }
}

export function hideRoadmap() {
  const el = document.getElementById('aiRoadmap');
  if (el) el.style.display = 'none';
}

function getPrevStepId(stepId) {
  const ids = ROADMAP_STEPS.map(s => s.id);
  const i   = ids.indexOf(stepId);
  return i > 0 ? ids[i - 1] : null;
}

window.showRoadmap          = showRoadmap;
window.setRoadmapStep       = setRoadmapStep;
window.hideRoadmap          = hideRoadmap;
window.updateRoadmapProvider = updateRoadmapProvider;
