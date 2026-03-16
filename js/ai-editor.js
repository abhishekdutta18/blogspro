// ═══════════════════════════════════════════════
// ai-editor.js — Post editing AI tools
// ═══════════════════════════════════════════════
import { sanitize, showToast } from './config.js';
import { callAI }  from './ai-core.js';
import { state }   from './state.js';
import { updateWordCount } from './editor.js';

function getEditor() { return document.getElementById('editor'); }
function setEditStatus(msg, isError=false) {
  const el = document.getElementById('aiEditStatus');
  if (el) { el.textContent = msg; el.style.color = isError ? '#fca5a5' : 'var(--muted)'; }
}
function setEditBtnsDisabled(on) {
  document.querySelectorAll('.ai-edit-btn').forEach(b => b.disabled = on);
}

async function runAIEdit(instruction) {
  const editor      = getEditor();
  const currentHTML = editor?.innerHTML || '';
  const currentText = editor?.textContent || '';
  const topic    = document.getElementById('aiPrompt').value.trim() || 'fintech article';
  const category = document.getElementById('postCategory').value;
  const model    = document.getElementById('modelArticle')?.value || 'auto';
  if (!currentText?.trim()) { setEditStatus('No article content.', true); return; }

  setEditBtnsDisabled(true);
  const wordCount = currentText.trim().split(/\s+/).filter(Boolean).length;

  // For long articles: edit section-by-section to preserve word count
  // Split on <h2> boundaries so each call handles one section at a time
  const isLong = wordCount > 1000;

  if (isLong) {
    setEditStatus(`⏳ Editing ${wordCount.toLocaleString()} words section by section…`);
    // Split HTML into sections by <h2>
    const sections = currentHTML.split(/(?=<h2[^>]*>)/i).filter(Boolean);
    if (sections.length <= 1) {
      // No h2 splits — chunk by character
      const chunks = [];
      const chunkSize = 3000;
      for (let i = 0; i < currentText.length; i += chunkSize) {
        chunks.push(currentText.substring(i, i + chunkSize));
      }
      const results = [];
      for (let i = 0; i < chunks.length; i++) {
        setEditStatus(`⏳ Editing chunk ${i+1}/${chunks.length}…`);
        const r = await callAI(
          `Edit this section of a fintech article about "${topic}" (${category}).
SECTION: ${chunks[i]}
TASK: ${instruction}
RULES: Return ONLY clean HTML. NEVER shorten — output must be same length or longer.`,
          true, model, 8000
        );
        results.push(r.error ? chunks[i] : (r.text||'').replace(/\`\`\`html?|\`\`\`/gi,'').trim());
      }
      editor.innerHTML = sanitize(results.join('\n'));
    } else {
      const edited = new Array(sections.length).fill(null);
      for (let i = 0; i < sections.length; i++) {
        setEditStatus(`⏳ Editing section ${i+1}/${sections.length}…`);
        const sText = sections[i].replace(/<[^>]+>/g,' ').trim();
        const r = await callAI(
          `Edit this section of a fintech article about "${topic}" (${category}).
Section ${i+1} of ${sections.length}.
SECTION HTML: ${sections[i]}
TASK: ${instruction}
RULES: Return ONLY clean HTML for this section. Same or more words, never fewer.`,
          true, model, 8000
        );
        edited[i] = r.error
          ? sections[i]
          : (r.text||'').replace(/\`\`\`html?|\`\`\`/gi,'').replace(/<h1[^>]*>.*?<\/h1>/gi,'').trim();
      }
      editor.innerHTML = sanitize(edited.join('\n'));
    }
  } else {
    // Short articles: single call
    setEditStatus(`⏳ Working… (${wordCount.toLocaleString()} words)`);
    const r = await callAI(
      `Edit this fintech article about "${topic}" (${category}).
Word count: ${wordCount} words.
ARTICLE: ${currentText}
TASK: ${instruction}
RULES: Return ONLY clean HTML. Use <h2><h3><p><strong><em><ul><li><blockquote>. NEVER use <h1>. Never reduce word count.`,
      true, model, 8000
    );
    if (r.error) { setEditStatus('✕ '+r.error, true); setEditBtnsDisabled(false); return; }
    const clean = (r.text||'').replace(/\`\`\`html?|\`\`\`/gi,'').trim();
    if (!clean) { setEditStatus('✕ Empty response.', true); setEditBtnsDisabled(false); return; }
    editor.innerHTML = sanitize(clean);
  }

  updateWordCount();
  const newCount = editor.textContent.trim().split(/\s+/).filter(Boolean).length;
  setEditStatus(`✓ Done — ${newCount.toLocaleString()} words`);
  setEditBtnsDisabled(false);
  showToast('Article updated!','success');
}

const EDIT_INSTRUCTIONS = {
  regenerate:     'Regenerate this article completely from scratch with the same topic, but different phrasing and structure.',
  professional:   'Rewrite in a highly professional, analytical tone suitable for senior finance executives.',
  conversational: 'Rewrite in a conversational, accessible tone easy for non-experts, but still informative.',
  authoritative:  'Rewrite in an authoritative expert tone — use precise terminology and project deep domain expertise.',
  expand:         'Expand significantly. Add more depth, examples, data points, and additional sections.',
  shorten:        'Shorten by 30-40% while keeping all key points. Remove redundancy.',
  references:     'Add a References section at the end with 5-8 REAL sources in APA format using REAL working URLs. Do NOT use example.com or placeholder URLs. Use actual URLs from: rbi.org.in, sebi.gov.in, npci.org.in, worldbank.org, imf.org, bis.org, mckinsey.com, pwc.com, kpmg.com, deloitte.com, forbes.com. Make each URL a clickable gold link: <a href="REAL_URL" target="_blank" rel="noopener" style="color:#c9a84c">REAL_URL</a>. Use an <ol> numbered list.',
  graph:          'Add a styled HTML data visualization table in a relevant section using inline CSS (dark background #0f1628, gold #c9a84c borders, cream #f5f0e8 text) showing key statistics.',
};

window.aiEditAction = async (action) => {
  if (!EDIT_INSTRUCTIONS[action]) return;
  if (action === 'regenerate' && !confirm('Regenerate the entire article?')) return;
  await runAIEdit(EDIT_INSTRUCTIONS[action]);
};

window.aiEditCustom = async () => {
  const instruction = document.getElementById('aiEditCustom')?.value.trim();
  if (!instruction) { setEditStatus('Please enter an instruction.', true); return; }
  await runAIEdit(instruction);
  document.getElementById('aiEditCustom').value = '';
};

// ── SEO Optimizer ─────────────────────────────
export async function runSEOOptimizer() {
  const content  = getEditor()?.textContent;
  const title    = document.getElementById('postTitle').value.trim();
  if (!content?.trim()) { showToast('Write an article first.','error'); return; }
  setEditBtnsDisabled(true); setEditStatus('⏳ SEO analysis…');
  const result = await callAI(
    `Optimize this fintech article for SEO.\nTitle: "${title}"\nContent: "${content.substring(0,1500)}"\nReturn ONLY JSON:\n{"optimizedTitle":"under 60 chars","metaDescription":"under 155 chars","tags":["t1","t2","t3","t4","t5"],"focusKeyword":"main keyword"}`,
    true
  );
  if (result.error) { setEditStatus('✕ '+result.error, true); setEditBtnsDisabled(false); return; }
  try {
    const s=result.text.indexOf('{'), e=result.text.lastIndexOf('}');
    const parsed = JSON.parse(result.text.substring(s,e+1));
    if (parsed.optimizedTitle)   document.getElementById('postTitle').value = parsed.optimizedTitle;
    if (parsed.metaDescription)  document.getElementById('postMeta').value  = parsed.metaDescription;
    if (parsed.tags?.length)     document.getElementById('postTags').value  = parsed.tags.join(', ');
    setEditStatus('✓ SEO optimized');
    showToast('SEO fields updated!','success');
  } catch(_) { setEditStatus('✕ Parse error', true); }
  setEditBtnsDisabled(false);
}
window.runSEOOptimizer = runSEOOptimizer;

// ── Internal Linking ──────────────────────────
export async function runInternalLinking() {
  const content = getEditor()?.innerHTML;
  if (!content?.trim()) { showToast('Write an article first.','error'); return; }
  setEditBtnsDisabled(true); setEditStatus('⏳ Adding internal links…');
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
    const words = post.title.split(' ').slice(0,3).join(' ');
    if (words.length < 5) continue;
    const escaped = words.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re = new RegExp(`(?<!<[^>]*)(${escaped})(?![^<]*>)`, 'i');
    if (re.test(linked)) {
      linked = linked.replace(re, `<a href="/post.html?id=${post.id}" style="color:var(--gold);text-decoration:underline">$1</a>`);
    }
  }
  return linked;
}

// ── Quality Score ─────────────────────────────
export async function runArticleQualityScore() {
  const content = getEditor()?.textContent;
  const title   = document.getElementById('postTitle').value.trim();
  if (!content?.trim()) { showToast('Write an article first.','error'); return; }
  setEditBtnsDisabled(true); setEditStatus('⏳ Scoring…');
  const result = await callAI(
    `Score this fintech article for quality (0-100).\nTitle: "${title}"\nContent preview: "${content.substring(0,1200)}"\nReturn ONLY JSON:\n{"score":0-100,"grade":"A/B/C/D","strengths":["s1","s2"],"improvements":["i1","i2"]}`,
    true
  );
  setEditBtnsDisabled(false);
  if (result.error) { setEditStatus('✕ '+result.error, true); return; }
  try {
    const s=result.text.indexOf('{'), e=result.text.lastIndexOf('}');
    const p = JSON.parse(result.text.substring(s,e+1));
    const color = p.score>=80?'var(--green)':p.score>=60?'var(--gold)':'#fca5a5';
    // Write result into BOTH the drawer element AND the v2 edit status area
    const resultHTML = `
      <div style="background:var(--navy2);border:1px solid var(--border);border-radius:4px;padding:0.8rem;margin-top:0.5rem">
        <div style="display:flex;align-items:center;gap:0.8rem;margin-bottom:0.6rem">
          <div style="font-size:2rem;font-weight:700;color:${color};line-height:1">${p.score}</div>
          <div>
            <div style="font-size:0.8rem;font-weight:700;color:${color}">Grade ${p.grade}</div>
            <div style="font-size:0.7rem;color:var(--muted)">Quality Score</div>
          </div>
        </div>
        ${(p.strengths||[]).map(s=>`<div style="font-size:0.72rem;color:var(--green);margin-bottom:0.2rem">✓ ${s}</div>`).join('')}
        ${(p.improvements||[]).map(i=>`<div style="font-size:0.72rem;color:#fca5a5;margin-bottom:0.2rem">⚠ ${i}</div>`).join('')}
      </div>`;
    // Show in old drawer
    const el = document.getElementById('qualityScoreResult');
    if (el) { el.style.display = 'block'; el.innerHTML = resultHTML; }
    // Also show in v2 panel aiEditStatus area
    const statusEl = document.getElementById('aiEditStatus');
    if (statusEl) statusEl.innerHTML = `<span style="color:${color};font-weight:700">Score: ${p.score}/100 (${p.grade})</span>${resultHTML}`;
    showToast(`Quality Score: ${p.score}/100 — Grade ${p.grade}`, p.score >= 70 ? 'success' : 'error');
  } catch(_) { setEditStatus('✕ Parse error', true); }
}
window.runArticleQualityScore = runArticleQualityScore;

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
