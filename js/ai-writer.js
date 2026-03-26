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
  timerLog, showRoadmap, setRoadmapStep, hideRoadmap, addTimeReason
} from './timer.js';

let aiWriting  = false;
let _cancelled = false;
const JOB_KEY = "bp_ai_writer_job_v1";

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

function saveJobState(payload) {
  try {
    localStorage.setItem(JOB_KEY, JSON.stringify({
      ...payload,
      updatedAt: Date.now(),
    }));
  } catch (_) {}
}

function loadJobState() {
  try {
    const raw = localStorage.getItem(JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.running) return null;
    const age = Date.now() - (parsed.updatedAt || 0);
    if (age > 1000 * 60 * 60 * 24) {
      localStorage.removeItem(JOB_KEY);
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

function clearJobState() {
  try { localStorage.removeItem(JOB_KEY); } catch (_) {}
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

function _clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function heuristicSectionCount(topic, category, wordTarget) {
  const t = String(topic || "").toLowerCase();
  const c = String(category || "").toLowerCase();
  const words = t.split(/\s+/).filter(Boolean).length;

  // Base on target length
  let n = Math.round((wordTarget || 1200) / 520);

  // Topic breadth/complexity signals
  const broadSignals = [
    "vs", "versus", "comparison", "landscape", "ecosystem", "framework",
    "roadmap", "strategy", "regulation", "compliance", "architecture",
    "future", "trends", "market", "case study", "global", "india"
  ];
  const narrowSignals = ["definition", "what is", "overview", "basics", "intro"];
  const broadHits = broadSignals.filter(s => t.includes(s)).length;
  const narrowHits = narrowSignals.filter(s => t.includes(s)).length;

  if (words >= 7) n += 1;
  if (words >= 11) n += 1;
  if (broadHits >= 2) n += 2;
  else if (broadHits === 1) n += 1;
  if (narrowHits >= 1) n -= 1;
  if (c.includes("compliance") || c.includes("strategy")) n += 1;

  return _clamp(n, 3, 16);
}

async function decideSectionCount(topic, category, wordTarget, model) {
  const heuristic = heuristicSectionCount(topic, category, wordTarget);
  try {
    const result = await callAI(
      `Decide how many sections are needed for a high-quality article.
Topic: "${topic}"
Category: "${category}"
Target words: ${wordTarget}

Rules:
- Return ONLY valid JSON.
- Section count must be between 3 and 16.
- More complex/broad topics need more sections than narrow topics.
- Include intro and conclusion inside this count.

{"sections":8,"reason":"one short sentence"}`,
      true,
      model,
      800
    );

    if (!result.error && result.text) {
      const s = result.text.indexOf("{");
      const e = result.text.lastIndexOf("}");
      if (s !== -1 && e !== -1) {
        const parsed = JSON.parse(result.text.substring(s, e + 1));
        const n = Number(parsed.sections);
        if (Number.isFinite(n)) return _clamp(Math.round(n), 3, 16);
      }
    }
  } catch (_) {}
  return heuristic;
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
    if (String(result.error || '').toLowerCase().includes('endpoint not configured')) {
      return result;
    }
    if (attempt < maxRetries) {
      const reason = result.error
        ? `Retry ${attempt}: provider error — ${(result.error || '').substring(0, 50)}`
        : `Retry ${attempt}: response too short (${result.text?.trim().length || 0} chars)`;
      timerLog(`  ↺ ${reason}`);
      addTimeReason(`⏳ +${Math.round(1.2 * attempt)}s — ${reason}`);
      await _sleep(1200 * attempt);
    }
  }
  return { text: '', error: 'All retries failed', provider: null };
}

function buildFallbackSectionHtml({ title, topic, category, tone, wordsTarget, isIntro, isConclusion }) {
  const safeTitle = _esc(title || "Section");
  const safeTopic = _esc(topic || "the topic");
  const safeCategory = _esc(category || "General");
  const safeTone = _esc(tone || "professional");
  const minWords = Math.max(180, Math.round((wordsTarget || 600) * 0.5));
  const lens = _sectionLens(title);

  const sectionPrompt = isIntro
    ? `Set context for "${safeTopic}" in ${safeCategory} and define why this topic matters right now.`
    : isConclusion
      ? `Summarize the strongest takeaways for "${safeTopic}" and end with concrete next steps.`
      : `Expand "${safeTitle}" with specific facts, examples, and practical implications.`;

  return `
<h2>${safeTitle}</h2>
<p><strong>Draft placeholder:</strong> AI generation was unavailable for this section.</p>
<p>Focus area: ${lens}. Direction: ${sectionPrompt}</p>
<p><em>Complete this section to approximately ${minWords}+ words in ${safeTone} tone, keeping examples tied to "${safeTopic}".</em></p>`.trim();
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
window.generateAIPost = async function generateAIPost(resume = null) {
  if (aiWriting) { showToast('Already generating — please wait.', 'info'); return; }

  const topic      = resume?.topic
                  || document.getElementById('v2TopicPrompt')?.value.trim()
                  || document.getElementById('aiPrompt')?.value.trim() || '';
  const category   = resume?.category || document.getElementById('postCategory')?.value || 'Fintech';
  const tone       = resume?.tone || document.getElementById('aiTone')?.value || 'professional';
  const model      = resume?.model || document.getElementById('modelArticle')?.value || 'auto';
  const wordTarget = parseInt(resume?.wordTarget || document.getElementById('wordTarget')?.value) || 1200;

  if (!topic) {
    showToast('Enter a topic first.', 'error');
    (document.getElementById('v2TopicPrompt') || document.getElementById('aiPrompt'))?.focus();
    return;
  }

  aiWriting            = true;
  _cancelled           = false;
  state.isGeneratingAI = true;
  _setBtnsDisabled(true);
  _setGenerateUi(true, 'Preparing generation…');

  const editor = document.getElementById('editor');
  if (editor && !resume) editor.innerHTML = '';

  const numSections = Array.isArray(resume?.sections) && resume.sections.length
    ? resume.sections.length
    : await decideSectionCount(topic, category, wordTarget, model);
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

    let outlineResult = { provider: null, error: null, text: '' };
    let sections = Array.isArray(resume?.sections) ? resume.sections : [];
    let sectionHTMLs = Array.isArray(resume?.sectionHTMLs) ? resume.sectionHTMLs : [];
    let startIndex = Number.isInteger(resume?.nextIndex) ? resume.nextIndex : 0;

    if (!sections.length) {
      outlineResult = await callWithRetry(
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
    const outlineProvider = PROVIDER_META[outlineResult.provider]?.label || outlineResult.provider || (resume ? 'resume' : 'auto');
    setRoadmapStep('outline', 'done', outlineProvider);
    timerLog(`✓ Outline: ${sections.length} sections (via ${outlineProvider})`);
    saveJobState({
      running: true,
      topic, category, tone, model, wordTarget,
      sections,
      sectionHTMLs,
      nextIndex: startIndex,
    });

    // ── STEP 2: Write sections one by one ────────
    setRoadmapStep('article', 'active');
    let   failedCount  = 0;

    for (let i = startIndex; i < sections.length; i++) {
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
      const ACRONYM_RULE = `Acronym rule: on first mention, expand shortforms in brackets, e.g. "UPI (Unified Payments Interface)", "RBI (Reserve Bank of India)", "KYC (Know Your Customer)".`;

      // ── FIX: Pass outline + prior section context to prevent repetitive content ──
      const outlineContext = `\nFull article outline (${sections.length} sections):\n${sections.map((s,idx) => `${idx+1}. ${s}`).join('\n')}\nYou are writing section ${i+1} of ${sections.length}.`;

      let priorContext = '';
      if (sectionHTMLs.length > 0) {
        const summaries = sectionHTMLs.map((html, idx) => {
          if (!html || html.includes('failed-section-block')) return null;
          const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          return `- "${sections[idx]}": ${text.substring(0, 120)}…`;
        }).filter(Boolean);
        if (summaries.length > 0) {
          priorContext = `\nSections already written:\n${summaries.join('\n')}\nCRITICAL: Do NOT repeat points, statistics, or examples from earlier sections. Introduce NEW information only.`;
        }
      }

      const prompt = isFirst
        ? `You are a professional blog writer. Write an engaging introduction section.
Topic: "${topic}" | Category: ${category} | Tone: ${tone}
Section heading: "${title}"
Target: ${wordsPerSec} words minimum.${outlineContext}
Requirements:
- Start with a strong hook that grabs attention
- Explain what the article covers and why it matters
- Briefly preview the key sections the reader will explore
- Use <h2>${title}</h2> as the heading, followed by <p> paragraphs
- Include real statistics or facts where possible
${ACRONYM_RULE}
${LANG_RULE}`

        : isLast
        ? `You are a professional blog writer. Write a strong conclusion section.
Topic: "${topic}" | Category: ${category} | Tone: ${tone}
Section heading: "${title}"
Target: ${wordsPerSec} words minimum.${outlineContext}${priorContext}
Requirements:
- Summarise the key insights from the article without repeating them word-for-word
- Provide clear, actionable takeaways for the reader
- End with a compelling call to action
${ACRONYM_RULE}
- Use <h2>${title}</h2> as heading, followed by <p> paragraphs
${LANG_RULE}`

        : `You are a professional blog writer. Write a detailed, well-researched section.
Topic: "${topic}" | Category: ${category} | Tone: ${tone}
Section heading: "${title}"
Target: ${wordsPerSec} words minimum — do NOT cut short.${outlineContext}${priorContext}
Requirements:
- Cover this section comprehensively with examples, data points, and analysis
- Use <h2>${title}</h2> for the main heading
- Use <h3> for sub-points, <p> for paragraphs
- Use <strong> for key terms, <ul><li> for lists, <blockquote> for quotes
- DO NOT generate any HTML data tables, charts, or SVG manually. Only use text and basic formatting elements.
- Include at least one specific statistic, case study, or real-world example
- Every paragraph must be substantive — no filler sentences
- Do NOT re-introduce the topic or repeat the article premise
${ACRONYM_RULE}
${LANG_RULE}`;

      let result = await callWithRetry(prompt, model);

      // Relevance guard: auto-retry once with stricter constraints if drifted off-topic.
      if (!result.error && result.text?.trim()) {
        const relevanceKeys = _topicKeywords(topic, category, title);
        if (!_isRelevantToTopic(result.text, relevanceKeys)) {
          timerLog(`  ↺ [${progress}] off-topic output detected — retrying with strict relevance`);
          const focusedPrompt = `${prompt}

CRITICAL RELEVANCE RULES:
- This section MUST stay strictly about: "${topic}".
- It MUST include at least 3 of these terms naturally: ${relevanceKeys.join(', ')}.
- Do not switch to unrelated domains, countries, or topics.
- Keep examples and data anchored to "${topic}" and "${category}".`;
          const retry = await callWithRetry(focusedPrompt, model, 2);
          if (!retry.error && retry.text?.trim()) {
            result = retry;
          }
        }
      }

      // Repetition guard: if section overlaps too much with prior sections,
      // retry once with explicit anti-repeat constraints.
      if (!result.error && result.text?.trim() && sectionHTMLs.length > 0) {
        const priorText = _plainText(sectionHTMLs.join("\n"));
        const overlap = _repetitionScore(result.text, priorText);
        if (overlap > 0.26) {
          timerLog(`  ↺ [${progress}] repetitive output (${Math.round(overlap * 100)}%) — retrying`);
          const antiRepeatPrompt = `${prompt}

CRITICAL ANTI-REPETITION RULES:
- Do NOT reuse sentences from previous sections.
- Use fresh examples, fresh statistics, and fresh subheadings.
- Avoid repeating these recently used lines:
${_sampleRecentSentences(sectionHTMLs).map(s => `- ${s}`).join("\n")}
- Keep semantic overlap with prior sections below 20%.`;
          const retry = await callWithRetry(antiRepeatPrompt, model, 2);
          if (!retry.error && retry.text?.trim()) {
            result = retry;
          }
        }
      }

      if (_cancelled) break;

      // Show which AI responded in the modal
      const badge = _providerBadge(result.provider);

      if (result.error || !result.text?.trim()) {
        failedCount++;
        timerLog(`  ⚠ [${progress}] AI unavailable — inserted fallback draft`);
        sectionHTMLs.push(
          buildFallbackSectionHtml({
            title,
            topic,
            category,
            tone,
            wordsTarget: wordsPerSec,
            isIntro: isFirst,
            isConclusion: isLast,
          })
        );
      } else {
        const clean = sanitize(_expandCommonAcronyms(_dedupeParagraphs(_stripReasoning(result.text))));

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
      saveJobState({
        running: true,
        topic, category, tone, model, wordTarget,
        sections,
        sectionHTMLs,
        nextIndex: i + 1,
      });

      // Update modal to show which AI actually handled this section
      if (!result.error && result.provider) {
        const provLabel = PROVIDER_META[result.provider]?.label || result.provider;
        timerLog(`  ✓ [${progress}] responded by ${provLabel}`);
        setRoadmapStep('article', 'active', provLabel);
      }

      // Report real progress to timer
      updateProgress(i + 1, getWordCount());

      // Throttle between sections to avoid rate-limiting on large articles
      if (!_cancelled && i < sections.length - 1) {
        if (wordTarget >= 10000) addTimeReason('⏳ Large article — throttling between sections');
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
          const metaKeys = _topicKeywords(topic, category, topic);
          const fallbackTitle = _buildFallbackTitle(topic, category);
          const fallbackExcerpt = _buildFallbackExcerpt(topic, category);

          const safeTitle = _isRelevantToTopic(meta.title || '', metaKeys) ? meta.title : fallbackTitle;
          const safeExcerpt = _isRelevantToTopic(meta.excerpt || '', metaKeys) ? meta.excerpt : fallbackExcerpt;
          const safeMetaDesc = _isRelevantToTopic(meta.metaDesc || '', metaKeys) ? meta.metaDesc : fallbackExcerpt.slice(0, 155);
          const safeSlug = meta.slug || _slugify(topic);
          const safeTags = Array.isArray(meta.tags) && meta.tags.length
            ? meta.tags
            : _topicKeywords(topic, category, '').slice(0, 5);

          // Force-set all fields — don't skip if already has a value
          if (safeTitle)    { const el = document.getElementById('postTitle');   if (el) el.value = safeTitle; }
          if (safeExcerpt)  { const el = document.getElementById('postExcerpt'); if (el) el.value = safeExcerpt; }
          if (safeSlug)     { const el = document.getElementById('postSlug');    if (el) el.value = safeSlug; }
          if (safeMetaDesc) { const el = document.getElementById('postMeta');    if (el) el.value = safeMetaDesc; }
          if (safeTags?.length) { const el = document.getElementById('postTags'); if (el) el.value = safeTags.join(', '); }
          timerLog(`✓ Metadata: "${(safeTitle||'').substring(0,40)}"`);
        }
      } catch(parseErr) {
        timerLog(`⚠ Metadata parse failed: ${parseErr.message}`);
      }
    } else {
      timerLog(`⚠ Metadata AI error: ${metaResult.error}`);
    }

    const metaProvider = PROVIDER_META[metaResult.provider]?.label || metaResult.provider || 'auto';
    setRoadmapStep('metadata', 'done', metaProvider);
    setRoadmapStep('done', 'done');
    stopTimer();
    clearJobState();

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
    _setGenerateUi(false, 'Ready.');
  }
};

// ── UI Handlers for admin.html ────────────────
window._setWordTarget = (btn, val) => {
  document.querySelectorAll('.word-target-btn').forEach(b => {
    b.classList.remove('active');
    b.style.background = 'transparent';
    b.style.borderColor = 'var(--border)';
    b.style.color = 'var(--muted)';
  });
  btn.classList.add('active');
  btn.style.background = 'rgba(201,168,76,0.1)';
  btn.style.borderColor = 'rgba(201,168,76,0.3)';
  btn.style.color = 'var(--gold)';
  
  const input = document.getElementById('wordTarget');
  if (input) input.value = val;
  
  const longNotice = document.getElementById('longFormNotice');
  if (longNotice) longNotice.style.display = (val >= 20000) ? 'block' : 'none';
  
  const customInput = document.getElementById('wordTargetCustom');
  if (customInput) customInput.value = '';
  const customLabel = document.getElementById('wordTargetCustomLabel');
  if (customLabel) customLabel.textContent = '—';
};

window._applyCustomWordTarget = (input) => {
  const val = parseInt(input.value);
  if (!val || val < 100) return;
  
  document.querySelectorAll('.word-target-btn').forEach(b => {
    b.classList.remove('active');
    b.style.background = 'transparent';
    b.style.borderColor = 'var(--border)';
    b.style.color = 'var(--muted)';
  });
  
  const targetInput = document.getElementById('wordTarget');
  if (targetInput) targetInput.value = val;
  
  const customLabel = document.getElementById('wordTargetCustomLabel');
  if (customLabel) customLabel.textContent = (val / 1000).toFixed(1) + 'k';
  
  const longNotice = document.getElementById('longFormNotice');
  if (longNotice) longNotice.style.display = (val >= 20000) ? 'block' : 'none';
};

window._onModelChange = (val) => {
  const info = document.getElementById('modelWarning');
  if (!info) return;
  if (val === 'auto') {
    info.textContent = '⚡ Auto tries DeepSeek V3 → Gemini → Qwen → Llama in order.';
    info.style.color = 'var(--muted)';
  } else if (val === 'auto-free') {
    info.textContent = '✦ Uses best available free models via OpenRouter (No credits needed).';
    info.style.color = 'var(--gold)';
  } else {
    info.textContent = `🚀 Using ${val.charAt(0).toUpperCase() + val.slice(1)} specifically.`;
    info.style.color = 'var(--cream)';
  }
};

function _cleanup() {
  aiWriting            = false;
  state.isGeneratingAI = false;
  _setBtnsDisabled(false);
  _setGenerateUi(false, 'Cancelled.');
  closeModal();
  clearJobState();
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

  const pending = loadJobState();
  if (pending && !aiWriting && Array.isArray(pending.sections) && pending.nextIndex < pending.sections.length) {
    const editorEl = document.getElementById('editor');
    if (editorEl && Array.isArray(pending.sectionHTMLs) && pending.sectionHTMLs.length) {
      editorEl.innerHTML = pending.sectionHTMLs.join('\n');
      updateWordCount();
    }
    const promptEl = document.getElementById('v2TopicPrompt') || document.getElementById('aiPrompt');
    if (promptEl && pending.topic) promptEl.value = pending.topic;
    const catEl = document.getElementById('postCategory');
    if (catEl && pending.category) catEl.value = pending.category;
    const wtEl = document.getElementById('wordTarget');
    if (wtEl && pending.wordTarget) wtEl.value = pending.wordTarget;

    showToast('Resuming article generation from last saved point…', 'info');
    setTimeout(() => {
      window.generateAIPost(pending).catch(() => {});
    }, 500);
  }
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

function _setGenerateUi(on, status = '') {
  const aiTxt = document.getElementById('aiBtnText');
  const aiSp  = document.getElementById('aiSpinner');
  if (aiTxt) aiTxt.textContent = on ? 'Generating Article…' : '✦ Generate Article';
  if (aiSp) aiSp.style.display = on ? 'inline-block' : 'none';

  const v2Txt = document.getElementById('v2GenerateText');
  const v2Sp  = document.getElementById('v2GenerateSpin');
  const v2St  = document.getElementById('v2GenerateStatus');
  if (v2Txt) v2Txt.textContent = on ? 'Generating…' : '✦ Generate Article';
  if (v2Sp) v2Sp.style.display = on ? 'inline-block' : 'none';
  if (v2St) v2St.textContent = status;
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

function _topicKeywords(topic, category, sectionTitle = '') {
  const stop = new Set([
    'the','and','for','with','from','into','that','this','your','their','have','has','are','was','were','about','into',
    'what','when','where','which','while','will','would','could','should','how','why','but','not','all','more','less',
    'section','introduction','conclusion','key','takeaways','write','article','blog','guide'
  ]);
  const raw = `${topic} ${category} ${sectionTitle}`.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 4 && !stop.has(w));
  const uniq = [...new Set(raw)];
  return uniq.slice(0, 8);
}

function _plainText(htmlOrText = '') {
  return String(htmlOrText)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function _isRelevantToTopic(htmlOrText, keywords = []) {
  const text = _plainText(htmlOrText);
  if (!text || keywords.length === 0) return false;
  let hits = 0;
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) hits++;
  }
  const ratio = hits / keywords.length;
  return hits >= Math.min(3, keywords.length) || ratio >= 0.45;
}

function _slugify(s = '') {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function _buildFallbackTitle(topic, category) {
  const base = `${topic}`.trim();
  if (!base) return `Practical ${category} Guide`;
  const short = base.length > 54 ? `${base.slice(0, 51)}...` : base;
  return `${short} | ${category} Guide`;
}

function _buildFallbackExcerpt(topic, category) {
  return `A practical ${category.toLowerCase()} guide to ${topic}, with key insights, examples, and actionable takeaways.`;
}

function _sectionLens(title = "") {
  const t = String(title).toLowerCase();
  if (/intro|overview|context|background/.test(t)) return "Context and framing";
  if (/trend|market|growth|forecast/.test(t)) return "Market movement and trajectory";
  if (/risk|compliance|regulation|policy|audit/.test(t)) return "Risk, governance, and compliance";
  if (/strategy|roadmap|plan|execution/.test(t)) return "Strategy and execution";
  if (/case|example|study/.test(t)) return "Real-world examples and outcomes";
  if (/conclusion|takeaway|summary|next/.test(t)) return "Synthesis and next steps";
  return "Section-specific analysis";
}

function _ngrams(text, n = 4) {
  const toks = _plainText(text).split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i <= toks.length - n; i++) {
    out.add(toks.slice(i, i + n).join(" "));
  }
  return out;
}

function _repetitionScore(current, prior) {
  const a = _ngrams(current, 4);
  const b = _ngrams(prior, 4);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const g of a) {
    if (b.has(g)) overlap++;
  }
  return overlap / a.size;
}

function _sampleRecentSentences(sectionHtmls) {
  const recent = sectionHtmls.slice(-2).join(" ");
  const sentences = _plainText(recent)
    .split(/[.!?]\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 30 && s.length < 150);
  return sentences.slice(0, 4);
}

function _dedupeParagraphs(html = "") {
  const parts = String(html).split(/(<\/p>)/i);
  if (parts.length < 3) return html;
  const seen = new Set();
  const kept = [];
  for (let i = 0; i < parts.length; i += 2) {
    const para = (parts[i] || "").trim();
    const end = parts[i + 1] || "";
    if (!para) continue;
    const key = _plainText(para).slice(0, 220);
    if (key.length < 20 || !seen.has(key)) {
      seen.add(key);
      kept.push(para + end);
    }
  }
  return kept.length ? kept.join("\n") : html;
}

function _expandCommonAcronyms(html = "") {
  const map = {
    UPI: 'Unified Payments Interface',
    RBI: 'Reserve Bank of India',
    SEBI: 'Securities and Exchange Board of India',
    KYC: 'Know Your Customer',
    AML: 'Anti-Money Laundering',
    API: 'Application Programming Interface',
    BNPL: 'Buy Now, Pay Later',
    NEFT: 'National Electronic Funds Transfer',
    RTGS: 'Real Time Gross Settlement',
    IMPS: 'Immediate Payment Service',
  };
  let out = String(html || '');
  for (const [abbr, full] of Object.entries(map)) {
    const re = new RegExp(`\\b${abbr}\\b`);
    if (re.test(out) && !new RegExp(`${abbr}\\s*\\(`).test(out)) {
      out = out.replace(re, `${abbr} (${full})`);
    }
  }
  return out;
}
