// ═══════════════════════════════════════════════
// seo-page.js — SEO Tools page functions
// ═══════════════════════════════════════════════
import { callAI }    from './ai-core.js';
import { showToast, slugify, sanitize, setBtnLoading, parseAIJson } from './config.js';
import { state }     from './state.js';

export function populateAnalyzeSelect() {
  const sel = document.getElementById('analyzePostSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">Select a post…</option>' +
    state.allPosts.map(p => `<option value="${p.id}">${p.title||'(Untitled)'}</option>`).join('');
}

window.predictTraffic = async () => {
  const keyword = document.getElementById('trafficKeyword').value.trim();
  if (!keyword) { showToast('Enter a keyword.','error'); return; }
  setBtnLoading('btnTraffic','trafficBtnTxt','trafficSpinner',true,'Analyzing…');
  const result = await callAI(
    `Estimate Google search traffic for keyword: "${keyword}" in the fintech/finance niche in India.\nReturn ONLY JSON:\n{"monthly_searches":"number like 12000","expected_clicks":"number like 960","difficulty":0-100,"competition":"low|medium|high","suggestions":["tip1","tip2","tip3"]}`,
    true
  );
  setBtnLoading('btnTraffic','trafficBtnTxt','trafficSpinner',false,'Predict Traffic');
  let parsed = parseAIJson(result.error ? '' : (result.text || ''));
  if (parsed) {
    document.getElementById('tr-searches').textContent = parsed.monthly_searches || '—';
    document.getElementById('tr-clicks').textContent   = parsed.expected_clicks?.toLocaleString() || '—';
    const diff = parsed.difficulty || 0;
    document.getElementById('tr-diff').textContent = diff+'/100';
    const diffEl = document.getElementById('tr-diff-sub');
    if (diffEl) { diffEl.className='metric-sub '+(diff<=40?'good':diff<=70?'warn':'bad'); diffEl.textContent=diff<=40?'Low competition':diff<=70?'Medium':'Highly competitive'; }
    const comp = parsed.competition||'medium';
    const compPct = {low:25,medium:55,high:85}[comp]||50;
    const compFill = document.getElementById('tr-comp-bar');
    if (compFill) { compFill.className='progress-bar-fill '+(comp==='low'?'fill-green':comp==='medium'?'fill-gold':'fill-red'); compFill.style.width=compPct+'%'; }
    const compLabel = document.getElementById('tr-comp-label');
    if (compLabel) { compLabel.textContent=comp.toUpperCase(); compLabel.style.color=comp==='low'?'var(--green)':comp==='medium'?'var(--gold)':'#fca5a5'; }
    document.getElementById('tr-suggestions').innerHTML = (parsed.suggestions||[]).map(s=>`<div style="padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.04)">💡 ${s}</div>`).join('');
    document.getElementById('trafficResult').style.display = 'block';
  } else { showToast(result.error||'Failed to analyze.','error'); }
};

window.findContentGap = async () => {
  const domain = document.getElementById('competitorDomain').value.trim();
  if (!domain) { showToast('Enter a competitor domain.','error'); return; }
  setBtnLoading('btnGap','gapBtnTxt','gapSpinner',true,'Analyzing…');
  const result = await callAI(
    `Find SEO content gaps. A fintech blog at blogspro.in vs competitor at ${domain}.\nSuggest 10 topics the competitor likely ranks for that we should write.\nReturn ONLY JSON:\n{"topics":[{"title":"","priority":"high|medium","reason":""}]}`,
    true
  );
  setBtnLoading('btnGap','gapBtnTxt','gapSpinner',false,'Analyze Gap');
  let parsed = parseAIJson(result.error ? '' : (result.text || ''));
  const el = document.getElementById('gapResult');
  if (el && parsed?.topics?.length) {
    el.style.display='flex';
    el.innerHTML = sanitize(el.innerHTML = sanitize(parsed.topics.map(t=>`<div class="result-item"><div class="result-item-body"><div class="result-item-title">${t.title||'—'}</div><div class="result-item-sub">${t.reason||''}</div></div><div class="result-item-badge ${t.priority==='high'?'badge-red':t.priority==='medium'?'badge-gold':'badge-blue'}">${(t.priority||'low').toUpperCase()}</div><button onclick="quickNewPost(this)" data-title="${t.title}" style="flex-shrink:0;background:var(--navy);border:1px solid var(--border);color:var(--muted);padding:0.2rem 0.5rem;border-radius:2px;font-family:var(--sans);font-size:0.68rem;cursor:pointer;margin-left:0.4rem" onmouseover="this.style.borderColor='var(--gold)';this.style.color='var(--gold)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">+ Write</button></div>`).join('');.replace('el.innerHTML = ', ''));
  } else if (el) { el.style.display='flex'; el.innerHTML=`<div style="padding:1rem;color:var(--muted);font-size:0.85rem">Could not parse results. Try again.</div>`; showToast(result.error||'Failed.','error'); }
};

window.generateBacklinks = async () => {
  const topic = document.getElementById('backlinkTopic').value.trim();
  if (!topic) { showToast('Enter a topic.','error'); return; }
  setBtnLoading('btnBacklinks','blBtnTxt','blSpinner',true,'Finding…');
  const result = await callAI(
    `Find 8 backlink outreach opportunities for a fintech blog about: "${topic}".\nReturn ONLY JSON:\n{"sites":[{"name":"site name","domain":"domain.com","type":"guest post|link exchange|resource page|mention","pitch":"1-sentence pitch"}]}`,
    true
  );
  setBtnLoading('btnBacklinks','blBtnTxt','blSpinner',false,'Find Opportunities');
  let parsed = parseAIJson(result.error ? '' : (result.text || ''));
  const el = document.getElementById('backlinkResult');
  if (el && parsed?.sites?.length) {
    el.style.display='flex';
    el.innerHTML = sanitize(el.innerHTML = sanitize(parsed.sites.map(s=>`<div class="result-item"><div class="result-item-icon">🔗</div><div class="result-item-body"><div class="result-item-title">${s.name||s.domain||'—'}</div><div class="result-item-sub">${s.pitch||''}</div></div><div class="result-item-badge badge-blue">${(s.type||'').toUpperCase()}</div></div>`).join('');.replace('el.innerHTML = ', ''));
  } else if (el) { el.style.display='flex'; el.innerHTML=`<div style="padding:1rem;color:var(--muted);font-size:0.85rem">${result.error||'No results.'}</div>`; }
};

window.analyzePostSEO = async () => {
  const id = document.getElementById('analyzePostSelect').value;
  if (!id) { showToast('Select a post first.','error'); return; }
  setBtnLoading('btnAnalyze','analyzeBtnTxt','analyzeSpinner',true,'Analyzing…');
  const post = state.allPosts.find(p=>p.id===id);
  if (!post) { showToast('Post not found.','error'); return; }
  const text = (post.content||'').replace(/<[^>]+>/g,' ').trim().substring(0,1500);
  const result = await callAI(
    `Analyze this fintech blog post for SEO quality.\nTitle: "${post.title}"\nContent: "${text}"\nReturn ONLY JSON:\n{"seo_score":0-100,"strengths":["s1","s2"],"improvements":["i1","i2","i3","i4"]}`,
    true
  );
  setBtnLoading('btnAnalyze','analyzeBtnTxt','analyzeSpinner',false,'Analyze');
  let parsed = parseAIJson(result.error ? '' : (result.text || ''));
  if (parsed) {
    const score = parsed.seo_score||0;
    const ring  = document.getElementById('seoScoreRing');
    if (ring) { ring.textContent=score; ring.className='seo-score-ring '+(score>=80?'score-high':score>=60?'score-med':'score-low'); }
    const label = document.getElementById('seoScoreLabel');
    if (label) label.textContent = score>=80?'Excellent SEO':score>=60?'Good SEO — Minor improvements':score>=40?'Average — Needs work':'Poor — Major optimization needed';
    const sub = document.getElementById('seoScoreSub');
    if (sub) sub.textContent = `Word count: ~${post.content?.split(/\s+/).length||0} · Score based on structure, keywords, and content quality`;
    const improvements = document.getElementById('seoImprovements');
    if (improvements) improvements.innerHTML =
      (parsed.strengths||[]).map(s=>`<div class="result-item"><div class="result-item-icon">✅</div><div class="result-item-body"><div class="result-item-title">${s}</div></div></div>`).join('')+
      (parsed.improvements||[]).map(s=>`<div class="result-item"><div class="result-item-icon">⚠️</div><div class="result-item-body"><div class="result-item-title">${s}</div></div></div>`).join('');
    document.getElementById('seoAnalysisResult').style.display = 'block';
  } else { showToast(result.error||'Analysis failed.','error'); }
};

window.generateTopicClusters = async () => {
  const topic    = document.getElementById('clusterTopic').value.trim();
  const category = document.getElementById('clusterCategory').value;
  if (!topic) { showToast('Enter a topic.','error'); return; }
  setBtnLoading('btnCluster','clusterBtnTxt','clusterSpinner',true,'Generating…');
  const result = await callAI(
    `Create a comprehensive SEO content cluster for a fintech blog.\nPillar Topic: "${topic}" (Category: ${category})\nReturn ONLY JSON:\n{"pillar":"pillar article title","pillar_desc":"brief description","clusters":[{"title":"cluster topic 1","angle":"search angle"},{"title":"cluster topic 2","angle":"search angle"},{"title":"cluster topic 3","angle":"search angle"},{"title":"cluster topic 4","angle":"search angle"},{"title":"cluster topic 5","angle":"search angle"},{"title":"cluster topic 6","angle":"search angle"},{"title":"cluster topic 7","angle":"search angle"},{"title":"cluster topic 8","angle":"search angle"}]}`,
    true
  );
  setBtnLoading('btnCluster','clusterBtnTxt','clusterSpinner',false,'Generate Clusters');
  let parsed = parseAIJson(result.error ? '' : (result.text || ''));
  const el = document.getElementById('clusterResult');
  if (el && parsed) {
    el.style.display = 'block';
    el.innerHTML = `
      <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.2);border-radius:3px;padding:0.8rem;margin-bottom:0.8rem">
        <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;color:var(--gold);margin-bottom:0.3rem">PILLAR</div>
        <div style="font-size:0.9rem;font-weight:600;color:var(--cream)">${parsed.pillar||topic}</div>
        <div style="font-size:0.75rem;color:var(--muted);margin-top:0.2rem">${parsed.pillar_desc||''}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
        ${(parsed.clusters||[]).map(c=>`<div class="result-item" style="cursor:pointer" onclick="quickNewPost(this)" data-title="${c.title}"><div class="result-item-body"><div class="result-item-title">${c.title}</div><div class="result-item-sub">${c.angle||''}</div></div></div>`).join('')}
      </div>`;
    showToast('Content cluster ready!','success');
  } else { showToast(result.error||'Failed.','error'); }
};

window.generateContentCalendar = async () => {
  const category = document.getElementById('calCategory').value;
  const topic    = document.getElementById('calTopic')?.value.trim()||'fintech';
  setBtnLoading('btnCalendar','calBtnTxt','calSpinner',true,'Generating…');
  const result = await callAI(
    `Create a 30-day content calendar for a fintech blog.\nCategory: ${category}. Topic seed: "${topic}".\nReturn ONLY JSON:\n{"week1":[{"day":1,"title":"","category":"","hook":""},{"day":3,"title":"","category":"","hook":""},{"day":5,"title":"","category":"","hook":""}],"week2":[{"day":8,"title":"","category":"","hook":""},{"day":10,"title":"","category":"","hook":""},{"day":12,"title":"","category":"","hook":""}],"week3":[{"day":15,"title":"","category":"","hook":""},{"day":17,"title":"","category":"","hook":""},{"day":19,"title":"","category":"","hook":""}],"week4":[{"day":22,"title":"","category":"","hook":""},{"day":24,"title":"","category":"","hook":""},{"day":26,"title":"","category":"","hook":""},{"day":28,"title":"","category":"","hook":""}]}`,
    true
  );
  setBtnLoading('btnCalendar','calBtnTxt','calSpinner',false,'Generate Calendar');
  let parsed = parseAIJson(result.error ? '' : (result.text || ''));
  if (parsed) {
    const weekColors  = ['rgba(201,168,76,0.1)','rgba(59,130,246,0.08)','rgba(34,197,94,0.08)','rgba(168,85,247,0.08)'];
    const weekBorders = ['rgba(201,168,76,0.3)','rgba(59,130,246,0.3)','rgba(34,197,94,0.3)','rgba(168,85,247,0.3)'];
    const weekLabels  = ['Week 1','Week 2','Week 3','Week 4'];
    const renderGrid  = (gridId) => {
      const grid = document.getElementById(gridId);
      if (!grid) return;
      grid.innerHTML = ['week1','week2','week3','week4'].map((w,wi)=>`
        <div style="background:${weekColors[wi]};border:1px solid ${weekBorders[wi]};border-radius:3px;padding:1rem">
          <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:0.75rem">${weekLabels[wi]}</div>
          ${(parsed[w]||[]).map(item=>`<div style="background:var(--navy);border:1px solid var(--border);border-radius:3px;padding:0.6rem 0.75rem;margin-bottom:0.5rem;cursor:pointer;transition:all 0.15s" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'" onclick="quickNewPost(this)" data-title="${item.title||''}"><div style="font-size:0.68rem;color:var(--muted)">Day ${item.day} · ${item.category||'Fintech'}</div><div style="font-size:0.82rem;font-weight:600;color:var(--cream);margin:0.2rem 0">${item.title||'—'}</div><div style="font-size:0.7rem;color:var(--muted);font-style:italic">${item.hook||''}</div></div>`).join('')}
        </div>`).join('');
    };
    ['calendarGrid','calendarGrid2'].forEach(id => { if(document.getElementById(id)) renderGrid(id); });
    ['calendarResult','calendarResult2'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='block'; });
    const empty = document.getElementById('calendarEmpty');
    if (empty) empty.style.display = 'none';
    showToast('30-day content calendar ready!','success');
  } else { showToast(result.error||'Calendar generation failed.','error'); }
};

window.optimizeHeadline = async () => {
  const topic = document.getElementById('headlineTopic').value.trim();
  const count = parseInt(document.getElementById('headlineCount').value)||10;
  if (!topic) { showToast('Enter a topic.','error'); return; }
  setBtnLoading('btnHeadline','headlineBtnTxt','headlineSpinner',true,'Generating…');
  const result = await callAI(
    `Generate ${count} viral, high-CTR blog headlines for a fintech article about: "${topic}".\nEach headline should use different techniques (numbers, power words, urgency, questions, etc.).\nReturn ONLY JSON:\n{"headlines":[{"title":"headline","ctr_score":0-100,"technique":"what makes it work"}]}`,
    true
  );
  setBtnLoading('btnHeadline','headlineBtnTxt','headlineSpinner',false,'🔥 Generate Headlines');
  let parsed = parseAIJson(result.error ? '' : (result.text || ''));
  const el = document.getElementById('headlineResult');
  if (el && parsed?.headlines?.length) {
    const sorted = [...parsed.headlines].sort((a,b)=>b.ctr_score-a.ctr_score);
    el.style.display='flex';
    el.innerHTML = sorted.map(h=>`<div class="headline-item"><div class="headline-ctr">${h.ctr_score}</div><div style="flex:1"><div class="headline-text">${h.title}</div><div style="font-size:0.68rem;color:var(--muted);margin-top:0.15rem">${h.technique||''}</div></div><button class="headline-use" onclick="useHeadline(this)" data-title="${h.title}">Use</button></div>`).join(''));
  } else if (el) { el.style.display='flex'; el.innerHTML=sanitize(`<div style="padding:1rem;color:var(--muted);font-size:0.85rem">${result.error||'No results.'}</div>`; showToast(result.error||'Failed.','error'); }
};

window.useHeadline = (btn) => {
  const title = btn.dataset.title;
  window.showView('editor');
  document.getElementById('postTitle').value = title;
  document.getElementById('postSlug').value  = slugify(title);
  showToast('Headline applied!','success');
};

window.quickNewPost = (el) => {
  const title = el.dataset.title || el.textContent.trim();
  window.showView('editor');
  window.clearEditor?.();
  document.getElementById('postTitle').value  = title;
  document.getElementById('postSlug').value   = slugify(title);
  document.getElementById('aiPrompt').value   = title;
  showToast(`New post started: "${title.substring(0,40)}"`, 'success');
};
