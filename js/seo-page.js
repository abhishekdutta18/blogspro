// ═══════════════════════════════════════════════
// seo-page.js — SEO Tools page functions (FIXED)
// ═══════════════════════════════════════════════

import { callAI } from './ai-core.js';
import { showToast, slugify, sanitize, setBtnLoading, parseAIJson } from './config.js';
import { state } from './state.js';

function render(el, html) {
  if (!el) return;
  el.innerHTML = sanitize(html);
}

// Populate dropdown with posts
export function populateAnalyzeSelect() {
  const sel = document.getElementById('analyzePostSelect');
  if (!sel) return;

  sel.innerHTML =
    '<option value="">Select a post…</option>' +
    state.allPosts
      .map(p => `<option value="${p.id}">${p.title || '(Untitled)'}</option>`)
      .join('');
}

// ═════════════════════════════════════
// TRAFFIC PREDICTOR
// ═════════════════════════════════════
window.predictTraffic = async () => {
  const keyword = document.getElementById('trafficKeyword').value.trim();

  if (!keyword) {
    showToast('Enter a keyword.', 'error');
    return;
  }

  setBtnLoading('btnTraffic', 'trafficBtnTxt', 'trafficSpinner', true, 'Analyzing…');

  const result = await callAI(
`Estimate Google search traffic for keyword: "${keyword}" in the fintech/finance niche in India.
Return ONLY JSON:
{"monthly_searches":"number","expected_clicks":"number","difficulty":0-100,"competition":"low|medium|high","suggestions":["tip1","tip2","tip3"]}`,
true
  );

  setBtnLoading('btnTraffic', 'trafficBtnTxt', 'trafficSpinner', false, 'Predict Traffic');

  const parsed = parseAIJson(result.error ? '' : result.text || '');

  if (!parsed) {
    showToast(result.error || 'Failed to analyze.', 'error');
    return;
  }

  document.getElementById('tr-searches').textContent = parsed.monthly_searches || '—';
  document.getElementById('tr-clicks').textContent = parsed.expected_clicks || '—';

  const diff = parsed.difficulty || 0;

  document.getElementById('tr-diff').textContent = diff + '/100';

  const diffEl = document.getElementById('tr-diff-sub');

  if (diffEl) {
    diffEl.className =
      'metric-sub ' + (diff <= 40 ? 'good' : diff <= 70 ? 'warn' : 'bad');

    diffEl.textContent =
      diff <= 40 ? 'Low competition' :
      diff <= 70 ? 'Medium competition' :
      'Highly competitive';
  }

  render(
    document.getElementById('tr-suggestions'),
    (parsed.suggestions || [])
      .map(s => `<div style="padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.04)">💡 ${s}</div>`)
      .join('')
  );

  document.getElementById('trafficResult').style.display = 'block';
};


// ═════════════════════════════════════
// CONTENT GAP
// ═════════════════════════════════════
window.findContentGap = async () => {

  const domain = document.getElementById('competitorDomain').value.trim();

  if (!domain) {
    showToast('Enter a competitor domain.', 'error');
    return;
  }

  setBtnLoading('btnGap', 'gapBtnTxt', 'gapSpinner', true, 'Analyzing…');

  const result = await callAI(
`Find SEO content gaps between blogspro.in and ${domain}.
Return ONLY JSON:
{"topics":[{"title":"","priority":"high|medium|low","reason":""}]}`,
true
  );

  setBtnLoading('btnGap', 'gapBtnTxt', 'gapSpinner', false, 'Analyze Gap');

  const parsed = parseAIJson(result.error ? '' : result.text || '');

  const el = document.getElementById('gapResult');

  if (!parsed?.topics?.length) {
    render(el, `<div style="padding:1rem;color:var(--muted)">No results.</div>`);
    return;
  }

  render(
    el,
    parsed.topics.map(t => `
      <div class="result-item">

        <div class="result-item-body">
          <div class="result-item-title">${t.title}</div>
          <div class="result-item-sub">${t.reason}</div>
        </div>

        <div class="result-item-badge badge-${t.priority}">
          ${t.priority.toUpperCase()}
        </div>

        <button onclick="quickNewPost(this)" data-title="${t.title}">
          + Write
        </button>

      </div>
    `).join('')
  );

  el.style.display = 'flex';
};


// ═════════════════════════════════════
// BACKLINK OPPORTUNITIES
// ═════════════════════════════════════
window.generateBacklinks = async () => {

  const topic = document.getElementById('backlinkTopic').value.trim();

  if (!topic) {
    showToast('Enter a topic.', 'error');
    return;
  }

  setBtnLoading('btnBacklinks', 'blBtnTxt', 'blSpinner', true, 'Finding…');

  const result = await callAI(
`Find backlink opportunities for topic "${topic}".
Return ONLY JSON:
{"sites":[{"name":"","domain":"","type":"","pitch":""}]}`,
true
  );

  setBtnLoading('btnBacklinks', 'blBtnTxt', 'blSpinner', false, 'Find Opportunities');

  const parsed = parseAIJson(result.error ? '' : result.text || '');

  const el = document.getElementById('backlinkResult');

  if (!parsed?.sites?.length) {
    render(el, `<div style="padding:1rem;color:var(--muted)">No results.</div>`);
    return;
  }

  render(
    el,
    parsed.sites.map(s => `
      <div class="result-item">

        <div class="result-item-icon">🔗</div>

        <div class="result-item-body">
          <div class="result-item-title">${s.name || s.domain}</div>
          <div class="result-item-sub">${s.pitch}</div>
        </div>

        <div class="result-item-badge badge-blue">
          ${s.type.toUpperCase()}
        </div>

      </div>
    `).join('')
  );

  el.style.display = 'flex';
};


// ═════════════════════════════════════
// HEADLINE GENERATOR
// ═════════════════════════════════════
window.optimizeHeadline = async () => {

  const topic = document.getElementById('headlineTopic').value.trim();

  if (!topic) {
    showToast('Enter a topic.', 'error');
    return;
  }

  const result = await callAI(
`Generate viral blog headlines for topic "${topic}".
Return ONLY JSON:
{"headlines":[{"title":"","ctr_score":0-100,"technique":""}]}`,
true
  );

  const parsed = parseAIJson(result.error ? '' : result.text || '');

  const el = document.getElementById('headlineResult');

  if (!parsed?.headlines?.length) {
    render(el, `<div style="padding:1rem;color:var(--muted)">No results.</div>`);
    return;
  }

  const sorted = parsed.headlines.sort((a, b) => b.ctr_score - a.ctr_score);

  render(
    el,
    sorted.map(h => `
      <div class="headline-item">

        <div class="headline-ctr">${h.ctr_score}</div>

        <div style="flex:1">
          <div class="headline-text">${h.title}</div>
          <div style="font-size:0.7rem;color:var(--muted)">
            ${h.technique}
          </div>
        </div>

        <button onclick="useHeadline(this)" data-title="${h.title}">
          Use
        </button>

      </div>
    `).join('')
  );

  el.style.display = 'flex';
};


// ═════════════════════════════════════
// USE HEADLINE
// ═════════════════════════════════════
window.useHeadline = (btn) => {

  const title = btn.dataset.title;

  window.showView('editor');

  document.getElementById('postTitle').value = title;
  document.getElementById('postSlug').value = slugify(title);

  showToast('Headline applied!', 'success');
};


// ═════════════════════════════════════
// QUICK NEW POST
// ═════════════════════════════════════
window.quickNewPost = (el) => {

  const title = el.dataset.title || el.textContent.trim();

  window.showView('editor');

  window.clearEditor?.();

  document.getElementById('postTitle').value = title;
  document.getElementById('postSlug').value = slugify(title);
  document.getElementById('aiPrompt').value = title;

  showToast(`New post started: "${title.substring(0,40)}"`, 'success');
};
