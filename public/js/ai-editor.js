// ═══════════════════════════════════════════════
// ai-editor.js — Post editing AI tools
// ═══════════════════════════════════════════════
import { cleanEditorHTML, sanitize, showToast } from "./config.js";
import { callAI }  from './ai-core.js';
import { workerFetch } from "./worker-endpoints.js";
import { state }   from './state.js';
import { updateWordCount } from './editor.js';

function getEditor() { return document.getElementById('editor'); }

function setEditStatus(msg, isError = false) {
  const el = document.getElementById('aiEditStatus');
  if (!el) return;
  el.style.color = isError ? '#fca5a5' : 'var(--muted)';
  el.innerHTML = msg; // use innerHTML so we can embed progress bar HTML
}

// Renders an inline progress bar into the status area
function setEditProgress(current, total, label = '') {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  setEditStatus(`
    <div style="margin-bottom:4px;font-size:0.72rem;color:var(--muted)">${label || `Section ${current} of ${total}`}</div>
    <div style="background:rgba(255,255,255,0.06);border-radius:3px;height:6px;overflow:hidden;width:100%">
      <div style="background:linear-gradient(90deg,var(--gold),var(--gold2));height:100%;width:${pct}%;transition:width 0.4s ease;border-radius:3px"></div>
    </div>
    <div style="margin-top:3px;font-size:0.68rem;color:var(--gold)">${pct}%</div>
  `);
}

function setEditBtnsDisabled(on) {
  document.querySelectorAll('.ai-edit-btn').forEach(b => b.disabled = on);
}

function _deriveKeywordSeed(title, topic, category) {
  const base = `${title || ''} ${topic || ''} ${category || ''}`.toLowerCase();
  const words = base.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4);
  return [...new Set(words)].slice(0, 8);
}

function _expandAcronymsInHtml(html = '') {
  const map = {
    upi: 'Unified Payments Interface',
    rbi: 'Reserve Bank of India',
    sebi: 'Securities and Exchange Board of India',
    kyc: 'Know Your Customer',
    aml: 'Anti-Money Laundering',
    npa: 'Non-Performing Asset',
    api: 'Application Programming Interface',
    bnpl: 'Buy Now, Pay Later',
    neft: 'National Electronic Funds Transfer',
    rtgs: 'Real Time Gross Settlement',
    imps: 'Immediate Payment Service',
    gst: 'Goods and Services Tax',
  };
  let out = String(html || '');
  for (const [abbr, full] of Object.entries(map)) {
    const ab = abbr.toUpperCase();
    const re = new RegExp(`\\b${ab}\\b`);
    if (re.test(out) && !new RegExp(`${ab}\\s*\\(`).test(out)) {
      out = out.replace(re, `${ab} (${full})`);
    }
  }
  return out;
}

async function runAIEdit(instruction) {
  const editor      = getEditor();
  const currentHTML = editor?.innerHTML || '';
  const currentText = editor?.textContent || '';
  const topic    = document.getElementById('aiPrompt')?.value.trim()
                || document.getElementById('v2TopicPrompt')?.value.trim()
                || 'fintech article';
  const category = document.getElementById('postCategory')?.value || 'General';
  const model    = document.getElementById('modelArticle')?.value || 'auto';
  const relevanceRule = `CRITICAL RELEVANCE: Keep all edits strictly focused on "${topic}" in "${category}". Do not introduce unrelated domains or generic filler.`;
  if (!currentText?.trim()) { setEditStatus('No article content.', true); return; }

  // FIX: Back up content before any destructive AI edit
  state.lastSavedContent = currentHTML;

  setEditBtnsDisabled(true);
  const wordCount = currentText.trim().split(/\s+/).filter(Boolean).length;
  const isLong    = wordCount > 800;

  if (isLong) {
    const sections = currentHTML.split(/(?=<h2[^>]*>)/i).filter(Boolean);

    if (sections.length <= 1) {
      // Chunk by characters
      const chunks    = [];
      const chunkSize = 3000;
      for (let i = 0; i < currentText.length; i += chunkSize) {
        chunks.push(currentText.substring(i, i + chunkSize));
      }
      const results = [];
      for (let i = 0; i < chunks.length; i++) {
        setEditProgress(i + 1, chunks.length, `⏳ Editing chunk ${i + 1} of ${chunks.length}…`);
        const r = await callAI(
          `Edit this section of a fintech article about "${topic}" (${category}).
SECTION: ${chunks[i]}
TASK: ${instruction}
${relevanceRule}
Write ONLY in English. Return ONLY clean HTML. Same length or longer.`,
          true, model, 8000
        );
        results.push(r.error ? chunks[i] : (r.text || '').replace(/```html?|```/gi, '').trim());
      }
      editor.innerHTML = sanitize(results.join('\n'));

    } else {
      const edited = new Array(sections.length).fill(null);
      for (let i = 0; i < sections.length; i++) {
        const secTitle = (sections[i].match(/<h2[^>]*>([^<]*)<\/h2>/i)?.[1] || `Section ${i + 1}`).trim();
        setEditProgress(i + 1, sections.length, `⏳ Editing: "${secTitle.substring(0, 40)}"`);
        const r = await callAI(
          `Edit this section of a fintech article about "${topic}" (${category}).
Section ${i + 1} of ${sections.length}: "${secTitle}"
SECTION HTML: ${sections[i]}
TASK: ${instruction}
${relevanceRule}
Write ONLY in English. Return ONLY clean HTML for this section. Same or more words.`,
          true, model, 8000
        );
        edited[i] = r.error
          ? sections[i]
          : (r.text || '').replace(/```html?|```/gi, '').replace(/<h1[^>]*>.*?<\/h1>/gi, '').trim();
        // Update editor live after each section
        editor.innerHTML = sanitize(edited.map((s, j) => s ?? sections[j]).join('\n'));
        updateWordCount();
      }
      editor.innerHTML = sanitize(edited.join('\n'));
    }

  } else {
    setEditStatus(`⏳ Working… (${wordCount.toLocaleString()} words)`);
    const r = await callAI(
      `Edit this fintech article about "${topic}" (${category}).
Word count: ${wordCount} words.
ARTICLE: ${currentText}
TASK: ${instruction}
${relevanceRule}
Write ONLY in English. Return ONLY clean HTML. Use <h2><h3><p><strong><em><ul><li><blockquote>. Never use <h1>. Never reduce word count.`,
      true, model, 8000
    );
    if (r.error) { setEditStatus('✕ ' + r.error, true); setEditBtnsDisabled(false); return; }
    const clean = (r.text || '').replace(/```html?|```/gi, '').trim();
    if (!clean) { setEditStatus('✕ Empty response.', true); setEditBtnsDisabled(false); return; }

    // FEATURE 11: Content length protection — reject if AI reduced content too much
    const newWordCount = clean.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    if (newWordCount < wordCount * 0.6 && wordCount > 50) {
      setEditStatus(`⚠ Rejected: AI reduced content from ${wordCount} to ${newWordCount} words (${Math.round((1 - newWordCount/wordCount) * 100)}% loss). Original preserved.`, true);
      setEditBtnsDisabled(false);
      showToast('AI response rejected — would reduce content too much.', 'error');
      return;
    }

    editor.innerHTML = sanitize(clean);
  }

  if (editor) editor.innerHTML = sanitize(_expandAcronymsInHtml(editor.innerHTML));
  updateWordCount();
  const newCount = (editor?.textContent || '').trim().split(/\s+/).filter(Boolean).length;
  setEditStatus(`✓ Done — ${newCount.toLocaleString()} words`);
  setEditBtnsDisabled(false);
  showToast('Article updated!', 'success');
}

const EDIT_INSTRUCTIONS = {
  regenerate:     'Regenerate this article completely from scratch with the same topic, but different phrasing and structure. Write ONLY in English.',
  professional:   'Rewrite in a highly professional, analytical tone suitable for senior finance executives. Write ONLY in English.',
  conversational: 'Rewrite in a conversational, accessible tone easy for non-experts. Write ONLY in English.',
  authoritative:  'Rewrite in an authoritative expert tone with precise terminology. Write ONLY in English.',
  expand:         'Expand significantly — add more depth, examples, data points, and additional sections. Write ONLY in English.',
  shorten:        'Shorten by 30-40% while keeping all key points. Write ONLY in English.',
  graph:          'Add a styled HTML data table in a relevant section using inline CSS (dark background #0f1628, gold #c9a84c borders, cream #f5f0e8 text) showing key statistics. Write ONLY in English.',
};

// Destructive actions that replace the entire article need confirmation
const DESTRUCTIVE_ACTIONS = ['regenerate', 'expand', 'shorten', 'professional', 'conversational', 'authoritative'];

window.aiEditAction = async (action) => {
  if (action === 'references') { await insertReferencesBlock(); return; }
  if (!EDIT_INSTRUCTIONS[action]) return;
  if (DESTRUCTIVE_ACTIONS.includes(action)) {
    if (!confirm(`This will rewrite the entire article (${action}). Your current content will be backed up. Continue?`)) return;
  }
  await runAIEdit(EDIT_INSTRUCTIONS[action]);
};

window.aiEditCustom = async () => {
  const instruction = document.getElementById('aiEditCustom')?.value.trim();
  if (!instruction) { setEditStatus('Please enter an instruction.', true); return; }
  if (!confirm('This will apply AI edits to your article. Continue?')) return;
  await runAIEdit(instruction);
  document.getElementById('aiEditCustom').value = '';
};

// Revert to last saved content before AI edit
window.revertAIEdit = () => {
  if (!state.lastSavedContent) {
    showToast('No backup content available.', 'error');
    return;
  }
  const editor = getEditor();
  if (editor) {
    editor.innerHTML = state.lastSavedContent;
    updateWordCount();
    showToast('Reverted to pre-edit content.', 'success');
    setEditStatus('↩ Reverted to backup');
  }
};


// ── APA References Block ──────────────────────
// Extracts real claims from the article and renders a
// properly formatted APA reference list at the bottom.
async function insertReferencesBlock() {
  const editor  = getEditor();
  const content = editor?.textContent;
  const title   = document.getElementById('postTitle')?.value.trim() || '';
  const topic   = document.getElementById('v2TopicPrompt')?.value.trim()
               || document.getElementById('aiPrompt')?.value.trim() || '';
  const category = document.getElementById('postCategory')?.value || 'Fintech';
  if (!content?.trim()) { showToast('Write an article first.', 'error'); return; }

  setEditBtnsDisabled(true);
  setEditStatus(`
    <div style="font-size:0.72rem;color:var(--muted);margin-bottom:4px">⏳ Extracting claims and finding sources…</div>
    <div style="background:rgba(255,255,255,0.06);border-radius:3px;height:6px;overflow:hidden">
      <div style="background:linear-gradient(90deg,#c9a84c,#e2c97e);height:100%;width:50%;animation:pulse 1s infinite;border-radius:3px"></div>
    </div>`);
  try {
    const result = await callAI(
    `You are a research librarian. Read this article and generate 6-8 real, verifiable APA-format references.
Article title: "${title}"
Article content (first 2000 chars): "${content.substring(0, 2000)}"

Rules:
- Use ONLY real, existing sources from these domains: rbi.org.in, sebi.gov.in, npci.org.in, worldbank.org, imf.org, bis.org, mckinsey.com, pwc.com, kpmg.com, deloitte.com, forbes.com, reuters.com, ft.com, economist.com
- Write ONLY in English
- Return ONLY valid JSON — no markdown, no explanation:
{
  "references": [
    {
      "authors": "Last, F. M., & Last, F. M.",
      "year": "2024",
      "title": "Full article or report title",
      "source": "Journal or Website Name",
      "url": "https://real-url.com/path"
    }
  ]
}`,
      true
    );

    if (result.error) {
      setEditStatus('⚠ AI source lookup unavailable — applying baseline references');
    }

    let refs = [];
    const seed = _deriveKeywordSeed(title, topic, category);
    try {
      const s = result.text.indexOf('{');
      const e = result.text.lastIndexOf('}');
      const parsed = JSON.parse(result.text.substring(s, e + 1));
      refs = parsed.references || [];
    } catch(_) {
      refs = [];
    }

    if (!refs.length) {
      const year = String(new Date().getFullYear());
      refs = [
        { authors: 'Reserve Bank of India', year, title: `Regulatory and payment system notes on ${seed[0] || 'digital finance'}`, source: 'RBI Publications', url: 'https://www.rbi.org.in/' },
        { authors: 'National Payments Corporation of India', year, title: 'UPI and digital payments ecosystem updates', source: 'NPCI', url: 'https://www.npci.org.in/' },
        { authors: 'World Bank', year, title: 'Financial inclusion and digital economy indicators', source: 'World Bank', url: 'https://www.worldbank.org/' },
        { authors: 'Securities and Exchange Board of India', year, title: `Market and compliance updates relevant to ${seed[1] || 'fintech'}`, source: 'SEBI', url: 'https://www.sebi.gov.in/' },
      ];
    }

    // Remove existing references block if present
    const existing = editor.querySelector('.bp-references-block');
    if (existing) existing.remove();

    // ── F5: Validate reference URLs via Worker (/api/validate-url) ──────────
    // Runs silently — invalid URLs get a warning badge, valid ones get a green tick
    setEditStatus('⏳ Validating reference URLs…');
    try {
      const urls = refs.filter(r => r.url).map(r => r.url);
      if (urls.length > 0) {
        const valRes = await workerFetch('api/validate-url', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ urls })
        });
        if (valRes.ok) {
          const valData = await valRes.json();
          const statusMap = {};
          (valData.results || []).forEach(r => { statusMap[r.url] = r.valid; });
          refs = refs.map(r => ({
            ...r,
            urlValid: r.url ? (statusMap[r.url] !== undefined ? statusMap[r.url] : null) : null
          }));
        }
      }
    } catch(_) {
      // Validation failed silently — still show references without badges
    }

    // Build APA reference list HTML
    const listItems = refs.map((r, i) => {
      const authors = r.authors || 'Unknown';
      const year    = r.year ? `(${r.year}).` : '';
      const title   = r.title ? `<em>${r.title}.</em>` : '';
      const source  = r.source ? `${r.source}.` : '';
      const validBadge = r.urlValid === true
        ? `<span style="color:#4ade80;font-size:0.7rem;margin-left:4px" title="URL verified">✓ verified</span>`
        : r.urlValid === false
          ? `<span style="color:#fca5a5;font-size:0.7rem;margin-left:4px" title="URL could not be verified">⚠ unverified</span>`
          : '';
      const urlTag  = r.url
        ? `<a href="${r.url}" target="_blank" rel="noopener"
             style="color:#c9a84c;word-break:break-all;font-size:0.8rem">${r.url}</a>${validBadge}`
        : '';
      return `<li style="margin-bottom:0.75rem;line-height:1.6;font-size:0.85rem;color:#f5f0e8">
        ${authors} ${year} ${title} ${source} ${urlTag}
      </li>`;
    }).join('');

    const block = `
<div class="bp-references-block" style="
  margin-top:2.5rem;
  padding:1.5rem;
  background:#0c1322;
  border:1px solid rgba(255,255,255,0.08);
  border-left:3px solid #c9a84c;
  border-radius:6px;
  font-family:var(--sans,sans-serif)
">
  <h2 style="font-size:1.1rem;font-weight:700;color:#c9a84c;margin:0 0 1rem 0;letter-spacing:0.03em">References</h2>
  <ol style="padding-left:1.4rem;margin:0">${listItems}</ol>
</div>`;

    editor.innerHTML = sanitize(editor.innerHTML + block);
    updateWordCount();
    setEditStatus(`✓ ${refs.length} APA references added`);
    showToast(`${refs.length} references added in APA format!`, 'success');
  } catch (e) {
    setEditStatus('✕ References failed: ' + (e.message || 'unknown error'), true);
  } finally {
    setEditBtnsDisabled(false);
  }
}
window.insertReferencesBlock = insertReferencesBlock;


// ── In-line Citation Insertion ────────────────
// Scans the article for factual claims and adds superscript citation markers
window.insertInlineCitations = async () => {
  const editor  = getEditor();
  const content = editor?.innerHTML;
  if (!content?.trim()) { showToast('Write an article first.', 'error'); return; }

  setEditBtnsDisabled(true);
  setEditStatus(`
    <div style="font-size:0.72rem;color:var(--muted);margin-bottom:4px">⏳ Adding inline citation markers…</div>
    <div style="background:rgba(255,255,255,0.06);border-radius:3px;height:6px;overflow:hidden">
      <div style="background:linear-gradient(90deg,#93c5fd,#60a5fa);height:100%;width:55%;animation:pulse 1s infinite;border-radius:3px"></div>
    </div>`);

  try {
    const result = await callAI(
    `Add numbered inline citation markers to factual claims in this HTML article.
For each verifiable statistic or fact, add a superscript like: <sup style="color:#c9a84c;font-size:0.7em">[1]</sup>
Keep existing HTML intact. Write ONLY in English.
Return ONLY the modified HTML with citation markers added.
ARTICLE HTML: ${content.substring(0, 4000)}`,
      true
    );

    if (result.error) {
      let idx = 1;
      const fallback = content.replace(/<p>([\s\S]*?)<\/p>/gi, (m, txt) => {
        if (idx > 8) return m;
        if (!/\d|%|percent|regulation|compliance|growth|market|transaction|risk|policy/i.test(txt)) return m;
        const tagged = `<p>${txt} <sup style="color:#c9a84c;font-size:0.7em">[${idx}]</sup></p>`;
        idx++;
        return tagged;
      });
      editor.innerHTML = sanitize(fallback);
      updateWordCount();
      setEditStatus('⚠ AI citation mode unavailable — basic citation markers added');
      return;
    }

    const clean = result.text.replace(/```html?|```/gi, '').trim();
    if (clean && clean.includes('<')) {
      editor.innerHTML = sanitize(clean);
      updateWordCount();
      setEditStatus('✓ Inline citations added');
      showToast('Inline citations added!', 'success');
    } else {
      setEditStatus('✕ No HTML returned', true);
    }
  } catch (e) {
    setEditStatus('✕ Citation insertion failed: ' + (e.message || 'unknown error'), true);
  } finally {
    setEditBtnsDisabled(false);
  }
};

// Full citation pipeline used by UI + auto flows
window.autoAddCitations = async () => {
  await window.insertInlineCitations();
  await insertReferencesBlock();
};


// ── Quality Score with Auto-Implement ─────────
export async function runArticleQualityScore() {
  const content = getEditor()?.textContent;
  const title   = document.getElementById('postTitle')?.value.trim() || '';
  if (!content?.trim()) { showToast('Write an article first.', 'error'); return; }
  setEditBtnsDisabled(true);
  setEditStatus(`
    <div style="font-size:0.72rem;color:var(--muted);margin-bottom:4px">⏳ Scoring article quality…</div>
    <div style="background:rgba(255,255,255,0.06);border-radius:3px;height:6px;overflow:hidden">
      <div style="background:linear-gradient(90deg,#4ade80,#22c55e);height:100%;width:70%;animation:pulse 1s infinite;border-radius:3px"></div>
    </div>`);

  const result = await callAI(
    `Score this fintech article for quality (0-100).
Title: "${title}"
Content preview: "${content.substring(0, 1500)}"
Write ONLY in English.
Return ONLY JSON:
{"score":0-100,"grade":"A/B/C/D","strengths":["s1","s2","s3"],"improvements":["i1","i2","i3"],"auto_fixes":["add_statistics","improve_headings","expand_intro","add_examples","fix_tone"]}
auto_fixes must be a subset of the exact strings listed above — only include fixes that apply.`,
    true
  );

  if (result.error) { setEditStatus('✕ ' + result.error, true); setEditBtnsDisabled(false); return; }

  let p;
  try {
    const s = result.text.indexOf('{');
    const e = result.text.lastIndexOf('}');
    p = JSON.parse(result.text.substring(s, e + 1));
  } catch(_) { setEditStatus('✕ Parse error', true); setEditBtnsDisabled(false); return; }

  const color     = p.score >= 80 ? 'var(--green)' : p.score >= 60 ? 'var(--gold)' : '#fca5a5';
  const autoFixes = p.auto_fixes || [];

  const fixBtns = autoFixes.length ? `
    <div style="margin-top:0.6rem;border-top:1px solid var(--border);padding-top:0.6rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem">
        <div style="font-size:0.68rem;color:var(--muted)">AUTO-FIX SUGGESTIONS</div>
        <button onclick="autoRunAllFixes(${JSON.stringify(autoFixes).replace(/"/g,'&quot;')})"
          style="background:linear-gradient(135deg,var(--gold),var(--gold2));color:var(--navy);border:none;padding:0.25rem 0.6rem;border-radius:3px;font-family:var(--sans);font-size:0.65rem;font-weight:700;cursor:pointer">
          ⚡ Run All Fixes
        </button>
      </div>
      ${autoFixes.map(fix => `
        <button onclick="applyQualityFix('${fix}')"
          style="display:block;width:100%;text-align:left;background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.2);
                 color:var(--gold);padding:0.3rem 0.6rem;border-radius:3px;font-family:var(--sans);font-size:0.7rem;
                 cursor:pointer;margin-bottom:0.25rem">
          ✦ ${_fixLabel(fix)}
        </button>`).join('')}
    </div>` : '';

  const resultHTML = `
    <div style="background:var(--navy2);border:1px solid var(--border);border-radius:4px;padding:0.8rem;margin-top:0.5rem">
      <div style="display:flex;align-items:center;gap:0.8rem;margin-bottom:0.6rem">
        <div style="font-size:2rem;font-weight:700;color:${color};line-height:1">${p.score}</div>
        <div>
          <div style="font-size:0.8rem;font-weight:700;color:${color}">Grade ${p.grade}</div>
          <div style="font-size:0.7rem;color:var(--muted)">Quality Score</div>
        </div>
      </div>
      ${(p.strengths || []).map(s => `<div style="font-size:0.72rem;color:var(--green);margin-bottom:0.2rem">✓ ${s}</div>`).join('')}
      ${(p.improvements || []).map(i => `<div style="font-size:0.72rem;color:#fca5a5;margin-bottom:0.2rem">⚠ ${i}</div>`).join('')}
      ${fixBtns}
    </div>`;

  const el = document.getElementById('qualityScoreResult');
  if (el) { el.style.display = 'block'; el.innerHTML = resultHTML; }
  const statusEl = document.getElementById('aiEditStatus');
  if (statusEl) statusEl.innerHTML = `<span style="color:${color};font-weight:700">Score: ${p.score}/100 (${p.grade})</span>${resultHTML}`;
  setEditBtnsDisabled(false);
  showToast(`Quality Score: ${p.score}/100 — Grade ${p.grade}`, p.score >= 70 ? 'success' : 'error');
}
window.runArticleQualityScore = runArticleQualityScore;

// FEATURE 10: Auto-run all quality fixes sequentially after scoring
window.autoRunAllFixes = async (fixes) => {
  if (!fixes?.length) return;
  setEditStatus(`⏳ Auto-applying ${fixes.length} fix(es)…`);
  for (let i = 0; i < fixes.length; i++) {
    const fix = fixes[i];
    const instruction = FIX_INSTRUCTIONS[fix];
    if (!instruction) continue;
    setEditStatus(`⏳ Fix ${i+1}/${fixes.length}: ${_fixLabel(fix)}…`);
    await runAIEdit(instruction);
    // Small delay between fixes
    if (i < fixes.length - 1) await new Promise(r => setTimeout(r, 500));
  }
  setEditStatus(`✓ Applied ${fixes.length} fix(es)`);
  showToast(`Applied ${fixes.length} auto-fixes!`, 'success');
};

// Maps fix key → human label
function _fixLabel(fix) {
  const labels = {
    add_statistics:   'Add statistics & data points',
    improve_headings: 'Improve section headings',
    expand_intro:     'Expand introduction',
    add_examples:     'Add real-world examples',
    fix_tone:         'Fix writing tone & clarity',
  };
  return labels[fix] || fix;
}

// FEATURE 11: FIX_INSTRUCTIONS now include content preservation rules
const FIX_INSTRUCTIONS = {
  add_statistics:   'Add specific statistics, percentages, and real data points throughout the article to support claims. CRITICAL: Do NOT remove or shorten any existing content. Only ADD new data points. Write ONLY in English.',
  improve_headings: 'Rewrite all <h2> and <h3> headings to be more descriptive, SEO-friendly, and engaging. CRITICAL: Keep ALL paragraph content intact. Only change the heading text. Write ONLY in English.',
  expand_intro:     'Significantly expand the introduction — make it more compelling with a stronger hook, context, and preview of key insights. CRITICAL: Keep all other sections untouched. Only expand the introduction. Write ONLY in English.',
  add_examples:     'Add 2-3 real-world examples or case studies to support the key arguments in the article. CRITICAL: Do NOT remove or shorten any existing content. Only ADD examples. Write ONLY in English.',
  fix_tone:         'Improve writing tone and clarity — remove passive voice, jargon, and filler sentences. CRITICAL: Do NOT reduce the word count significantly. Replace weak sentences with stronger ones of equal or greater length. Write ONLY in English.',
};

window.applyQualityFix = async (fix) => {
  const instruction = FIX_INSTRUCTIONS[fix];
  if (!instruction) return;
  setEditStatus(`⏳ Applying: ${_fixLabel(fix)}…`);
  await runAIEdit(instruction);
};

// ── SEO Optimizer ─────────────────────────────
export async function runSEOOptimizer() {
  const content  = getEditor()?.textContent;
  const title    = document.getElementById('postTitle')?.value.trim() || '';
  const topic    = document.getElementById('v2TopicPrompt')?.value.trim()
                || document.getElementById('aiPrompt')?.value.trim() || title || 'Fintech';
  const category = document.getElementById('postCategory')?.value || 'Fintech';
  if (!content?.trim()) { showToast('Write an article first.','error'); return; }
  setEditBtnsDisabled(true);
  setEditStatus(`
    <div style="font-size:0.72rem;color:var(--muted);margin-bottom:4px">⏳ Analysing SEO…</div>
    <div style="background:rgba(255,255,255,0.06);border-radius:3px;height:6px;overflow:hidden">
      <div style="background:linear-gradient(90deg,#3b82f6,#60a5fa);height:100%;width:60%;animation:pulse 1s infinite;border-radius:3px"></div>
    </div>`);
  const result = await callAI(
    `Optimize this fintech article for SEO. Write ONLY in English.
Title: "${title}"
Content: "${content.substring(0,1500)}"
Return ONLY JSON (no markdown):
{"optimizedTitle":"under 60 chars","metaDescription":"under 155 chars","tags":["t1","t2","t3","t4","t5"],"focusKeyword":"main keyword"}`,
    true
  );
  if (result.error) {
    const seeds = _deriveKeywordSeed(title, topic, category);
    const fallbackTitle = (title && title.length >= 20) ? title : `${topic} Guide: Trends, Risks, and Strategy`;
    const fallbackMeta = `Practical analysis of ${topic} with key risks, opportunities, and strategy takeaways.`;
    document.getElementById('postTitle').value = fallbackTitle.slice(0, 70);
    document.getElementById('postMeta').value  = fallbackMeta.slice(0, 155);
    document.getElementById('postTags').value  = seeds.slice(0, 5).join(', ');
    setEditStatus('⚠ AI SEO unavailable — applied fallback SEO fields');
    setEditBtnsDisabled(false);
    return;
  }
  try {
    const s=result.text.indexOf('{'), e=result.text.lastIndexOf('}');
    const parsed = JSON.parse(result.text.substring(s,e+1));
    if (parsed.optimizedTitle)   document.getElementById('postTitle').value = parsed.optimizedTitle;
    if (parsed.metaDescription)  document.getElementById('postMeta').value  = parsed.metaDescription;
    if (parsed.tags?.length)     document.getElementById('postTags').value  = parsed.tags.join(', ');
    setEditStatus('✓ SEO optimized');
    showToast('SEO fields updated!','success');
  } catch(_) {
    const seeds = _deriveKeywordSeed(title, topic, category);
    document.getElementById('postMeta').value  = `Practical analysis of ${topic} with key risks, opportunities, and strategy takeaways.`.slice(0, 155);
    document.getElementById('postTags').value  = seeds.slice(0, 5).join(', ');
    setEditStatus('⚠ Parse issue — fallback SEO fields applied');
  }
  setEditBtnsDisabled(false);
}
window.runSEOOptimizer = runSEOOptimizer;

// ── Internal Linking ──────────────────────────
export async function runInternalLinking() {
  const content = getEditor()?.innerHTML;
  if (!content?.trim()) { showToast('Write an article first.','error'); return; }
  setEditBtnsDisabled(true);
  setEditStatus(`
    <div style="font-size:0.72rem;color:var(--muted);margin-bottom:4px">⏳ Scanning for link opportunities…</div>
    <div style="background:rgba(255,255,255,0.06);border-radius:3px;height:6px;overflow:hidden">
      <div style="background:linear-gradient(90deg,var(--gold),var(--gold2));height:100%;width:45%;animation:pulse 1s infinite;border-radius:3px"></div>
    </div>`);
  const linked = await buildInternalLinks(content);
  const editor = getEditor();
  editor.innerHTML = sanitize(linked);
  updateWordCount();
  setEditStatus('✓ Internal links added');
  setEditBtnsDisabled(false);
  showToast('Internal links added!','success');
}
window.runInternalLinking = runInternalLinking;

export async function buildInternalLinks(content) {
  const { state: s } = await import('./state.js');
  if (!s.allPosts?.length) return content;
  let linked = content;
  const currentTitle = document.getElementById('postTitle')?.value.toLowerCase() || '';
  for (const post of s.allPosts.slice(0,10)) {
    if (!post.title || !post.slug) continue;
    if (post.title.toLowerCase() === currentTitle) continue;
    // Skip if this post is already linked somewhere in the content
    if (linked.includes(`id=${post.id}`) || linked.includes(post.slug)) continue;
    const words = post.title.split(' ').slice(0,3).join(' ');
    if (words.length < 5) continue;
    const escaped = words.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    // FIX: Use a function replacer that checks if the match is inside an <a> tag
    // by scanning backwards from the match position for unclosed <a> tags
    const re = new RegExp(`(?<!<[^>]*)(${escaped})(?![^<]*>)`, 'i');
    const match = re.exec(linked);
    if (match) {
      const before = linked.substring(0, match.index);
      // Count open vs close <a> tags before this position
      const openAs  = (before.match(/<a[\s>]/gi) || []).length;
      const closeAs = (before.match(/<\/a>/gi) || []).length;
      // If we're inside an unclosed <a> tag, skip this match
      if (openAs > closeAs) continue;
      linked = linked.substring(0, match.index)
        + `<a href="/post.html?id=${post.id}" style="color:var(--gold);text-decoration:underline">${match[1]}</a>`
        + linked.substring(match.index + match[0].length);
    }
  }
  return linked;
}

// ── Auto-place images ─────────────────────────
export async function autoPlaceImages() {
  showToast('Auto-place: open Image tab and generate images first.','success');
}
window.autoPlaceImages = autoPlaceImages;
window.cancelAutoPlace = () => { state.autoPlaceCancelled = true; };

// ── Summary generator ─────────────────────────
window.generateSummary = async () => {
  const title   = document.getElementById('postTitle').value.trim();
  const content = getEditor()?.textContent.substring(0,1000);
  if (!title && !content) { showToast('Add a title or write content first.','error'); return; }
  const statusEl = document.getElementById('summaryStatus');
  if (statusEl) statusEl.textContent = '⏳ Generating summary…';
  const result = await callAI(`Write a 2-sentence compelling excerpt for this fintech article.\nTitle: "${title}"\nContent: "${content}"\nReturn ONLY the 2 sentences, no quotes.`, true);
  if (result.error) {
    if (statusEl) {
      statusEl.textContent = '✕ ' + result.error;
      setTimeout(() => { statusEl.textContent = ''; }, 6000);
    }
    showToast(result.error, 'error');
    return;
  }
  document.getElementById('postExcerpt').value = result.text.trim();
  if (statusEl) statusEl.textContent = '✓ Summary generated';
  setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
};

window.expandShortforms = () => {
  const editor = getEditor();
  if (!editor) return;
  editor.innerHTML = sanitize(_expandAcronymsInHtml(editor.innerHTML));
  updateWordCount();
  setEditStatus('✓ Common shortforms expanded on first use');
  showToast('Shortforms expanded.', 'success');
};
