// ═══════════════════════════════════════════════
// ai-writer.js — AI article generation
// ═══════════════════════════════════════════════
import { sanitize, showToast, slugify, stripTags, parseAIJson } from './config.js';
import { callAI, callAIWithModel, getNextPoolModel, resetModelPool } from './ai-core.js';
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

// ── AI Chart + Data Generator ────────────────
// Generates an inline Chart.js visualization with data sourced from AI
// plus a small references section below it
async function generateChartForSection(sectionTitle, topic, category, sectionIndex) {
  try {
    const chartPrompt = `You are a fintech data analyst. Generate realistic statistical data for a chart about: "${sectionTitle}" in the context of "${topic}" (${category}).

Return ONLY valid JSON — no markdown, no extra text:
{
  "chart_title": "Short descriptive title",
  "chart_type": "bar" or "line",
  "labels": ["Label1","Label2","Label3","Label4","Label5"],
  "values": [number1, number2, number3, number4, number5],
  "unit": "% or $B or number",
  "y_axis_label": "Y axis label",
  "sources": [
    {"name": "Real Source Name", "year": 2024, "url": "https://real-url.com"},
    {"name": "Real Source Name 2", "year": 2023, "url": "https://real-url2.com"}
  ]
}

Use REAL plausible data. Sources must be real organizations (World Bank, IMF, McKinsey, Deloitte, etc.)`;

    const result = await callAI(chartPrompt, true, 'auto', 1000);
    if (result.error) return null;

    const parsed = (text => {
      try {
        const s = text.indexOf('{'), e = text.lastIndexOf('}');
        return s !== -1 ? JSON.parse(text.substring(s, e+1)) : null;
      } catch { return null; }
    })(result.text || '');

    if (!parsed?.labels?.length || !parsed?.values?.length) return null;

    const chartId  = 'chart-' + sectionIndex + '-' + Date.now();
    const type     = parsed.chart_type === 'line' ? 'line' : 'bar';

    // Multi-color palette for 3D bars
    const palette  = ['#c9a84c','#3b82f6','#22c55e','#a855f7','#f97316','#06b6d4'];
    const bgColors = parsed.values.map((_, i) => palette[i % palette.length] + 'cc');
    const brColors = parsed.values.map((_, i) => palette[i % palette.length]);

    const sourcesHTML = (parsed.sources || []).map(s =>
      `<span style="margin-right:12px">` +
      (s.url ? `<a href="${s.url}" target="_blank" rel="noopener" style="color:var(--gold);text-decoration:none">${s.name}</a>` : s.name) +
      (s.year ? ` (${s.year})` : '') +
      `</span>`
    ).join('');

    // Serialize data for inline script
    const labelsStr  = JSON.stringify(parsed.labels);
    const valuesStr  = JSON.stringify(parsed.values);
    const bgStr      = JSON.stringify(bgColors);
    const brStr      = JSON.stringify(brColors);
    const yLabelStr  = JSON.stringify(parsed.y_axis_label || parsed.unit || '');
    const unitStr    = parsed.unit || '';

    return `
<figure style="margin:2rem 0;background:var(--navy2);border:1px solid var(--border);border-radius:6px;padding:1.2rem;overflow:hidden">
  <div style="font-size:0.82rem;font-weight:700;color:var(--cream);margin-bottom:0.8rem;text-align:center">${parsed.chart_title}</div>
  <canvas id="${chartId}" style="max-height:300px;width:100%"></canvas>
  <div style="margin-top:0.8rem;padding-top:0.6rem;border-top:1px solid var(--border);font-size:0.68rem;color:var(--muted);line-height:1.8">
    <span style="font-weight:600;color:var(--muted);letter-spacing:0.06em;margin-right:6px;text-transform:uppercase;font-size:0.6rem">Sources</span>
    ${sourcesHTML || '<em>Industry data compilation</em>'}
  </div>
</figure>
<script>
(function(){
  function render(){
    var el=document.getElementById('${chartId}');
    if(!el||typeof Chart==='undefined'){setTimeout(render,700);return;}
    if(el._done)return; el._done=true;
    var has3d=Chart.controllers&&Chart.controllers.bar3D;
    var t=has3d?'bar3D':'${type}';
    new Chart(el.getContext('2d'),{
      type:t,
      data:{
        labels:${labelsStr},
        datasets:[{
          label:${yLabelStr},
          data:${valuesStr},
          backgroundColor:${bgStr},
          borderColor:${brStr},
          borderWidth:2,
          borderRadius:has3d?0:6,
          fill:false,tension:0.4,
          pointBackgroundColor:'#c9a84c',
          pointRadius:5
        }]
      },
      options:{
        responsive:true,
        plugins:{
          legend:{labels:{color:'#8896b3',font:{size:11}}},
          tooltip:{callbacks:{label:function(c){return ' '+c.parsed.y+' ${unitStr}';}}}
        },
        scales:{
          x:{ticks:{color:'#8896b3',font:{size:10}},grid:{color:'rgba(255,255,255,0.04)'}},
          y:{ticks:{color:'#8896b3',font:{size:10}},grid:{color:'rgba(255,255,255,0.04)'},
             title:{display:true,text:${yLabelStr},color:'#8896b3',font:{size:10}}}
        }
      }
    });
  }
  render();
})();
</script>`;
  } catch(e) {
    console.warn('Chart generation failed:', e.message);
    return null;
  }
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
  resetModelPool(); // reset round-robin for this generation

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

      // Use round-robin model pool — each section gets a different model
      const poolModel = getNextPoolModel();
      timerLog(`[${index+1}] Using: ${poolModel.split('/').pop()}`);
      let result = await callAIWithModel(buildSectionPrompt(section, index), poolModel, maxTokPerSection);
      if (result.error) {
        await new Promise(r => setTimeout(r, 1000));
        // Fallback to normal chain if pool model failed
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

      // Every 3rd completed section, inject an AI-generated chart
      if (completedCount % 3 === 0 && completedCount < totalSections) {
        generateChartForSection(section, topic, category, index).then(chartHTML => {
          if (chartHTML && sectionResults[index]) {
            sectionResults[index] = (sectionResults[index] || '') + chartHTML;
          }
        });
      }

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
