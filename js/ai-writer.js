// ═══════════════════════════════════════════════
// ai-writer.js — Full article AI generation
// Fixes:
//   1. Opens #aiModal so timer/roadmap are visible
//   2. Section-by-section generation to hit large word targets (50k+)
//   3. Exposes window.generateAIPost used by v2-editor / handleGenerateClick
// ═══════════════════════════════════════════════
import { callAI }                    from './ai-core.js';
import { sanitize, showToast }       from './config.js';
import { state }                     from './state.js';
import { updateWordCount }           from './editor.js';
import {
  startTimer, stopTimer, hideTimer,
  timerLog, showRoadmap, setRoadmapStep, hideRoadmap
} from './timer.js';

let aiWriting  = false;
let _cancelled = false;

// ─────────────────────────────────────────────
// Modal helpers
// ─────────────────────────────────────────────
function openModal(title = '✦ Generating…', sub = 'AI is thinking. Please wait.') {
  const modal = document.getElementById('aiModal');
  if (modal) modal.classList.add('open');
  _setModalTitle(title, sub);
  const actions = document.getElementById('aiModalActions');
  if (actions) actions.style.display = 'none';
  const content = document.getElementById('aiModalContent');
  if (content) content.innerHTML = '<span style="animation:pulse 1s infinite;display:inline-block">Starting…</span>';
}

function closeModal() {
  const modal = document.getElementById('aiModal');
  if (modal) modal.classList.remove('open');
  hideTimer();
  hideRoadmap();
}

function _setModalTitle(title, sub) {
  const t = document.getElementById('aiModalTitle');
  const s = document.getElementById('aiModalSub');
  if (t) t.textContent = title;
  if (s) s.textContent = sub;
}

function _setModalContent(html) {
  const el = document.getElementById('aiModalContent');
  if (el) el.innerHTML = html;
}

// ─────────────────────────────────────────────
// Cancel support
// ─────────────────────────────────────────────
window.cancelOutline = () => {
  _cancelled = true;
  closeModal();
  showToast('Generation cancelled.', 'info');
};

// ─────────────────────────────────────────────
// How many sections needed to reach word target
// Each API call reliably produces ~600-800 words
// ─────────────────────────────────────────────
function sectionsNeeded(wordTarget) {
  const wordsPerCall = 700;
  return Math.max(3, Math.ceil(wordTarget / wordsPerCall));
}

// ─────────────────────────────────────────────
// Main entry — called by handleGenerateClick()
// ─────────────────────────────────────────────
window.generateAIPost = async function generateAIPost() {
  if (aiWriting) { showToast('Already generating — please wait.', 'info'); return; }

  const topic      = (document.getElementById('v2TopicPrompt')?.value.trim()
                   || document.getElementById('aiPrompt')?.value.trim());
  const category   = document.getElementById('postCategory')?.value || 'Fintech';
  const tone       = document.getElementById('aiTone')?.value || 'professional';
  const model      = document.getElementById('modelArticle')?.value || 'auto';
  const wordTarget = parseInt(document.getElementById('wordTarget')?.value) || 1200;

  if (!topic) {
    showToast('Enter a topic first.', 'error');
    document.getElementById('v2TopicPrompt')?.focus() || document.getElementById('aiPrompt')?.focus();
    return;
  }

  aiWriting          = true;
  _cancelled         = false;
  state.isGeneratingAI = true;
  _setBtnsDisabled(true);

  const editor = document.getElementById('editor');
  if (editor) editor.innerHTML = '';

  // Open the modal — this makes the timer bar and roadmap visible
  openModal('✦ Generating Article…', `Topic: "${topic.substring(0, 60)}" · Target: ${(wordTarget/1000).toFixed(0)}k words`);
  showRoadmap();

  try {
    // ── STEP 1: Outline ──────────────────────────
    setRoadmapStep('outline', 'active');
    startTimer('outline');
    timerLog('Building outline…');
    _setModalContent('📋 Building section outline…');

    const numSections = sectionsNeeded(wordTarget);

    const outlineResult = await callAI(
      `Create a detailed blog post outline for: "${topic}"
Category: ${category} | Tone: ${tone} | Target: ${wordTarget} words

Generate exactly ${numSections} section titles that will cover the topic thoroughly.
Return ONLY a valid JSON array of strings — nothing else.
Example: ["Section One", "Section Two", "Section Three"]`,
      true, model
    );

    if (_cancelled) return;

    let sections = [];
    if (!outlineResult.error) {
      try {
        const s = outlineResult.text.indexOf('[');
        const e = outlineResult.text.lastIndexOf(']');
        if (s !== -1 && e !== -1) sections = JSON.parse(outlineResult.text.substring(s, e + 1));
      } catch(_) {}
    }

    // Fallback: generate section names manually if parse failed
    if (!sections.length) {
      sections = Array.from({ length: numSections }, (_, i) =>
        i === 0 ? 'Introduction' : i === numSections - 1 ? 'Conclusion' : `Section ${i}`
      );
    }

    state.pendingOutline = sections.join('\n');
    setRoadmapStep('outline', 'done');
    stopTimer();

    // ── STEP 2: Write each section ───────────────
    setRoadmapStep('article', 'active');
    const wordsPerSection = Math.ceil(wordTarget / sections.length);
    // Scale estimate: 45s base + 20s per extra section
    const articleEstimateSecs = 45 + (sections.length - 3) * 20;
    startTimer('article');
    // Override estimate for long articles
    if (window._timerEstimate !== undefined) window._timerEstimate = articleEstimateSecs;

    timerLog(`Writing ${sections.length} sections (~${wordsPerSection} words each)…`);

    const sectionHTMLs = [];

    for (let i = 0; i < sections.length; i++) {
      if (_cancelled) break;

      const sectionTitle = sections[i];
      const progress = `${i + 1}/${sections.length}`;

      timerLog(`✍ Section ${progress}: "${sectionTitle.substring(0, 40)}"`);
      _setModalContent(
        `<div style="color:var(--muted);font-size:0.8rem;margin-bottom:0.5rem">Section ${progress} of ${sections.length}</div>` +
        `<div style="font-size:0.9rem;color:var(--cream);font-weight:600">"${sectionTitle.substring(0, 60)}"</div>` +
        `<div style="margin-top:0.8rem;color:var(--muted);font-size:0.75rem">${sectionHTMLs.length * wordsPerSection} / ${wordTarget} words written</div>`
      );

      const isFirst = i === 0;
      const isLast  = i === sections.length - 1;

      const sectionPrompt = isFirst
        ? `Write an engaging introduction section for a blog post about: "${topic}"
Category: ${category} | Tone: ${tone}
Section title: "${sectionTitle}"
Target: ${wordsPerSection} words
- Hook the reader immediately
- Explain what the article will cover
- Use <h2> for the section title, then <p> tags
- Return ONLY clean HTML`
        : isLast
        ? `Write a strong conclusion section for a blog post about: "${topic}"
Category: ${category} | Tone: ${tone}
Section title: "${sectionTitle}"
Target: ${wordsPerSection} words
- Summarise key takeaways
- End with a clear call to action
- Use <h2> for the section title, then <p> tags
- Return ONLY clean HTML`
        : `Write a detailed section for a blog post about: "${topic}"
Category: ${category} | Tone: ${tone}
Section title: "${sectionTitle}"
Target: ${wordsPerSection} words
- Cover this section in depth with examples, data points, and analysis
- Use <h2> for the section title, <h3> for sub-points
- Use <p>, <strong>, <em>, <ul>, <li>, <blockquote> where appropriate
- NEVER use <h1> or <script>
- Return ONLY clean HTML for this section`;

      const result = await callAI(sectionPrompt, true, model, 8000);

      if (_cancelled) break;

      if (result.error) {
        // Insert a placeholder for failed sections so the article isn't broken
        sectionHTMLs.push(
          `<div class="failed-section-block" data-section="${sectionTitle}" data-topic="${topic}" data-category="${category}" data-tone="${tone}" data-words="${wordsPerSection}" data-model="${model}">
            <div class="failed-section-inner" style="background:rgba(239,68,68,0.06);border:1px dashed rgba(239,68,68,0.3);border-radius:4px;padding:1rem;margin:1rem 0">
              <div class="failed-text" style="color:#fca5a5;font-size:0.82rem">⚠ Section failed: "${sectionTitle}" — <span>${result.error}</span></div>
              <button onclick="retrySectionGen(this)" style="margin-top:0.5rem;background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.3);color:var(--gold);padding:0.3rem 0.8rem;border-radius:3px;font-size:0.75rem;cursor:pointer">🔄 Retry Now</button>
            </div>
          </div>`
        );
      } else {
        const clean = sanitize(
          (result.text || '')
            .replace(/```html?|```/gi, '')
            .replace(/<h1[^>]*>.*?<\/h1>/gi, '')
            .trim()
        );
        sectionHTMLs.push(clean);
      }

      // Append section to editor live so user sees progress
      if (editor) {
        editor.innerHTML = sectionHTMLs.join('\n');
        updateWordCount();
      }

      // Small pause between calls to avoid rate limits on large articles
      if (i < sections.length - 1 && wordTarget >= 5000) {
        await _sleep(800);
      }
    }

    setRoadmapStep('article', 'done');
    stopTimer();

    if (_cancelled) {
      closeModal();
      showToast('Generation cancelled.', 'info');
      return;
    }

    // ── STEP 3: Metadata ─────────────────────────
    setRoadmapStep('metadata', 'active');
    startTimer('metadata');
    timerLog('Generating metadata…');
    _setModalContent('🏷 Generating title, excerpt, tags…');

    const metaResult = await callAI(
      `For this blog post about "${topic}", return ONLY valid JSON:
{"title":"SEO title under 60 chars","excerpt":"compelling 2-sentence summary","slug":"url-slug","metaDesc":"meta description under 155 chars","tags":["tag1","tag2","tag3","tag4","tag5"]}`,
      true, model
    );

    if (!metaResult.error) {
      try {
        const s = metaResult.text.indexOf('{');
        const e = metaResult.text.lastIndexOf('}');
        if (s !== -1 && e !== -1) {
          const meta = JSON.parse(metaResult.text.substring(s, e + 1));
          _setField('postTitle',   meta.title);
          _setField('postExcerpt', meta.excerpt);
          _setField('postSlug',    meta.slug);
          _setField('postMeta',    meta.metaDesc);
          if (meta.tags?.length) _setField('postTags', meta.tags.join(', '));
        }
      } catch(_) {}
    }

    setRoadmapStep('metadata', 'done');
    setRoadmapStep('done', 'done');
    stopTimer();

    // ── Done ─────────────────────────────────────
    const finalCount = (editor?.textContent || '').trim().split(/\s+/).filter(Boolean).length;
    _setModalTitle('✓ Article Ready!', `${finalCount.toLocaleString()} words generated across ${sections.length} sections.`);
    _setModalContent(
      `<div style="color:var(--green);font-size:1.1rem;font-weight:700;margin-bottom:0.5rem">✓ Done!</div>` +
      `<div style="color:var(--muted);font-size:0.82rem">${finalCount.toLocaleString()} words · ${sections.length} sections · Target was ${wordTarget.toLocaleString()} words</div>`
    );

    // Auto-close modal after 2s
    setTimeout(closeModal, 2000);
    showToast(`Article ready! ${finalCount.toLocaleString()} words.`, 'success');

  } catch(err) {
    console.error('[ai-writer] generateAIPost failed:', err);
    closeModal();
    showToast('Generation failed: ' + err.message, 'error');
  } finally {
    aiWriting          = false;
    state.isGeneratingAI = false;
    _setBtnsDisabled(false);
  }
};


// ─────────────────────────────────────────────
// initAIWriter — wires up simple #aiWriteBtn
// ─────────────────────────────────────────────
export function initAIWriter() {
  const btn         = document.getElementById('aiWriteBtn');
  const promptInput = document.getElementById('aiPrompt');
  const editor      = document.getElementById('editor');
  if (!btn || !promptInput) return;

  btn.addEventListener('click', async () => {
    if (aiWriting) return;
    const prompt = promptInput.value.trim();
    if (!prompt) { showToast('Enter a prompt first.', 'error'); return; }
    try {
      aiWriting     = true;
      btn.disabled  = true;
      btn.innerText = 'Generating…';
      const result = await callAI(prompt, true);
      if (result.error) throw new Error(result.error);
      if (editor) {
        editor.innerHTML += `<p>${sanitize(result.text)}</p>`;
        updateWordCount();
      }
    } catch(err) {
      showToast('AI generation failed: ' + err.message, 'error');
    } finally {
      aiWriting     = false;
      btn.disabled  = false;
      btn.innerText = 'Generate';
    }
  });
}


// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function _setBtnsDisabled(on) {
  ['aiWriteBtn', 'btnAI', 'v2GenerateBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = on; el.style.opacity = on ? '0.6' : '1'; }
  });
}

function _setField(id, value) {
  if (!value) return;
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
