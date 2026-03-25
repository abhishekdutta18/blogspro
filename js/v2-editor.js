// ═══════════════════════════════════════════════
// v2-editor.js — 3-column editor UI helpers
// v2 left panel, word count sync, roadmap/participation
// toggles, topic bridging, failed-section retry
// ═══════════════════════════════════════════════
import { callAI } from './ai-core.js';
import { sanitize, showToast } from './config.js';
import { state } from './state.js';

// ── Tab switching (AI / Images) ──────────────
export function v2ShowTab(tab) {
  const ai   = document.getElementById('v2-tab-ai');
  const imgs = document.getElementById('v2-tab-imgs');
  if (ai)   ai.style.display   = tab === 'ai'   ? 'block' : 'none';
  if (imgs) imgs.style.display = tab === 'imgs' ? 'block' : 'none';
  document.querySelectorAll('.v2-ltab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && tab === 'ai') || (i === 1 && tab === 'imgs'));
  });
}
window.v2ShowTab = v2ShowTab;

// ── Collapsible sections ─────────────────────
export function toggleV2Sec(head) {
  const body = head.nextElementSibling;
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  const arrow = head.querySelector('span:last-child');
  if (arrow) arrow.textContent = isOpen ? '▸' : '▾';
}
window.toggleV2Sec = toggleV2Sec;

// ── Word count preset buttons ─────────────────
export function v2SetWC(btn, words) {
  document.querySelectorAll('.v2-wc-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const wt = document.getElementById('wordTarget');
  if (wt) wt.value = words;
  // Sync legacy drawer buttons
  document.querySelectorAll('.word-target-btn').forEach(b => {
    const on = parseInt(b.dataset.words) === words;
    b.classList.toggle('active', on);
    b.style.background  = on ? 'rgba(201,168,76,0.1)' : 'transparent';
    b.style.borderColor = on ? 'rgba(201,168,76,0.3)' : '';
    b.style.color       = on ? 'var(--gold)' : '';
  });
  const lf = document.getElementById('v2LongForm');
  if (lf) lf.style.display = words >= 20000 ? 'block' : 'none';
  const lf2 = document.getElementById('longFormNotice');
  if (lf2) lf2.style.display = words >= 20000 ? 'block' : 'none';
  const lbl = document.getElementById('v2WCLabel');
  if (lbl) lbl.textContent = words >= 1000 ? (words / 1000) + 'k' : String(words);
  const inp = document.getElementById('v2WCInput');
  if (inp) inp.value = '';
}
window.v2SetWC = v2SetWC;

// ── Custom word count input (max 100,000) ─────
export function v2ApplyCustomWC(input) {
  let v = parseInt(input.value);
  if (isNaN(v) || v < 1) {
    const lbl = document.getElementById('v2WCLabel');
    if (lbl) lbl.textContent = '—';
    return;
  }
  if (v > 100000) { v = 100000; input.value = 100000; }
  const wt = document.getElementById('wordTarget');
  if (wt) wt.value = v;
  document.querySelectorAll('.v2-wc-btn').forEach(b => b.classList.remove('active'));
  const lbl = document.getElementById('v2WCLabel');
  if (lbl) lbl.textContent = v >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'k' : String(v);
  const lf = document.getElementById('v2LongForm');
  if (lf) lf.style.display = v >= 20000 ? 'block' : 'none';
  // Sync legacy custom input
  const ci = document.getElementById('wordTargetCustom');
  if (ci) ci.value = v;
}
window.v2ApplyCustomWC = v2ApplyCustomWC;

// ── Topic bridging: v2 panel → aiPrompt ───────
export function syncV2Topic(val) {
  const ap = document.getElementById('aiPrompt');
  if (ap) ap.value = val;
}
window.syncV2Topic = syncV2Topic;

// ── Model bridging: v2 selector → modelArticle ─
export function v2SyncModel(val) {
  const m = document.getElementById('modelArticle');
  if (m) m.value = val;
  if (typeof window.onModelChange === 'function') window.onModelChange(val);
}
window.v2SyncModel = v2SyncModel;

// ── Generate button — sync all v2 fields then fire
export function v2BeforeGenerate() {
  // Sync topic
  const v2Topic = document.getElementById('v2TopicPrompt')?.value.trim();
  const ap = document.getElementById('aiPrompt');
  if (v2Topic && ap) ap.value = v2Topic;
  // Sync model
  const v2Model = document.getElementById('v2Model')?.value;
  const ma = document.getElementById('modelArticle');
  if (v2Model && ma) {
    ma.value = v2Model;
    if (typeof window.onModelChange === 'function') window.onModelChange(v2Model);
  }
  // Sync tone
  const v2Tone = document.getElementById('v2WriteTone')?.value;
  const at = document.getElementById('aiTone');
  if (v2Tone && at) at.value = v2Tone.toLowerCase();
  // Fire
  if (typeof window.handleGenerateClick === 'function') window.handleGenerateClick();
}
window.v2BeforeGenerate = v2BeforeGenerate;

// ── Scroll to inline AI tools ─────────────────
export function v2ScrollToAit() {
  document.getElementById('v2AitSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.v2ScrollToAit = v2ScrollToAit;

// ── Roadmap / participation panel toggle ──────
export function v2TogglePanel(bodyId, head) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  const arrow = head.querySelector('span:last-child');
  if (arrow) arrow.textContent = isOpen ? '▸' : '▾';
}
window.v2TogglePanel = v2TogglePanel;

// ── On load: sync v2 selectors from legacy fields ─
document.addEventListener('DOMContentLoaded', () => {
  // Pre-fill v2 topic from aiPrompt if already set
  const ap = document.getElementById('aiPrompt');
  const v2 = document.getElementById('v2TopicPrompt');
  if (ap && v2 && ap.value && !v2.value) v2.value = ap.value;

  // Sync v2 tone selector changes back to aiTone
  const v2Tone = document.getElementById('v2WriteTone');
  if (v2Tone) {
    v2Tone.addEventListener('change', () => {
      const at = document.getElementById('aiTone');
      if (at) at.value = v2Tone.value.toLowerCase();
    });
  }
});

// ── Retry a single failed section inline ──────
window.retrySectionGen = async function(btn) {
  const block = btn.closest('.failed-section-block');
  if (!block) return;

  const section  = block.dataset.section  || '';
  const topic    = block.dataset.topic    || section;
  const category = block.dataset.category || 'Fintech';
  const tone     = block.dataset.tone     || 'Professional';
  const words    = parseInt(block.dataset.words) || 600;
  const model    = block.dataset.model    || 'auto';

  btn.disabled    = true;
  btn.textContent = '⏳ Generating…';
  block.classList.add('retrying');

  const inner = block.querySelector('.failed-section-inner');
  const sp = inner?.querySelector('.failed-text span');
  if (sp) sp.textContent = 'Requesting from AI model…';

  const result = await callAI(
    `Write a detailed section titled "${section}" for an article about: "${topic}".
Category: ${category}. Tone: ${tone}. Target: ${words} words.
Write 4-6 solid paragraphs with examples and analysis.
Return ONLY clean HTML using h2,h3,p,strong,em,blockquote,ul,li tags.`,
    true, model, 8000
  );

  block.classList.remove('retrying');

  if (!result.error && result.text) {
    const clean = sanitize(result.text.replace(/```html?|```/gi, '').replace(/<h1[^>]*>.*?<\/h1>/gi, '').trim());
    block.style.transition = 'opacity 0.4s';
    block.style.opacity    = '0';
    setTimeout(() => {
      const tmp = document.createElement('div');
      tmp.innerHTML = clean;
      block.replaceWith(tmp);
      if (typeof window.updateWordCount === 'function') window.updateWordCount();
      showToast(`"${section.substring(0, 40)}" regenerated!`, 'success');
    }, 400);
  } else {
    btn.disabled    = false;
    btn.textContent = '🔄 Retry Now';
    if (sp) sp.textContent = 'Still failing — ' + (result.error || 'try again or write manually');
    showToast('Retry failed. Try again in a moment.', 'error');
  }
};


// ── doLogout — called by onclick in admin.html ─
// Bridges the onclick="doLogout()" button to initLogout's signOut logic
import { auth } from './config.js';
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ── Generate Article button bridge ───────────
// Both btnAI (onclick="handleGenerateClick()") and v2BeforeGenerate() call this.
// It delegates to generateAIPost() from ai-writer.js which is registered on window.
window.handleGenerateClick = () => {
  if (typeof window.generateAIPost === 'function') {
    window.generateAIPost();
  } else {
    console.error('generateAIPost not loaded yet — check ai-writer.js import in main.js');
  }
};
window.doLogout = async () => {
  try { await signOut(auth); } catch(_) {}
  window.location.href = 'login.html';
};

// ── runCitationEngine — referenced in admin.html ─
window.runCitationEngine = async () => {
  if (typeof window.aiEditAction === 'function') {
    await window.aiEditAction('references');
  }
};

// ── triggerPostAudit — manual audit button handler ─
// Loads post-audit.js on demand (module is not bundled by default)
// then calls runFullAudit('manual').
window.triggerPostAudit = async () => {
  const btn = document.getElementById('btnRunAudit');

  // If already loaded, call immediately (module is eagerly loaded by main.js)
  if (typeof window.runPostAudit === 'function') {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Auditing…'; }
    try {
      await window.runPostAudit();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🛡 Audit'; }
    }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Loading…'; }
  try {
    showToast('Loading audit engine…', 'info');
    await import('./post-audit.js');
    // post-audit.js sets window.runPostAudit on load
    // Allow 500ms for the module's setTimeout(installHooks, 400) to complete
    await new Promise(r => setTimeout(r, 500));
    if (typeof window.runPostAudit === 'function') {
      await window.runPostAudit();
    } else {
      showToast('Audit engine not available — check console.', 'error');
    }
  } catch (e) {
    showToast('Audit engine failed to load: ' + e.message, 'error');
    console.error('[triggerPostAudit]', e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🛡 Audit'; }
  }
};
