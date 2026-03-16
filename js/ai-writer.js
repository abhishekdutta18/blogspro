// ═══════════════════════════════════════════════
// ai-writer.js — Full article AI generation
// Exposes window.generateAIPost used by v2-editor.js
// ═══════════════════════════════════════════════
import { callAI }       from './ai-core.js';
import { sanitize, showToast } from './config.js';
import { state }        from './state.js';
import { updateWordCount } from './editor.js';
import { startTimer, stopTimer, hideTimer, timerLog, showRoadmap, setRoadmapStep, hideRoadmap } from './timer.js';

let aiWriting = false;

// ── Main entry point called by handleGenerateClick() ──
window.generateAIPost = async function generateAIPost() {
  if (aiWriting) { showToast('Already generating — please wait.', 'info'); return; }

  const topic    = document.getElementById('aiPrompt')?.value.trim()
                || document.getElementById('v2TopicPrompt')?.value.trim();
  const category = document.getElementById('postCategory')?.value || 'Fintech';
  const tone     = document.getElementById('aiTone')?.value || 'professional';
  const model    = document.getElementById('modelArticle')?.value || 'auto';
  const wordTarget = parseInt(document.getElementById('wordTarget')?.value) || 1200;

  if (!topic) {
    showToast('Enter a topic first.', 'error');
    document.getElementById('v2TopicPrompt')?.focus();
    return;
  }

  aiWriting       = true;
  state.isGeneratingAI = true;

  // Disable generate buttons
  _setBtnsDisabled(true);

  const editor = document.getElementById('editor');
  if (editor) editor.innerHTML = '';

  showRoadmap();
  startTimer('outline');

  try {
    // ── STEP 1: Outline ───────────────────────
    setRoadmapStep('outline', 'active');
    timerLog('Building outline…');

    const outlineResult = await callAI(
      `Create a detailed blog post outline about: "${topic}"\nCategory: ${category}\nTarget: ${wordTarget} words\n\nReturn ONLY a JSON array of section titles (strings). No intro/conclusion titles.\nExample: ["Section One","Section Two","Section Three"]`,
      true, model
    );

    let sections = [];
    if (!outlineResult.error) {
      try {
        const s = outlineResult.text.indexOf('[');
        const e = outlineResult.text.lastIndexOf(']');
        if (s !== -1 && e !== -1) sections = JSON.parse(outlineResult.text.substring(s, e + 1));
      } catch(_) {}
    }
    // Fallback outline if parse failed
    if (!sections.length) sections = ['Introduction', 'Key Insights', 'Analysis', 'Conclusion'];

    state.pendingOutline = sections.join('\n');
    setRoadmapStep('outline', 'done');
    stopTimer();

    // ── STEP 2: Article ───────────────────────
    setRoadmapStep('article', 'active');
    startTimer('article');
    timerLog(`Writing ${wordTarget} words…`);

    const wordsPerSection = Math.ceil(wordTarget / sections.length);
    const articleResult = await callAI(
      `Write a complete, detailed ${tone} blog post about: "${topic}"\nCategory: ${category}\n\nSections to cover:\n${sections.map((s,i)=>`${i+1}. ${s}`).join('\n')}\n\nRules:\n- Target ${wordTarget} words total (~${wordsPerSection} words per section)\n- Use <h2> for section titles, <h3> for sub-sections\n- Use <p>, <strong>, <em>, <ul>, <li>, <blockquote>\n- NEVER use <h1> or <script>\n- Return ONLY clean HTML`,
      true, model, 8000
    );

    setRoadmapStep('article', 'done');
    stopTimer();

    if (articleResult.error) throw new Error(articleResult.error);

    const cleanArticle = sanitize(
      (articleResult.text || '').replace(/```html?|```/gi, '').replace(/<h1[^>]*>.*?<\/h1>/gi, '').trim()
    );
    if (editor) {
      editor.innerHTML = cleanArticle;
      updateWordCount();
    }

    // ── STEP 3: Metadata ──────────────────────
    setRoadmapStep('metadata', 'active');
    startTimer('metadata');
    timerLog('Generating metadata…');

    const metaResult = await callAI(
      `For this blog post about "${topic}", return ONLY JSON:\n{"title":"SEO title under 60 chars","excerpt":"compelling 2-sentence summary","slug":"url-slug","metaDesc":"meta description under 155 chars","tags":["tag1","tag2","tag3","tag4","tag5"]}`,
      true, model
    );

    if (!metaResult.error) {
      try {
        const s = metaResult.text.indexOf('{');
        const e = metaResult.text.lastIndexOf('}');
        if (s !== -1 && e !== -1) {
          const meta = JSON.parse(metaResult.text.substring(s, e + 1));
          if (meta.title)    { const el = document.getElementById('postTitle');   if (el) el.value = meta.title; }
          if (meta.excerpt)  { const el = document.getElementById('postExcerpt'); if (el) el.value = meta.excerpt; }
          if (meta.slug)     { const el = document.getElementById('postSlug');    if (el) el.value = meta.slug; }
          if (meta.metaDesc) { const el = document.getElementById('postMeta');    if (el) el.value = meta.metaDesc; }
          if (meta.tags?.length) { const el = document.getElementById('postTags'); if (el) el.value = meta.tags.join(', '); }
        }
      } catch(_) {}
    }

    setRoadmapStep('metadata', 'done');
    setRoadmapStep('done', 'done');
    hideTimer();

    const wordCount = (editor?.textContent || '').trim().split(/\s+/).filter(Boolean).length;
    showToast(`Article ready! ${wordCount.toLocaleString()} words generated.`, 'success');

  } catch(err) {
    console.error('[ai-writer] generateAIPost failed:', err);
    hideTimer();
    hideRoadmap();
    showToast('Generation failed: ' + err.message, 'error');
  } finally {
    aiWriting = false;
    state.isGeneratingAI = false;
    _setBtnsDisabled(false);
  }
};


// ── initAIWriter — wires up the simple #aiWriteBtn ──
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
      console.error('AI Writer Error:', err);
      showToast('AI generation failed: ' + err.message, 'error');
    } finally {
      aiWriting     = false;
      btn.disabled  = false;
      btn.innerText = 'Generate';
    }
  });
}


function _setBtnsDisabled(on) {
  ['aiWriteBtn', 'btnAI', 'v2GenerateBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled    = on;
      el.style.opacity = on ? '0.6' : '1';
    }
  });
}
