// ═══════════════════════════════════════════════
// ai-writer.js — AI article generation
// ═══════════════════════════════════════════════
import { sanitize, showToast, slugify, stripTags, parseAIJson } from './config.js';
import { callAI }    from './ai-core.js';
import { state }     from './state.js';
import { updateWordCount } from './editor.js';
import { openAIDrawer }    from './ai-drawer.js';
import { startTimer, stopTimer, hideTimer, timerLog, showRoadmap, setRoadmapStep, hideRoadmap } from './timer.js';

function closeAIModal() { document.getElementById('aiModal')?.classList.remove('open'); }

// ── Read word target from UI ──────────────────
function getWordTarget() {
  const wt = document.getElementById('wordTarget');
  return parseInt(wt?.value) || 1500;
}

// ── Word target → token budget ────────────────
// 1 word ≈ 1.35 tokens; add 20% buffer; cap per-call at 8000
function wordsToTokens(words) {
  return Math.min(8000, Math.ceil(words * 1.35 * 1.2));
}

// ── Number of citations based on word target ──
function citationCount(words) {
  if (words >= 20000) return 15;
  if (words >= 10000) return 12;
  if (words >= 5000)  return 10;
  return 8;
}

export function getTopicFromUI() {
  return document.getElementById('postTitle')?.value.trim()
    || document.getElementById('v2TopicPrompt')?.value.trim()
    || document.getElementById('aiPrompt')?.value.trim()
    || '';
}

export async function generateAIPost() {
  if (state.isGeneratingAI) return;
  const topic = getTopicFromUI();
  if (!topic) { showToast('Please enter a topic.','error'); return; }
  const apEl = document.getElementById('aiPrompt'); if (apEl) apEl.value = topic;

  state.isGeneratingAI = true;
  const btnAI  = document.getElementById('btnAI');
  const btnTxt = document.getElementById('aiBtnText');
  const spinner = document.getElementById('aiSpinner');
  if (btnAI) btnAI.disabled = true;
  if (btnTxt) btnTxt.textContent = 'Generating outline…';
  if (spinner) spinner.style.display = 'inline-block';

  const wordTarget = getWordTarget();

  document.getElementById('aiModalTitle').textContent = '✦ Generating outline…';
  document.getElementById('aiModalSub').textContent   = 'AI is planning your article structure.';
  document.getElementById('aiModalContent').innerHTML = '<span style="animation:pulse 1s infinite;display:inline-block">Working…</span>';
  document.getElementById('aiModalActions').style.display = 'none';
  document.getElementById('aiModal').classList.add('open');
  showRoadmap();
  setRoadmapStep('outline', 'active');
  startTimer('outline');

  // For long-form, request a detailed multi-section outline
  const sectionCount = wordTarget >= 20000 ? 15
                     : wordTarget >= 10000 ? 10
                     : wordTarget >= 5000  ? 7 : 5;

  const outResult = await callAI(
    `Create a detailed article outline with ${sectionCount} sections for:\nTopic: "${topic}"\nCategory: ${document.getElementById('postCategory').value}. Tone: ${document.getElementById('aiTone').value}.\nTarget length: ${wordTarget.toLocaleString()} words.\nReturn ONLY plain text bullet points, one per section. Each bullet should be a full section title.`,
    true
  );

  if (outResult.error) {
    setRoadmapStep('outline', 'error');
    hideTimer(); hideRoadmap(); closeAIModal();
    document.getElementById('aiStatus').textContent = '✕ ' + outResult.error;
    showToast('AI Error: ' + outResult.error,'error');
    if (btnAI) btnAI.disabled = false;
    if (btnTxt) btnTxt.textContent = '✦ Generate Full Article';
    if (spinner) spinner.style.display = 'none';
    state.isGeneratingAI = false;
    return;
  }

  stopTimer();
  setRoadmapStep('outline', 'done');
  state.pendingOutline  = outResult.text;
  state.pendingWordTarget = wordTarget;
  document.getElementById('aiModalTitle').textContent   = `✦ Review Outline (${wordTarget.toLocaleString()} words)`;
  document.getElementById('aiModalSub').textContent     = 'Click "Write Full Article" to generate, or Cancel.';
  document.getElementById('aiModalContent').textContent = outResult.text;
  document.getElementById('aiModalActions').style.display = 'flex';
  if (btnAI) btnAI.disabled = false;
  if (btnTxt) btnTxt.textContent = '✦ Generate Full Article';
  if (spinner) spinner.style.display = 'none';
  state.isGeneratingAI = false;
}
window.generateAIPost = generateAIPost;

export async function confirmOutline() {
  const topic        = document.getElementById('aiPrompt').value.trim();
  const category     = document.getElementById('postCategory').value;
  const tone         = document.getElementById('aiTone').value;
  const modelArticle = document.getElementById('modelArticle').value;
  const wordTarget   = state.pendingWordTarget || getWordTarget();
  const isLongForm   = wordTarget >= 5000;
  const maxTok       = wordsToTokens(wordTarget);
  const results      = [];
  const allAttempts  = [];
  const addR = (icon, label, model, ok) => results.push({icon,label,model,ok});

  document.getElementById('aiResultBox').style.display = 'none';
  document.getElementById('aiModalActions').style.display = 'none';
  document.getElementById('aiModal').classList.add('open');
  setRoadmapStep('outline', 'done');
  setRoadmapStep('article', 'active');
  startTimer('article');

  const editor = document.getElementById('editor');
  editor.innerHTML = '';

  // ── CHUNK-BASED for long-form (≥5k words) ────
  if (isLongForm) {
    const sections = state.pendingOutline
      .split('\n')
      .map(l => l.replace(/^[-•*\d.]+\s*/, '').trim())
      .filter(Boolean);

    const totalSections = sections.length;
    const wordsPerSection = Math.ceil(wordTarget / totalSections);
    const maxTokPerSection = Math.min(8000, wordsPerSection * 2);

    // ── Parallel batch config ──────────────────
    // Batch size 2 = best balance for free tier TPM limits
    // Each section uses ~1500-2000 tokens, 2 parallel = ~3-4k TPM peak
    // Free tier limit is ~10-12k TPM — stays well within range
    // Increase to 3 on paid Groq tier
    const BATCH_SIZE = 2;
    const STAGGER_MS = 600; // ms between each call in a batch to smooth TPM

    document.getElementById('aiModalTitle').textContent = `✦ Writing ${wordTarget.toLocaleString()}-word article…`;
    document.getElementById('aiModalSub').textContent   = `${totalSections} sections · ${BATCH_SIZE} at a time. Keep tab open.`;

    // Result array preserves order regardless of which finishes first
    const sectionResults = new Array(totalSections).fill(null);
    let completedCount = 0;
    let chunksFailed   = 0;

    function buildSectionPrompt(section, index) {
      const isFirst = index === 0;
      return `You are an expert fintech writer for BlogsPro.
Article topic: "${topic}" | Category: ${category} | Tone: ${tone}
Write the section titled: "${section}"
${isFirst ? 'This is the OPENING section — start with a compelling <p> introduction (no heading), then use <h2> for the section title.' : 'Use <h2> for the section title.'}
Target: ${wordsPerSection} words for this section.
Rules:
- Use only: <h2> <h3> <p> <strong> <em> <ul> <li> <blockquote>
- NEVER use <h1> tags
- Write in depth with examples, data, and analysis
- Return ONLY clean HTML for this section. No JSON, no metadata.`;
    }

    function cleanSectionHTML(text) {
      return (text || '')
        .replace(/```html?|```/gi, '')
        .replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, '')
        .replace(/<p><strong>([\s\S]*?)<\/strong><\/p>/g, '<p>$1</p>')
        .trim();
    }

    function renderProgress() {
      const pct = Math.round((completedCount / totalSections) * 100);
      const activeBatch = sections
        .slice(0, totalSections)
        .filter((_, i) => sectionResults[i] === null && i < completedCount + BATCH_SIZE)
        .slice(0, BATCH_SIZE)
        .map((s, i) => `<div style="font-size:0.72rem;color:var(--gold)">⟳ ${s.substring(0,45)}${s.length>45?'…':''}</div>`)
        .join('');

      document.getElementById('aiModalContent').innerHTML =
        `<div style="font-size:0.78rem;color:var(--muted);margin-bottom:0.5rem">
          ${completedCount} of ${totalSections} sections done · ${pct}% complete
        </div>
        <div style="background:var(--navy3);border-radius:2px;height:3px;margin-bottom:0.8rem">
          <div style="height:3px;background:linear-gradient(90deg,var(--gold),var(--gold2));border-radius:2px;width:${pct}%;transition:width 0.3s"></div>
        </div>
        <div style="margin-bottom:0.4rem;font-size:0.7rem;color:var(--muted)">Writing in parallel:</div>
        ${activeBatch}`;
    }

    async function generateSection(index) {
      const section = sections[index];
      timerLog(`[${index+1}/${totalSections}] ${section}`);

      let result = await callAI(buildSectionPrompt(section, index), false, modelArticle, maxTokPerSection);
      if (result.error) {
        await new Promise(r => setTimeout(r, 1000));
        result = await callAI(buildSectionPrompt(section, index), false, 'auto', maxTokPerSection);
      }

      if (result.error) {
        sectionResults[index] = `<div class="failed-section-block" data-section="${section}" data-topic="${topic}" data-category="${category}" data-tone="${tone}" data-words="${wordsPerSection}" data-model="${modelArticle}" style="border:1px dashed rgba(239,68,68,0.4);border-radius:4px;padding:1rem;margin:1rem 0">
          <div class="failed-section-inner">
            <h2 style="color:#fca5a5">${section}</h2>
            <div class="failed-text" style="font-size:0.8rem;color:#fca5a5"><span>⚠ Section failed. ${result.error}</span></div>
            <button class="action-btn" onclick="retrySectionGen(this)" style="margin-top:0.5rem">🔄 Retry Now</button>
          </div>
        </div>`;
        chunksFailed++;
      } else {
        sectionResults[index] = cleanSectionHTML(result.text);
        allAttempts.push(...(result.attemptsDetail||[]));
      }

      completedCount++;
      renderProgress();

      // Stream completed sections into editor in order
      const orderedHTML = sectionResults
        .filter(r => r !== null)
        .join('\n');
      editor.innerHTML = sanitize(orderedHTML);
      updateWordCount();
    }

    // ── Process in batches of BATCH_SIZE ──────
    renderProgress();
    for (let batchStart = 0; batchStart < totalSections; batchStart += BATCH_SIZE) {
      const batchEnd     = Math.min(batchStart + BATCH_SIZE, totalSections);
      const batchIndices = Array.from({length: batchEnd - batchStart}, (_, i) => batchStart + i);

      // Fire sections with a small stagger to smooth TPM usage
      await Promise.all(batchIndices.map((i, offset) =>
        new Promise(resolve => setTimeout(resolve, offset * STAGGER_MS))
          .then(() => generateSection(i))
      ));

      // Pause between batches to let TPM window reset
      if (batchEnd < totalSections) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    addR(chunksFailed === 0 ? '✓' : '⚠',
      `Article: ${totalSections} sections · ${BATCH_SIZE} parallel (${chunksFailed} failed)`,
      modelArticle, chunksFailed === 0);

  } else {
    // ── SINGLE CALL for short articles (<5k words) ─
    document.getElementById('aiModalTitle').textContent = '✦ Writing article…';
    document.getElementById('aiModalSub').textContent   = 'Generating content…';
    document.getElementById('aiModalContent').innerHTML = '<span style="animation:pulse 1s infinite;display:inline-block">Writing full article…</span>';

    const artPrompt = `You are an expert fintech writer for BlogsPro (blogspro.in).
Write a comprehensive article about: "${topic}"
Category: ${category}. Tone: ${tone}.
Target length: ${wordTarget} words.
Follow this outline:
${state.pendingOutline}

RULES:
- NEVER use <h1> tags
- Start with a plain <p> introduction — NOT bold, NOT a heading
- Use only: <h2> <h3> <p> <strong> <em> <ul> <li> <blockquote>
- Do NOT wrap entire paragraphs in <strong>
- Write exactly ${wordTarget} words
- Return ONLY clean HTML. No JSON, no metadata, no markdown.`;

    let artResult = await callAI(artPrompt, false, modelArticle, maxTok);
    if (artResult.error) {
      document.getElementById('aiModalContent').innerHTML = '<span style="animation:pulse 1s infinite;display:inline-block">Retrying…</span>';
      await new Promise(r => setTimeout(r, 2000));
      artResult = await callAI(artPrompt, false, 'auto', maxTok);
    }
    allAttempts.push(...(artResult.attemptsDetail||[]));

    if (artResult.error) {
      setRoadmapStep('article', 'error');
      hideTimer(); hideRoadmap(); closeAIModal();
      document.getElementById('aiStatus').textContent = '✕ Article failed: ' + artResult.error;
      showToast('Article generation failed.','error');
      return;
    }

    const articleHTML = (artResult.text||'')
      .replace(/---METADATA---[\s\S]*/g,'')
      .replace(/\n*---+\s*$/gm,'')
      .replace(/\n*\{"title"[\s\S]*/g,'')
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '')
      .replace(/<p><strong>([\s\S]*?)<\/strong><\/p>/g, '<p>$1</p>')
      .trim();

    editor.innerHTML = sanitize(articleHTML);
    updateWordCount();
    addR('✓', 'Article written', modelArticle, true);
  }

  openAIDrawer('edit');

  // ── Metadata ──────────────────────────────────
  stopTimer();
  setRoadmapStep('article', 'done');
  setRoadmapStep('metadata', 'active');
  startTimer('metadata');
  document.getElementById('aiModalTitle').textContent = '✦ Generating metadata…';
  document.getElementById('aiModalSub').textContent   = 'Title, summary, SEO, citations…';
  document.getElementById('aiModalContent').innerHTML = '<span style="animation:pulse 1s infinite;display:inline-block">Generating metadata…</span>';

  const numCitations = citationCount(wordTarget);

  // Build citation template entries
  const citationTemplate = Array.from({length: numCitations}, (_, i) =>
    `{"apa":"Author ${String.fromCharCode(65+i)}. (Year). Real Title. Real Publisher.","url":"https://real-source.com/path"}`
  ).join(',');

  const metaPrompt = `You are writing metadata for a fintech article titled about: "${topic}".

Return ONLY this exact JSON — no extra text, no markdown:
{
  "title": "Exact specific headline about ${topic} — under 70 chars, NOT generic",
  "summary": "2 compelling sentences summarising THIS specific article — under 160 chars",
  "metaDescription": "SEO meta description specific to ${topic} — under 155 chars",
  "tags": ["specific-tag-1","specific-tag-2","specific-tag-3","specific-tag-4","specific-tag-5"],
  "citations": [${citationTemplate}]
}

CRITICAL RULES:
- title must be SPECIFIC to "${topic}" — not generic like "A Guide to Fintech"
- citations MUST use REAL URLs from: rbi.org.in, sebi.gov.in, worldbank.org, imf.org, bis.org, mckinsey.com, pwc.com, deloitte.com, ft.com, bloomberg.com
- Do NOT use example.com or placeholder URLs
- Return exactly ${numCitations} citations`;

  let metaResult = await callAI(metaPrompt, true, modelArticle);
  if (metaResult.error) {
    await new Promise(r => setTimeout(r, 2000));
    metaResult = await callAI(metaPrompt, true, 'auto');
  }

  allAttempts.push(...(metaResult.attemptsDetail||[]));

  if (metaResult.error) {
    const isRateLimit = metaResult.error.toLowerCase().includes('rate limit') ||
                        metaResult.error.toLowerCase().includes('credits');
    showToast(isRateLimit
      ? 'Article saved! Metadata skipped — daily AI quota reached.'
      : 'Article saved! Metadata failed: ' + metaResult.error, 'error');
  }

  const parsed = parseAIJson(metaResult.error ? '' : (metaResult.text || ''));

  const checks = {};
  if (parsed) {
    if (parsed.title?.trim()) {
      document.getElementById('postTitle').value = stripTags(parsed.title.trim());
      document.getElementById('postSlug').value  = slugify(stripTags(parsed.title.trim()));
      checks.title = true;
    }
    if (parsed.summary?.trim()) {
      document.getElementById('postExcerpt').value = parsed.summary.trim();
      checks.summary = true;
    }
    if (parsed.metaDescription?.trim()) {
      document.getElementById('postMeta').value = parsed.metaDescription.trim();
      checks.meta = true;
    }
    if (parsed.tags?.length) {
      document.getElementById('postTags').value = parsed.tags.join(', ');
      checks.tags = true;
    }
    if (parsed.citations?.length) {
      const citationItems = parsed.citations.map(c => {
        if (typeof c === 'object' && c.apa) {
          const apaText = c.apa.replace(/https?:\/\/[^\s]+/g,'').trim().replace(/\.?\s*$/,'');
          const url     = c.url || (c.apa.match(/https?:\/\/[^\s]+/)||[])[0] || '';
          const isFake  = !url || url.includes('example.com') || url.includes('real-source.com');
          return `<li style="margin-bottom:0.5rem">
            <span style="color:var(--cream)">${apaText}.</span>
            ${!isFake ? `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--gold);word-break:break-all"> ${url}</a>` : ''}
          </li>`;
        }
        const urlMatch = typeof c === 'string' ? c.match(/https?:\/\/[^\s"]+/) : null;
        if (urlMatch) {
          const label = c.replace(urlMatch[0],'').replace(/[-—–:]+$/,'').trim() || urlMatch[0];
          return `<li style="margin-bottom:0.5rem"><a href="${urlMatch[0]}" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">${label}</a></li>`;
        }
        return `<li style="margin-bottom:0.5rem"><em>${c}</em></li>`;
      }).join('');

      editor.innerHTML += sanitize(
        `<h2>References</h2><ol style="padding-left:1.5rem;font-size:0.9rem;line-height:1.7">${citationItems}</ol>`
      );
      updateWordCount();
      checks.citations = true;
    }
  }

  if (!checks.title && !document.getElementById('postTitle').value.trim()) {
    document.getElementById('postTitle').value = topic.length < 80 ? topic : topic.substring(0,75)+'…';
    document.getElementById('postSlug').value  = slugify(topic);
  }

  const metaFields = ['title','summary','tags','meta','citations'].filter(f=>checks[f]);
  addR(metaFields.length?'✓':'—', 'Metadata: '+(metaFields.join(', ')||'none'), '', metaFields.length>0);

  setRoadmapStep('metadata', 'done');
  setRoadmapStep('done', 'done');
  hideTimer();
  setTimeout(hideRoadmap, 1200);
  closeAIModal();

  document.getElementById('aiResultList').innerHTML = results.map(r =>
    `<div style="display:flex;align-items:flex-start;gap:0.5rem;font-size:0.78rem">
      <span style="color:${r.ok?'var(--green)':'var(--muted)'};flex-shrink:0;font-weight:700">${r.icon}</span>
      <span style="color:${r.ok?'var(--cream)':'var(--muted)'}">${r.label}</span>
    </div>`
  ).join('');
  document.getElementById('aiResultBox').style.display = 'block';
  document.getElementById('aiStatus').textContent = `✓ Complete`;
  showToast(`Article generated! ${wordTarget >= 5000 ? '(Long-form — chunk by chunk)' : ''}`, 'success');
}
window.confirmOutline = confirmOutline;

window.cancelOutline = () => {
  document.getElementById('aiModal')?.classList.remove('open');
  state.pendingOutline = '';
  state.pendingWordTarget = null;
};
