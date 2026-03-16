// ═══════════════════════════════════════════════
// ai-writer.js — Section-by-section article generation
// ═══════════════════════════════════════════════
import { callAI, PROVIDER_META }        from './ai-core.js';
import { sanitize, showToast }          from './config.js';
import { state }                        from './state.js';
import { updateWordCount }              from './editor.js';
import { generateChartForSection }      from './chart-builder.js';
import {
  startTimer, stopTimer, hideTimer, updateProgress,
  timerLog, showRoadmap, setRoadmapStep, hideRoadmap
} from './timer.js';

let aiWriting  = false;
let _cancelled = false;

// ─────────────────────────────────────────────
// Modal helpers
// ─────────────────────────────────────────────
function openModal(title, sub) {
  document.getElementById('aiModal')?.classList.add('open');
  _setModalText(title, sub);
  const actions = document.getElementById('aiModalActions');
  if (actions) actions.style.display = 'none';
  _setModalContent('<span style="animation:pulse 1s infinite;display:inline-block">Starting…</span>');
}

function closeModal() {
  document.getElementById('aiModal')?.classList.remove('open');
  hideTimer();
  hideRoadmap();
}

function _setModalText(title, sub) {
  const t = document.getElementById('aiModalTitle');
  const s = document.getElementById('aiModalSub');
  if (t && title) t.textContent = title;
  if (s && sub)   s.textContent = sub;
}

function _setModalContent(html) {
  const el = document.getElementById('aiModalContent');
  if (el) el.innerHTML = html;
}

// ─────────────────────────────────────────────
// Cancel
// ─────────────────────────────────────────────
window.cancelOutline = () => {
  _cancelled = true;
  closeModal();
  showToast('Generation cancelled.', 'info');
};

// ─────────────────────────────────────────────
// How many sections to hit the word target
// Each call reliably returns 600–800 words
// ─────────────────────────────────────────────
function sectionsNeeded(wordTarget) {
  const wordsPerSection = 700;
  return Math.max(3, Math.ceil(wordTarget / wordsPerSection));
}

function getWordCount() {
  return (document.getElementById('editor')?.textContent || '')
    .trim().split(/\s+/).filter(Boolean).length;
}

// ─────────────────────────────────────────────
// Retry a single section up to maxRetries times
// Returns { text, error, provider }
// ─────────────────────────────────────────────
async function callWithRetry(prompt, model, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await callAI(prompt, true, model, 8000);
    if (!result.error && result.text?.trim().length > 100) return result;
    if (attempt < maxRetries) {
      timerLog(`  ↺ Retry ${attempt}/${maxRetries - 1}…`);
      await _sleep(1200 * attempt);
    }
  }
  return { text: '', error: 'All retries failed', provider: null };
}

// ─────────────────────────────────────────────
// Render a provider badge for the modal
// ─────────────────────────────────────────────
function _providerBadge(provider) {
  if (!provider) return '';
  const meta = PROVIDER_META[provider] || { label: provider, color: 'var(--muted)', icon: '🤖' };
  return `<span style="
    display:inline-flex;align-items:center;gap:4px;
    background:rgba(255,255,255,0.05);
    border:1px solid ${meta.color}55;
    border-radius:3px;padding:2px 8px;
    font-size:0.7rem;font-weight:700;
    color:${meta.color};
    font-family:var(--mono,monospace);
    white-space:nowrap;
  ">${meta.icon} ${meta.label}</span>`;
}

// ─────────────────────────────────────────────
// window.generateAIPost — entry point
// ─────────────────────────────────────────────
window.generateAIPost = async function generateAIPost() {
  if (aiWriting) { showToast('Already generating — please wait.', 'info'); return; }

  const topic      = document.getElementById('v2TopicPrompt')?.value.trim()
                  || document.getElementById('aiPrompt')?.value.trim() || '';
  const category   = document.getElementById('postCategory')?.value || 'Fintech';
  const tone       = document.getElementById('aiTone')?.value || 'professional';
  const model      = document.getElementById('modelArticle')?.value || 'auto';
  const wordTarget = parseInt(document.getElementById('wordTarget')?.value) || 1200;

  if (!topic) {
    showToast('Enter a topic first.', 'error');
    (document.getElementById('v2TopicPrompt') || document.getElementById('aiPrompt'))?.focus();
    return;
  }

  aiWriting            = true;
  _cancelled           = false;
  state.isGeneratingAI = true;
  _setBtnsDisabled(true);

  const editor = document.getElementById('editor');
  if (editor) editor.innerHTML = '';

  const numSections = sectionsNeeded(wordTarget);
  const wordsPerSec = Math.ceil(wordTarget / numSections);

  openModal(
    '✦ Generating Article…',
    `"${topic.substring(0, 55)}" · ${(wordTarget / 1000).toFixed(0)}k words · ${numSections} sections`
  );
  showRoadmap();

  try {
    // ── STEP 1: Outline ──────────────────────────
    setRoadmapStep('outline', 'active');
    startTimer(numSections);
    timerLog(`Building ${numSections}-section outline…`);
    _setModalContent('📋 Building outline…');

    const outlineResult = await callWithRetry(
      `You are a professional blog editor. Create a detailed outline.
Article topic: "${topic}"
Category: ${category} | Tone: ${tone} | Target: ${wordTarget} words

Generate exactly ${numSections} section titles in English only.
First item must be "Introduction". Last item must be "Conclusion & Key Takeaways".
Each title should be specific and descriptive (not generic like "Section 1").

CRITICAL: Return ONLY a valid JSON array of strings. Nothing else. No explanation, no markdown, no preamble.
["Introduction", "Section Title Two", ..., "Conclusion & Key Takeaways"]`,
      model
    );

    if (_cancelled) return _cleanup();

    let sections = [];
    if (!outlineResult.error) {
      try {
        const raw = outlineResult.text || '';
        const s   = raw.indexOf('[');
        const e   = raw.lastIndexOf(']');
        if (s !== -1 && e !== -1) sections = JSON.parse(raw.substring(s, e + 1));
      } catch(_) {}
    }
    if (!Array.isArray(sections) || sections.length < 2) {
      // Auto-generate fallback outline
      sections = ['Introduction'];
      for (let i = 1; i < numSections - 1; i++) sections.push(`Section ${i + 1}: ${topic}`);
      sections.push('Conclusion & Key Takeaways');
    }

    // Always ensure conclusion is last — AI sometimes puts it in the middle
    const conclusionIdx = sections.findIndex(s =>
      /conclusion|summary|key takeaway|final/i.test(s)
    );
    if (conclusionIdx !== -1 && conclusionIdx !== sections.length - 1) {
      const [conclusion] = sections.splice(conclusionIdx, 1);
      sections.push(conclusion);
    }

    // Trim/pad to exactly numSections — keep conclusion pinned at end
    if (sections.length > numSections) {
      const conclusion = sections[sections.length - 1];
      sections = sections.slice(0, numSections - 1);
      sections.push(conclusion);
    }
    while (sections.length < numSections) {
      sections.splice(sections.length - 1, 0, `Deep Dive ${sections.length}`);
    }

    state.pendingOutline = sections.join('\n');
    setRoadmapStep('outline', 'done');
    timerLog(`✓ Outline: ${sections.length} sections`);

    // ── STEP 2: Write sections one by one ────────
    setRoadmapStep('article', 'active');
    const sectionHTMLs = [];
    let   failedCount  = 0;

    for (let i = 0; i < sections.length; i++) {
      if (_cancelled) break;

      const title    = sections[i];
      const isFirst  = i === 0;
      const isLast   = i === sections.length - 1;
      const progress = `${i + 1}/${sections.length}`;

      timerLog(`✍ [${progress}] ${title.substring(0, 45)}`);

      _setModalContent(
        `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem">
          <span style="font-size:0.75rem;color:var(--muted)">Section ${progress}</span>
          <span style="font-size:0.75rem;color:var(--gold);font-weight:700">${getWordCount().toLocaleString()} words so far</span>
        </div>
        <div style="font-size:0.88rem;color:var(--cream);font-weight:600;margin-bottom:0.5rem">"${title.substring(0, 60)}"</div>
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.6rem">
          <span style="font-size:0.7rem;color:var(--muted)">Writing with</span>
          ${_providerBadge(model === 'auto' ? null : model)}
          <span style="font-size:0.65rem;color:var(--muted);font-style:italic">${model === 'auto' ? '(auto — trying providers in order)' : ''}</span>
        </div>
        <div style="background:var(--navy2);border-radius:3px;height:4px;overflow:hidden">
          <div style="background:var(--gold);height:100%;width:${Math.round((i/sections.length)*100)}%;transition:width 0.5s"></div>
        </div>
        <div style="font-size:0.7rem;color:var(--muted);margin-top:0.4rem">${Math.round((i/sections.length)*100)}% complete</div>`
      );

      const LANG_RULE = `LANGUAGE: Write ONLY in English. Do NOT use any other language.
OUTPUT: Start your response DIRECTLY with <h2>. Do NOT include any preamble, reasoning, explanation, thinking, or markdown. Output ONLY valid HTML.`;

      const prompt = isFirst
        ? `You are a professional blog writer. Write an engaging introduction section.
Topic: "${topic}" | Category: ${category} | Tone: ${tone}
Section heading: "${title}"
Target: ${wordsPerSec} words minimum.
Requirements:
- Start with a strong hook that grabs attention
- Explain what the article covers and why it matters
- Use <h2>${title}</h2> as the heading, followed by <p> paragraphs
- Include real statistics or facts where possible
${LANG_RULE}`

        : isLast
        ? `You are a professional blog writer. Write a strong conclusion section.
Topic: "${topic}" | Category: ${category} | Tone: ${tone}
Section heading: "${title}"
Target: ${wordsPerSec} words minimum.
Requirements:
- Summarise the key insights from the article
- Provide clear, actionable takeaways for the reader
- End with a compelling call to action
- Use <h2>${title}</h2> as heading, followed by <p> paragraphs
${LANG_RULE}`

        : `You are a professional blog writer. Write a detailed, well-researched section.
Topic: "${topic}" | Category: ${category} | Tone: ${tone}
Section heading: "${title}"
Target: ${wordsPerSec} words minimum — do NOT cut short.
Requirements:
- Cover this section comprehensively with examples, data points, and analysis
- Use <h2>${title}</h2> for the main heading
- Use <h3> for sub-points, <p> for paragraphs
- Use <strong> for key terms, <ul><li> for lists, <blockquote> for quotes
- Include at least one specific statistic, case study, or real-world example
- Every paragraph must be substantive — no filler sentences
${LANG_RULE}`;

      const result = await callWithRetry(prompt, model);

      if (_cancelled) break;

      // Show which AI responded in the modal
      const badge = _providerBadge(result.provider);

      if (result.error || !result.text?.trim()) {
        failedCount++;
        sectionHTMLs.push(
          `<div class="failed-section-block"
              data-section="${_esc(title)}" data-topic="${_esc(topic)}"
              data-category="${_esc(category)}" data-tone="${_esc(tone)}"
              data-words="${wordsPerSec}" data-model="${_esc(model)}">
            <div style="background:rgba(239,68,68,0.06);border:1px dashed rgba(239,68,68,0.3);border-radius:4px;padding:1rem;margin:1rem 0">
              <div style="color:#fca5a5;font-size:0.82rem;margin-bottom:0.5rem">
                ⚠ Section failed: "<strong>${title}</strong>" — ${result.error || 'empty response'}
              </div>
              <button onclick="retrySectionGen(this)"
                style="background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.3);color:var(--gold);padding:0.3rem 0.8rem;border-radius:3px;font-size:0.75rem;cursor:pointer">
                🔄 Retry this section
              </button>
            </div>
          </div>`
        );
      } else {
        const clean = sanitize(_stripReasoning(result.text));

        // ── Chart injection ──────────────────────
        // Inject a chart every 3rd body section (not intro/conclusion)
        // Also always inject one after the 2nd section if article is long enough
        let chartHTML = '';
        const isBodySection = !isFirst && !isLast;
        const shouldChart   = isBodySection && (
          i === 2 ||                            // always after 2nd body section
          (i > 2 && (i % 3 === 0))              // then every 3rd section
        );

        if (shouldChart && wordTarget >= 800) {
          timerLog(`  📊 [${progress}] generating chart…`);
          _setModalContent(
            `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem">
              <span style="font-size:0.75rem;color:var(--muted)">Section ${progress} — Chart</span>
              <span style="font-size:0.75rem;color:var(--gold);font-weight:700">${getWordCount().toLocaleString()} words so far</span>
            </div>
            <div style="font-size:0.88rem;color:var(--cream);font-weight:600;margin-bottom:0.5rem">📊 Building data visualization…</div>
            <div style="font-size:0.7rem;color:var(--muted)">"${title.substring(0, 55)}"</div>`
          );
          try {
            chartHTML = await generateChartForSection(topic, title, category, model);
            if (chartHTML) timerLog(`  ✓ [${progress}] chart injected`);
          } catch(_) { chartHTML = ''; }
        }

        sectionHTMLs.push(clean + (chartHTML ? '\n' + chartHTML : ''));
      }

      // Write to editor live — user sees article building in real time
      if (editor) {
        editor.innerHTML = sectionHTMLs.join('\n');
        updateWordCount();
      }

      // Update modal to show which AI actually handled this section
      if (!result.error && result.provider) {
        timerLog(`  ✓ [${progress}] responded by ${PROVIDER_META[result.provider]?.label || result.provider}`);
      }

      // Report real progress to timer
      updateProgress(i + 1, getWordCount());

      // Throttle between sections to avoid rate-limiting on large articles
      if (!_cancelled && i < sections.length - 1) {
        await _sleep(wordTarget >= 10000 ? 1000 : 400);
      }
    }

    setRoadmapStep('article', _cancelled ? 'error' : 'done');
    stopTimer();

    if (_cancelled) return _cleanup();

    // ── STEP 3: Metadata ─────────────────────────
    setRoadmapStep('metadata', 'active');
    timerLog('Generating metadata…');
    _setModalContent('🏷 Writing title, excerpt, tags…');

    const metaResult = await callAI(
      `You are an SEO copywriter. Write metadata for this blog post.
Topic: "${topic}"
Category: ${category}

CRITICAL: Respond ONLY with a single valid JSON object. No markdown, no backticks, no explanation. Start with { and end with }.

{"title":"compelling SEO title under 60 characters","excerpt":"2 engaging sentences that make readers click — no quotes inside","slug":"url-friendly-slug-no-spaces","metaDesc":"meta description under 155 characters","tags":["tag1","tag2","tag3","tag4","tag5"]}`,
      true
    );

    if (!metaResult.error && metaResult.text) {
      try {
        // Strip any markdown fences or leading text before the JSON
        let raw = metaResult.text
          .replace(/```json|```/gi, '')
          .replace(/^[^{]*/s, '')   // strip anything before first {
          .trim();
        const s = raw.indexOf('{');
        const e = raw.lastIndexOf('}');
        if (s !== -1 && e !== -1) {
          const meta = JSON.parse(raw.substring(s, e + 1));
          // Force-set all fields — don't skip if already has a value
          if (meta.title)    { const el = document.getElementById('postTitle');   if (el) el.value = meta.title; }
          if (meta.excerpt)  { const el = document.getElementById('postExcerpt'); if (el) el.value = meta.excerpt; }
          if (meta.slug)     { const el = document.getElementById('postSlug');    if (el) el.value = meta.slug; }
          if (meta.metaDesc) { const el = document.getElementById('postMeta');    if (el) el.value = meta.metaDesc; }
          if (meta.tags?.length) { const el = document.getElementById('postTags'); if (el) el.value = meta.tags.join(', '); }
          timerLog(`✓ Metadata: "${(meta.title||'').substring(0,40)}"`);
        }
      } catch(parseErr) {
        timerLog(`⚠ Metadata parse failed: ${parseErr.message}`);
      }
    } else {
      timerLog(`⚠ Metadata AI error: ${metaResult.error}`);
    }

    setRoadmapStep('metadata', 'done');
    setRoadmapStep('done', 'done');
    stopTimer();

    // ── Done ─────────────────────────────────────
    const finalWords = getWordCount();
    const failNote   = failedCount > 0 ? ` (${failedCount} section${failedCount > 1 ? 's' : ''} need retry)` : '';

    _setModalText(
      failedCount > 0 ? '⚠ Article Ready (with failed sections)' : '✓ Article Ready!',
      `${finalWords.toLocaleString()} words · ${sections.length} sections${failNote}`
    );
    _setModalContent(
      `<div style="color:${failedCount > 0 ? 'var(--gold)' : 'var(--green)'};font-size:1.1rem;font-weight:700;margin-bottom:0.5rem">
        ${failedCount > 0 ? '⚠' : '✓'} Done!
      </div>
      <div style="color:var(--muted);font-size:0.82rem">
        ${finalWords.toLocaleString()} words written<br>
        Target was ${wordTarget.toLocaleString()} words<br>
        ${failedCount > 0 ? `<span style="color:#fca5a5">${failedCount} section(s) failed — scroll down to retry them</span>` : ''}
      </div>`
    );

    setTimeout(closeModal, 2500);
    showToast(
      failedCount > 0
        ? `Done — ${finalWords.toLocaleString()} words. ${failedCount} section(s) need retry.`
        : `Article ready! ${finalWords.toLocaleString()} words.`,
      failedCount > 0 ? 'info' : 'success'
    );

  } catch(err) {
    console.error('[ai-writer]', err);
    _setModalContent(`<div style="color:#fca5a5">✕ ${err.message}</div>`);
    setTimeout(closeModal, 3000);
    showToast('Generation failed: ' + err.message, 'error');
  } finally {
    aiWriting            = false;
    state.isGeneratingAI = false;
    _setBtnsDisabled(false);
  }
};

function _cleanup() {
  aiWriting            = false;
  state.isGeneratingAI = false;
  _setBtnsDisabled(false);
  closeModal();
}

// ─────────────────────────────────────────────
// initAIWriter — wires up the simple #aiWriteBtn
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
      const result  = await callAI(prompt, true);
      if (result.error) throw new Error(result.error);
      if (editor) {
        editor.innerHTML += `<p>${sanitize(result.text)}</p>`;
        updateWordCount();
      }
    } catch(err) {
      showToast('Failed: ' + err.message, 'error');
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
function _stripReasoning(text) {
  if (!text) return '';
  // Remove <think>...</think> blocks (DeepSeek, some models)
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Remove lines that look like chain-of-thought (start with "Let me", "I will", "First,", "Okay,", "Sure,")
  text = text.replace(/^(let me|i will|i'll|okay|sure|alright|here is|here's|of course|certainly|below is)[^\n]*/gim, '');
  // Remove markdown code fences
  text = text.replace(/```html?|```/gi, '');
  // Remove any <h1> tags
  text = text.replace(/<h1[^>]*>.*?<\/h1>/gi, '');
  // If text starts before any HTML tag — strip leading non-HTML lines
  const firstTag = text.search(/<(h[2-6]|p|div|ul|ol|blockquote|section)/i);
  if (firstTag > 10) text = text.substring(firstTag);
  return text.trim();
}

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

function _esc(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
