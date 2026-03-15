// ═══════════════════════════════════════════════
// ai-writer.js — AI article generation
// ═══════════════════════════════════════════════
import { sanitize, showToast, slugify, stripTags } from './config.js';
import { callAI }    from './ai-core.js';
import { state }     from './state.js';
import { updateWordCount } from './editor.js';
import { openAIDrawer }    from './ai-drawer.js';

function closeAIModal() { document.getElementById('aiModal')?.classList.remove('open'); }

export async function generateAIPost() {
  if (state.isGeneratingAI) return;
  const topic = document.getElementById('aiPrompt').value.trim();
  if (!topic) { showToast('Please enter a topic.','error'); return; }

  state.isGeneratingAI = true;
  const btnAI = document.getElementById('btnAI');
  const btnTxt = document.getElementById('aiBtnText');
  const spinner = document.getElementById('aiSpinner');
  if (btnAI) btnAI.disabled = true;
  if (btnTxt) btnTxt.textContent = 'Generating outline…';
  if (spinner) spinner.style.display = 'inline-block';

  document.getElementById('aiModalTitle').textContent = '✦ Generating outline…';
  document.getElementById('aiModalSub').textContent   = 'AI is planning your article structure.';
  document.getElementById('aiModalContent').innerHTML = '<span style="animation:pulse 1s infinite;display:inline-block">Working…</span>';
  document.getElementById('aiModalActions').style.display = 'none';
  document.getElementById('aiModal').classList.add('open');

  const outResult = await callAI(
    `Create a concise article outline (5-7 bullet points) for:\nTopic: "${topic}"\nCategory: ${document.getElementById('postCategory').value}. Tone: ${document.getElementById('aiTone').value}.\nReturn ONLY plain text bullet points.`,
    true
  );

  if (outResult.error) {
    closeAIModal();
    document.getElementById('aiStatus').textContent = '✕ ' + outResult.error;
    showToast('AI Error: ' + outResult.error,'error');
    if (btnAI) btnAI.disabled = false;
    if (btnTxt) btnTxt.textContent = '✦ Generate Full Article';
    if (spinner) spinner.style.display = 'none';
    state.isGeneratingAI = false;
    return;
  }

  state.pendingOutline = outResult.text;
  document.getElementById('aiModalTitle').textContent   = '✦ Review Outline';
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
  const topic      = document.getElementById('aiPrompt').value.trim();
  const category   = document.getElementById('postCategory').value;
  const tone       = document.getElementById('aiTone').value;
  const modelArticle = document.getElementById('modelArticle').value;
  const results    = [];
  const allAttempts = [];
  const addR = (icon, label, model, ok) => results.push({icon,label,model,ok});

  document.getElementById('aiResultBox').style.display = 'none';
  document.getElementById('aiModalActions').style.display = 'none';
  document.getElementById('aiModalTitle').textContent = '✦ Writing article…';
  document.getElementById('aiModalSub').textContent   = 'Generating long-form content…';
  document.getElementById('aiModalContent').innerHTML = '<span style="animation:pulse 1s infinite;display:inline-block">Writing full article…</span>';
  document.getElementById('aiModal').classList.add('open');

  const artPrompt = `You are an expert fintech writer for BlogsPro (blogspro.in).\nWrite a comprehensive, long-form article about: "${topic}"\nCategory: ${category}. Tone: ${tone}.\nFollow this outline:\n${state.pendingOutline}\n\nRULES:\n- NEVER use <h1> tags\n- Start with a plain <p> introduction — NOT bold, NOT a heading\n- Use only: <h2> <h3> <p> <strong> <em> <ul> <li> <blockquote>\n- Do NOT wrap entire paragraphs in <strong>\n- Write in depth — NO word limit\n- Return ONLY clean HTML. No JSON, no metadata, no markdown.`;

  let artResult = await callAI(artPrompt, false, modelArticle, 4000);
  if (artResult.error) {
    document.getElementById('aiModalContent').innerHTML = '<span style="animation:pulse 1s infinite;display:inline-block">Retrying…</span>';
    await new Promise(r => setTimeout(r, 2000));
    artResult = await callAI(artPrompt, false, 'auto', 4000);
  }
  allAttempts.push(...(artResult.attemptsDetail||[]));

  if (artResult.error) {
    closeAIModal();
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

  const editor = document.getElementById('editor');
  editor.innerHTML = sanitize(articleHTML);
  updateWordCount();
  addR('✓', 'Article written', modelArticle, true);
  openAIDrawer('edit');

  // ── Metadata ──────────────────────────────────
  document.getElementById('aiModalTitle').textContent = '✦ Generating metadata…';
  document.getElementById('aiModalSub').textContent   = 'Title, summary, SEO, citations…';
  document.getElementById('aiModalContent').innerHTML = '<span style="animation:pulse 1s infinite;display:inline-block">Generating metadata…</span>';

  const metaPrompt = `Fintech article topic: "${topic}". Return ONLY valid JSON, no extra text.
IMPORTANT for citations: use REAL working URLs from rbi.org.in, sebi.gov.in, npci.org.in, worldbank.org, imf.org, bis.org, mckinsey.com, pwc.com, deloitte.com, kpmg.com, forbes.com, ft.com, bloomberg.com. Do NOT use example.com or placeholder URLs.
{"title":"SEO headline under 70 chars","summary":"2 sentences under 160 chars","metaDescription":"under 155 chars","tags":["tag1","tag2","tag3","tag4","tag5"],"citations":[{"apa":"Author, A. (Year). Real Title. Real Publisher.","url":"https://real-source.com/path"},{"apa":"Author, B. (Year). Real Title. Real Publisher.","url":"https://real-source.com/path"},{"apa":"Author, C. (Year). Real Title. Real Publisher.","url":"https://real-source.com/path"},{"apa":"Author, D. (Year). Real Title. Real Publisher.","url":"https://real-source.com/path"},{"apa":"Author, E. (Year). Real Title. Real Publisher.","url":"https://real-source.com/path"}]}`;

  let metaResult = await callAI(metaPrompt, true, modelArticle);
  if (metaResult.error) {
    await new Promise(r => setTimeout(r, 2000));
    metaResult = await callAI(metaPrompt, true, 'auto');
  }

  allAttempts.push(...(metaResult.attemptsDetail||[]));
  let parsed = null;
  const mt = metaResult.error ? '' : (metaResult.text||'');
  if (mt) {
    try { const s=mt.indexOf('{'),e=mt.lastIndexOf('}'); if(s!==-1&&e!==-1) parsed=JSON.parse(mt.substring(s,e+1)); } catch(_) {}
  }

  const checks = {};
  if (parsed) {
    if (parsed.title?.trim())           { document.getElementById('postTitle').value = stripTags(parsed.title.trim()); document.getElementById('postSlug').value = slugify(stripTags(parsed.title.trim())); checks.title=true; }
    if (parsed.summary?.trim())         { document.getElementById('postExcerpt').value = parsed.summary.trim(); checks.summary=true; }
    if (parsed.metaDescription?.trim()) { document.getElementById('postMeta').value = parsed.metaDescription.trim(); checks.meta=true; }
    if (parsed.tags?.length)            { document.getElementById('postTags').value = parsed.tags.join(', '); checks.tags=true; }
    if (parsed.citations?.length) {
      const citationItems = parsed.citations.map(c => {
        if (typeof c === 'object' && c.apa) {
          const apaText = c.apa.replace(/https?:\/\/[^\s]+/g,'').trim().replace(/\.?\s*$/,'');
          const url = c.url || (c.apa.match(/https?:\/\/[^\s]+/)||[])[0] || '';
          const isFake = !url || url.includes('example.com') || url.includes('real-source.com');
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
    document.getElementById('postTitle').value = topic.length<80 ? topic : topic.substring(0,75)+'…';
    document.getElementById('postSlug').value  = slugify(topic);
  }

  const metaFields = ['title','summary','tags','meta','citations'].filter(f=>checks[f]);
  addR(metaFields.length?'✓':'—', 'Metadata: '+(metaFields.join(', ')||'none'), '', metaFields.length>0);

  closeAIModal();

  // Show result in drawer
  document.getElementById('aiResultList').innerHTML = results.map(r =>
    `<div style="display:flex;align-items:flex-start;gap:0.5rem;font-size:0.78rem">
      <span style="color:${r.ok?'var(--green)':'var(--muted)'};flex-shrink:0;font-weight:700">${r.icon}</span>
      <span style="color:${r.ok?'var(--cream)':'var(--muted)'}">${r.label}</span>
    </div>`
  ).join('');
  document.getElementById('aiResultBox').style.display = 'block';
  document.getElementById('aiStatus').textContent = `✓ Complete`;
  showToast('Article generated!','success');
}
window.confirmOutline = confirmOutline;

window.cancelOutline = () => {
  document.getElementById('aiModal')?.classList.remove('open');
  state.pendingOutline = '';
};
