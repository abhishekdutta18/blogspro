// ═══════════════════════════════════════
// seo-page.js — SEO Tools Functions
// ═══════════════════════════════════════

import { callAI } from "./ai-core.js";
import { showToast, sanitize, setBtnLoading, parseAIJson } from "./config.js";
import { state } from "./state.js";


// ═══════════════════════════════════════
// PREDICT TRAFFIC
// ═══════════════════════════════════════

window.predictTraffic = async function () {

  const keyword = document.getElementById("trafficKeyword").value.trim();

  if (!keyword) {
    showToast("Enter a keyword.", "error");
    return;
  }

  setBtnLoading("btnTraffic", "trafficBtnTxt", "trafficSpinner", true, "Analyzing…");

  const result = await callAI(
`Estimate Google search traffic for keyword: "${keyword}" in India fintech niche.

Return ONLY JSON:

{
"monthly_searches":"number",
"expected_clicks":"number",
"difficulty":0-100,
"competition":"low|medium|high",
"suggestions":["tip1","tip2","tip3"]
}`
  );

  setBtnLoading("btnTraffic", "trafficBtnTxt", "trafficSpinner", false, "Predict Traffic");

  const parsed = parseAIJson(result.error ? "" : result.text);

  if (!parsed) {

    showToast(result.error || "Traffic analysis failed", "error");
    return;
  }

  document.getElementById("tr-searches").textContent =
    parsed.monthly_searches || "—";

  document.getElementById("tr-clicks").textContent =
    parsed.expected_clicks || "—";

  document.getElementById("tr-diff").textContent =
    (parsed.difficulty || 0) + "/100";

  document.getElementById("tr-suggestions").innerHTML = sanitize(
    (parsed.suggestions || [])
      .map(s => `<div>💡 ${s}</div>`)
      .join("")
  );

  document.getElementById("trafficResult").style.display = "block";
};



// ═══════════════════════════════════════
// CONTENT GAP
// ═══════════════════════════════════════

window.findContentGap = async function () {

  const domain = document.getElementById("competitorDomain").value.trim();

  if (!domain) {

    showToast("Enter competitor domain", "error");
    return;
  }

  setBtnLoading("btnGap", "gapBtnTxt", "gapSpinner", true, "Analyzing…");

  const result = await callAI(
`Find SEO content gaps between blogspro.in and ${domain}

Return ONLY JSON:

{
"topics":[
{"title":"","priority":"high|medium|low","reason":""}
]
}`
  );

  setBtnLoading("btnGap", "gapBtnTxt", "gapSpinner", false, "Analyze Gap");

  const parsed = parseAIJson(result.error ? "" : result.text);

  const el = document.getElementById("gapResult");

  if (!parsed?.topics?.length) {

    el.innerHTML = "<div>No results.</div>";
    return;
  }

  el.innerHTML = sanitize(
    parsed.topics
      .map(t => `
      <div class="result-item">
        <div>
          <strong>${t.title}</strong>
          <div>${t.reason}</div>
        </div>
        <span>${t.priority}</span>
      </div>
      `)
      .join("")
  );

  el.style.display = "block";
};



// ═══════════════════════════════════════
// BACKLINK OPPORTUNITIES
// ═══════════════════════════════════════

window.generateBacklinks = async function () {

  const topic = document.getElementById("backlinkTopic").value.trim();

  if (!topic) {

    showToast("Enter topic", "error");
    return;
  }

  setBtnLoading("btnBacklinks", "blBtnTxt", "blSpinner", true, "Finding…");

  const result = await callAI(
`Find backlink outreach opportunities for topic "${topic}"

Return ONLY JSON:

{
"sites":[
{"name":"","domain":"","type":"","pitch":""}
]
}`
  );

  setBtnLoading("btnBacklinks", "blBtnTxt", "blSpinner", false, "Find Opportunities");

  const parsed = parseAIJson(result.error ? "" : result.text);

  const el = document.getElementById("backlinkResult");

  if (!parsed?.sites?.length) {

    el.innerHTML = "<div>No results</div>";
    return;
  }

  el.innerHTML = sanitize(
    parsed.sites
      .map(s => `
      <div class="result-item">
        <strong>${s.name || s.domain}</strong>
        <div>${s.pitch}</div>
        <span>${s.type}</span>
      </div>
      `)
      .join("")
  );

  el.style.display = "block";
};



// ═══════════════════════════════════════
// HEADLINE GENERATOR
// ═══════════════════════════════════════

window.optimizeHeadline = async function () {

  const topic = document.getElementById("headlineTopic").value.trim();

  if (!topic) {

    showToast("Enter topic", "error");
    return;
  }

  setBtnLoading("btnHeadline", "headlineBtnTxt", "headlineSpinner", true, "Generating…");

  const result = await callAI(
`Generate 10 viral blog headlines for topic "${topic}"

Return ONLY JSON:

{
"headlines":[
{"title":"","ctr_score":0-100,"technique":""}
]
}`
  );

  setBtnLoading("btnHeadline", "headlineBtnTxt", "headlineSpinner", false, "Generate Headlines");

  const parsed = parseAIJson(result.error ? "" : result.text);

  const el = document.getElementById("headlineResult");

  if (!parsed?.headlines?.length) {

    el.innerHTML = "<div>No results</div>";
    return;
  }

  el.innerHTML = sanitize(
    parsed.headlines
      .sort((a,b)=>b.ctr_score-a.ctr_score)
      .map(h => `
      <div class="headline-item">
        <strong>${h.title}</strong>
        <span>${h.ctr_score}</span>
        <div>${h.technique}</div>
      </div>
      `)
      .join("")
  );

  el.style.display = "block";
};


// ═══════════════════════════════════════
// POPULATE ANALYZE SELECT
// Called by nav.js when switching to the SEO Tools view
// ═══════════════════════════════════════
export function populateAnalyzeSelect() {
  const sel = document.getElementById('analyzePostSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select a post —</option>' +
    (state.allPosts || [])
      .filter(p => p.published)
      .map(p => `<option value="${p.id}">${p.title || '(Untitled)'}</option>`)
      .join('');
}
