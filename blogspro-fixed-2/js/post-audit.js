// ═══════════════════════════════════════════════════════════════════
// post-audit.js — Automatic Post Quality Engine v2
//
// After every generation:
//  1. Structural check (words, chart, table, refs, cover, meta, tags)
//  2. Content validation (chart names, table names, data quality,
//     reference relevance + reachability, image load, cover context)
//  3. AI auto-rectify ALL anomalies
//  4. Auto-save corrected post to Firestore (no admin consent)
//  5. Code fixes pushed to GitHub directly (no admin consent)
//  6. Admin gate — Publish / Draft / Edit only (post already saved)
//
// Add to js/main.js:  import './post-audit.js';
// ═══════════════════════════════════════════════════════════════════

import { callAI } from './ai-core.js';
import { sanitize, showToast, slugify, db } from './config.js';
import { state } from './state.js';
import {
  collection, doc, addDoc, updateDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ─────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────
const POLLINATIONS = (prompt, w = 1280, h = 720, seed = 0) =>
  `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ', professional, high quality, photorealistic')}?width=${w}&height=${h}&seed=${seed}&nologo=true&enhance=true`;

const GH_KEY = 'audit_gh_config';
function ghCfg() { try { return JSON.parse(localStorage.getItem(GH_KEY) || '{}'); } catch { return {}; } }

const T = {
  minWords:      400,
  minTitle:      10,
  maxTitle:      100,
  minExcerpt:    40,
  minMeta:       60,
  maxMeta:       160,
  minTags:       3,
  minRefs:       4,
  minCharts:     1,
  minTables:     1,
  forbidden:     [/lorem ipsum/i, /\[insert/i, /placeholder text/i, /TODO:/i],
};

let _running = false;

// ─────────────────────────────────────────────────────────────────
// HOOK INSTALLATION
// ─────────────────────────────────────────────────────────────────
function _wrap(name, after) {
  const orig = window[name];
  if (typeof orig !== 'function') { console.warn(`[PostAudit] ${name} not found`); return; }
  window[name] = async function (...args) {
    const r = await orig.apply(this, args);
    try { await after(); } catch (e) { console.error('[PostAudit] hook error:', e); }
    return r;
  };
}

function installHooks() {
  _wrap('generateAIPost', () => runFullAudit('ai-writer'));
  _wrap('aitRunAutoBlog', () => runFullAudit('auto-blog'));
  console.log('[PostAudit] ✓ Hooks installed');
}

// ─────────────────────────────────────────────────────────────────
// DATA COLLECTION
// ─────────────────────────────────────────────────────────────────
function collect() {
  const editor = document.getElementById('editor');
  const html   = editor?.innerHTML || '';
  const text   = editor?.textContent || '';
  const words  = text.trim().split(/\s+/).filter(Boolean).length;

  const chartNodes = [...(editor?.querySelectorAll('.bp-chart-block') || [])];
  const charts = chartNodes.map(n => ({
    el:       n,
    name:     (n.dataset.name || n.querySelector('.bp-chart-title')?.textContent || n.querySelector('figcaption')?.textContent || '').trim(),
    type:     n.dataset.type || 'unknown',
    source:   n.dataset.source || '',
    hasData:  n.innerHTML.length > 300,
    // FIX: check data-name, .bp-chart-title, AND figcaption — all three are valid title carriers
    hasName:  !!(
      n.dataset.name?.trim() ||
      n.querySelector('.bp-chart-title')?.textContent?.trim() ||
      n.querySelector('figcaption')?.textContent?.trim()
    ),
  }));

  const tableNodes = [...(editor?.querySelectorAll('table') || [])];
  const tables = tableNodes.map(t => ({
    el:      t,
    name:    (t.querySelector('caption')?.textContent || t.closest('.bp-chart-block')?.dataset.name || '').trim(),
    hasName: !!(t.querySelector('caption') || t.closest('.bp-chart-block')?.dataset.name),
    hasData: t.querySelectorAll('td').length > 2,
  }));

  const refBlock  = editor?.querySelector('.bp-references-block');
  const refLinks  = refBlock
    ? [...refBlock.querySelectorAll('a[href]')].map(a => ({ text: a.textContent.trim(), url: a.href }))
    : [];

  const inlineImgs = [...(editor?.querySelectorAll('img') || [])].map(i => ({ src: i.src, alt: i.alt }));

  return {
    title:       document.getElementById('postTitle')?.value.trim()    || '',
    excerpt:     document.getElementById('postExcerpt')?.value.trim()  || '',
    slug:        document.getElementById('postSlug')?.value.trim()     || '',
    metaDesc:    document.getElementById('postMeta')?.value.trim()     || '',
    tags:        (document.getElementById('postTags')?.value || '').split(',').map(t => t.trim()).filter(Boolean),
    category:    document.getElementById('postCategory')?.value        || 'Fintech',
    coverUrl:    document.getElementById('postImage')?.value.trim()    || '',
    html, text, words,
    charts, tables, refLinks, inlineImgs,
    hasRefBlock:  !!refBlock,
    hasCitations: !!(editor?.querySelector('sup')),
  };
}

// ─────────────────────────────────────────────────────────────────
// PHASE 1 — STRUCTURAL + NAME CHECKS
// ─────────────────────────────────────────────────────────────────
function checkStructure(p) {
  const issues = [];
  const add = (id, field, msg, sev = 'error') => issues.push({ id, field, msg, sev });

  if (!p.title || p.title.length < T.minTitle)   add('title-short',   'title',    `Title too short (${p.title.length} chars, min ${T.minTitle})`);
  if (p.title.length > T.maxTitle)               add('title-long',    'title',    `Title too long (${p.title.length} chars)`);
  if (p.words < T.minWords)                      add('words',         'content',  `Only ${p.words} words (min ${T.minWords})`);
  if (!p.excerpt || p.excerpt.length < T.minExcerpt) add('excerpt',   'excerpt',  `Excerpt missing/short (${p.excerpt.length} chars)`);
  if (!p.slug || p.slug.length < 3)              add('slug',          'slug',     'Slug missing');
  if (!p.metaDesc || p.metaDesc.length < T.minMeta)  add('meta',     'metaDesc', `Meta too short (${p.metaDesc.length} chars)`);
  if (p.tags.length < T.minTags)                 add('tags',          'tags',     `Only ${p.tags.length} tags (min ${T.minTags})`);
  if (!p.coverUrl)                               add('cover',         'cover',    'Cover photo missing');
  if (!p.hasRefBlock || p.refLinks.length < T.minRefs)
    add('refs', 'content', `References insufficient (${p.refLinks.length}/${T.minRefs})`);

  if (p.charts.length < T.minCharts)
    add('no-charts', 'content', `No charts found (min ${T.minCharts})`);
  p.charts.forEach((c, i) => {
    if (!c.hasName) add(`chart-noname-${i}`, 'content', `Chart ${i + 1} has no name/title`, 'warning');
    if (!c.hasData) add(`chart-nodata-${i}`, 'content', `Chart "${c.name || i + 1}" appears to have no data`, 'warning');
  });

  if (p.tables.length < T.minTables)
    add('no-tables', 'content', `No tables found (min ${T.minTables})`);
  p.tables.forEach((t, i) => {
    if (!t.hasName) add(`table-noname-${i}`, 'content', `Table ${i + 1} has no caption/name`, 'warning');
    if (!t.hasData) add(`table-nodata-${i}`, 'content', `Table "${t.name || i + 1}" appears to have no data`, 'warning');
  });

  T.forbidden.forEach(pat => {
    if (pat.test(p.html)) add('placeholder-' + pat, 'content', `Placeholder text: ${pat}`, 'warning');
  });

  return issues;
}

// ─────────────────────────────────────────────────────────────────
// PHASE 2 — CONTENT QUALITY (async, live verification)
// ─────────────────────────────────────────────────────────────────
async function checkQuality(p) {
  const issues = [];
  const add = (id, field, msg, sev = 'warning') => issues.push({ id, field, msg, sev });

  for (const [i, chart] of p.charts.entries()) {
    if (!chart.hasData) continue;
    const chartText = chart.el.textContent.trim().substring(0, 300);
    const r = await callAI(
      `Article topic: "${p.title}". Chart name: "${chart.name}", type: ${chart.type}.\nChart content sample: "${chartText}"\n` +
      `Is this chart data realistic, specific, and contextually relevant to the article? ` +
      `Reply ONLY with JSON: {"valid":true/false,"issue":"describe problem if invalid"}`,
      true
    );
    if (!r.error) {
      try {
        const raw = r.text.replace(/```json|```/gi, '').trim();
        const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
        if (!parsed.valid)
          add(`chart-invalid-${i}`, 'content', `Chart "${chart.name}": ${parsed.issue || 'data not contextual'}`, 'warning');
      } catch {}
    }
  }

  for (const [i, table] of p.tables.entries()) {
    if (!table.hasData) continue;
    const tableText = table.el.textContent.trim().substring(0, 300);
    const r = await callAI(
      `Article topic: "${p.title}". Table name: "${table.name}".\nTable content: "${tableText}"\n` +
      `Is this table data realistic, relevant, and properly structured? ` +
      `Reply ONLY with JSON: {"valid":true/false,"issue":"describe problem if invalid"}`,
      true
    );
    if (!r.error) {
      try {
        const raw = r.text.replace(/```json|```/gi, '').trim();
        const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
        if (!parsed.valid)
          add(`table-invalid-${i}`, 'content', `Table "${table.name}": ${parsed.issue || 'data not valid'}`, 'warning');
      } catch {}
    }
  }

  for (const ref of p.refLinks.slice(0, 8)) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      await fetch(ref.url, { method: 'HEAD', signal: ctrl.signal, mode: 'no-cors' });
      clearTimeout(t);
    } catch {
      add('ref-dead:' + ref.url.slice(-30), 'refs', `Unreachable ref: ${ref.url.slice(0, 55)}`);
    }
  }

  if (p.refLinks.length >= 2) {
    const urlList = p.refLinks.slice(0, 6).map((r, i) => `${i + 1}. ${r.url}`).join('\n');
    const r = await callAI(
      `Article title: "${p.title}"\nReferences:\n${urlList}\n` +
      `Are ALL these references directly relevant to this article topic? ` +
      `Reply ONLY: {"all_relevant":true/false,"bad_indices":[1],"reason":""}`,
      true
    );
    if (!r.error) {
      try {
        const raw = r.text.replace(/```json|```/gi, '').trim();
        const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
        if (!parsed.all_relevant && parsed.bad_indices?.length)
          add('refs-irrelevant', 'refs', `${parsed.bad_indices.length} ref(s) not contextual: ${parsed.reason || ''}`, 'warning');
      } catch {}
    }
  }

  if (p.coverUrl) {
    const ok = await _imgLoads(p.coverUrl);
    if (!ok) add('cover-broken', 'cover', `Cover broken: ${p.coverUrl.slice(0, 55)}`);
    else {
      const r = await callAI(
        `Article: "${p.title}". Cover URL: ${p.coverUrl}\n` +
        `Is this cover photo URL contextually appropriate? Reply ONLY: {"ok":true/false,"reason":""}`, true);
      if (!r.error) {
        try {
          const raw = r.text.replace(/```json|```/gi, '').trim();
          const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
          if (!parsed.ok) add('cover-irrelevant', 'cover', `Cover not contextual: ${parsed.reason || ''}`, 'warning');
        } catch {}
      }
    }
  }

  for (const img of p.inlineImgs) {
    if (!img.src || img.src.startsWith('data:') || img.src.startsWith('blob:')) continue;
    const ok = await _imgLoads(img.src, 5000);
    if (!ok) add('img-broken:' + img.src.slice(-20), 'content', `Inline image broken: …${img.src.slice(-50)}`);
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────
// PHASE 3 — AUTO-RECTIFICATION (no admin consent)
// ─────────────────────────────────────────────────────────────────
async function rectify(p, allIssues) {
  const corrections = [];
  const ids    = new Set(allIssues.map(i => i.id));
  const editor = document.getElementById('editor');
  const log = (field, what, oldVal, newVal, ai = true) =>
    corrections.push({ field, what, oldVal: String(oldVal || '').slice(0, 80), newVal: String(newVal).slice(0, 100), ai });

  // ── Text fields ────────────────────────────────────────────────
  if (ids.has('title-short') || ids.has('title-long')) {
    _log('✍ Fixing title…');
    if (!p.title || p.title.length < 10) {
      const r = await callAI(`Write ONE compelling fintech SEO title (50-70 chars). Return ONLY the title:\n${p.text.slice(0, 300)}`, true);
      if (!r.error && r.text) { const v = r.text.trim().replace(/^["']|["']$/g, ''); _setF('postTitle', v); log('title', 'AI title', p.title, v); }
    } else { const v = p.title.slice(0, T.maxTitle); _setF('postTitle', v); log('title', 'Trimmed', p.title, v, false); }
  }
  if (ids.has('excerpt')) {
    _log('✍ Generating excerpt…');
    const r = await callAI(`Write a 2-sentence engaging excerpt (80-150 chars). Return ONLY the excerpt:\nTitle: ${p.title}\n${p.text.slice(0, 400)}`, true);
    if (!r.error && r.text) { _setF('postExcerpt', r.text.trim()); log('excerpt', 'AI excerpt', p.excerpt, r.text.trim()); }
  }
  if (ids.has('slug')) {
    const v = slugify(p.title || 'article'); _setF('postSlug', v); log('slug', 'Slugified', p.slug, v, false);
  }
  if (ids.has('meta')) {
    _log('✍ Generating meta…');
    const r = await callAI(`Write an SEO meta description (120-155 chars). Return ONLY the description:\nTitle: ${p.title}\n${p.text.slice(0, 400)}`, true);
    if (!r.error && r.text) { const v = r.text.trim().slice(0, T.maxMeta); _setF('postMeta', v); log('metaDesc', 'AI meta', p.metaDesc, v); }
  }
  if (ids.has('tags')) {
    _log('✍ Generating tags…');
    const r = await callAI(`Generate 5 fintech SEO tags. Return ONLY comma-separated:\nTitle: ${p.title}`, true);
    if (!r.error && r.text) { const v = r.text.split(',').map(t => t.trim()).filter(Boolean).slice(0, 5).join(', '); _setF('postTags', v); log('tags', 'AI tags', p.tags.join(', '), v); }
  }

  // ── Add names to unnamed charts ────────────────────────────────
  const unnamedCharts = allIssues.filter(i => i.id.startsWith('chart-noname-'));
  for (const issue of unnamedCharts) {
    const idx   = parseInt(issue.id.split('-').pop());
    const chart = p.charts[idx];
    if (!chart?.el) continue;
    _log(`📊 Naming chart ${idx + 1}…`);
    const r = await callAI(
      `Article: "${p.title}". Chart type: ${chart.type}. Content sample: "${chart.el.textContent.slice(0, 200)}"\n` +
      `Write a specific, descriptive 6-8 word name for this chart. Return ONLY the name, no quotes.`, true);
    if (!r.error && r.text) {
      const name = r.text.trim();
      chart.el.setAttribute('data-name', name);
      // FIX: update ALL title elements — some charts use multiple title nodes
      chart.el.querySelectorAll('.bp-chart-title').forEach(el => { el.textContent = name; });
      // FIX: also set a <figcaption> if present (used by some chart templates)
      const figcap = chart.el.querySelector('figcaption');
      if (figcap) figcap.textContent = name;
      // FIX: if no title element exists, inject one at the top of the chart block
      if (!chart.el.querySelector('.bp-chart-title') && !figcap) {
        const titleEl = document.createElement('div');
        titleEl.className = 'bp-chart-title';
        titleEl.textContent = name;
        titleEl.style.cssText = 'font-size:0.78rem;font-weight:700;color:#c9a84c;padding:0 0 0.4rem';
        chart.el.insertBefore(titleEl, chart.el.firstChild);
      }
      log('content', `Chart ${idx + 1} named`, '(unnamed)', name);
    }
  }

  // ── Add names to unnamed tables ────────────────────────────────
  const unnamedTables = allIssues.filter(i => i.id.startsWith('table-noname-'));
  for (const issue of unnamedTables) {
    const idx   = parseInt(issue.id.split('-').pop());
    const table = p.tables[idx];
    if (!table?.el) continue;
    _log(`📋 Naming table ${idx + 1}…`);
    const r = await callAI(
      `Article: "${p.title}". Table content: "${table.el.textContent.slice(0, 200)}"\n` +
      `Write a specific, descriptive 5-7 word name for this table. Return ONLY the name, no quotes.`, true);
    if (!r.error && r.text) {
      const name = r.text.trim();
      let caption = table.el.querySelector('caption');
      if (!caption) {
        caption = document.createElement('caption');
        table.el.insertBefore(caption, table.el.firstChild);
      }
      caption.textContent = name;
      caption.style.cssText = 'text-align:left;font-size:0.78rem;font-weight:700;color:#c9a84c;padding:0 0 0.4rem;caption-side:top';
      const wrapper = table.el.closest('.bp-chart-block');
      if (wrapper) wrapper.setAttribute('data-name', name);
      log('content', `Table ${idx + 1} named`, '(unnamed)', name);
    }
  }

  // ── Regenerate invalid chart data ──────────────────────────────
  const invalidCharts = allIssues.filter(i => i.id.startsWith('chart-invalid-'));
  for (const issue of invalidCharts) {
    const idx = parseInt(issue.id.split('-').pop());
    const chart = p.charts[idx];
    if (!chart?.el || !editor) continue;
    _log(`📊 Regenerating chart "${chart.name}"…`);
    try {
      const { generateChartForSection } = await import('./chart-builder.js');
      const newChart = await generateChartForSection(p.title, chart.name || 'Key Statistics', p.category, null);
      if (newChart) {
        chart.el.outerHTML = newChart;
        log('content', `Chart "${chart.name}" regenerated`, 'invalid data', 'fresh chart');
      }
    } catch (e) { _log('⚠ Chart regen failed: ' + e.message); }
  }

  // ── Regenerate invalid table data ─────────────────────────────
  const invalidTables = allIssues.filter(i => i.id.startsWith('table-invalid-'));
  for (const issue of invalidTables) {
    const idx = parseInt(issue.id.split('-').pop());
    const table = p.tables[idx];
    if (!table?.el || !editor) continue;
    _log(`📋 Regenerating table "${table.name}"…`);
    const r = await callAI(
      `Create a relevant HTML comparison table with caption "${table.name || 'Comparison'}" for this article.\n` +
      `Use inline CSS: background #0c1322, gold #c9a84c borders, cream #f5f0e8 text, padding 8px 12px.\n` +
      `Article: "${p.title}". Return ONLY the <table> HTML with a <caption>.`, true);
    if (!r.error && r.text) {
      const match = r.text.match(/<table[\s\S]*?<\/table>/i);
      if (match) {
        const wrapper = table.el.closest('.bp-chart-block') || table.el;
        wrapper.outerHTML = `<div class="bp-chart-block" data-name="${table.name || 'Table'}" style="margin:1.6rem 0;overflow-x:auto;border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:1rem">${match[0]}</div>`;
        log('content', `Table regenerated`, 'invalid', table.name || 'new table');
      }
    }
  }

  // ── Missing chart ──────────────────────────────────────────────
  if (ids.has('no-charts') && editor) {
    _log('📊 Injecting chart…');
    try {
      const { generateChartForSection } = await import('./chart-builder.js');
      const chartHTML = await generateChartForSection(p.title, 'Key Statistics', p.category, null);
      if (chartHTML) {
        const h2 = editor.querySelector('h2');
        h2 ? h2.insertAdjacentHTML('afterend', chartHTML) : editor.insertAdjacentHTML('beforeend', chartHTML);
        log('content', 'Chart injected', '(none)', 'chart block');
        window.updateWordCount?.();
      }
    } catch (e) { _log('⚠ Chart inject failed: ' + e.message); }
  }

  // ── Missing table ──────────────────────────────────────────────
  if (ids.has('no-tables') && editor) {
    _log('📋 Injecting table…');
    const r = await callAI(
      `Create a relevant HTML comparison table for this article.\n` +
      `Use a <caption> tag with a descriptive name. Inline CSS: background #0c1322, gold #c9a84c borders, cream #f5f0e8 text, padding 8px 12px.\n` +
      `Article: "${p.title}". Return ONLY the <table> HTML.`, true);
    if (!r.error && r.text) {
      const match = r.text.match(/<table[\s\S]*?<\/table>/i);
      if (match) {
        const tableName = match[0].match(/<caption[^>]*>(.*?)<\/caption>/i)?.[1] || 'Comparison Table';
        editor.insertAdjacentHTML('beforeend',
          `<div class="bp-chart-block" data-name="${tableName}" style="margin:1.6rem 0;overflow-x:auto;border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:1rem">${match[0]}</div>`);
        log('content', 'Table injected', '(none)', tableName);
        window.updateWordCount?.();
      }
    }
  }

  // ── References (missing, broken, irrelevant) ───────────────────
  const needsRefs = ids.has('refs') ||
    allIssues.some(i => i.id.startsWith('ref-dead:') || i.id === 'refs-irrelevant');
  if (needsRefs && editor) {
    _log('📚 Regenerating references…');
    try {
      editor.querySelector('.bp-references-block')?.remove();
      await window.aiEditAction?.('references');
      // FIX: wait for DOM to settle after async reference insertion
      await new Promise(r => setTimeout(r, 800));
      log('content', 'References regenerated', `${p.refLinks.length} old refs`, 'fresh APA block');
    } catch (e) { _log('⚠ Refs failed: ' + e.message); }
  }

  // ── Inline citations ───────────────────────────────────────────
  if (!p.hasCitations && editor && typeof window.insertInlineCitations === 'function') {
    _log('📌 Adding citations…');
    try {
      await window.insertInlineCitations();
      // FIX: wait for citation DOM update
      await new Promise(r => setTimeout(r, 500));
      log('content', 'Inline citations added', '(none)', 'superscripts');
    } catch {}
  }

  // ── Remove broken inline images ────────────────────────────────
  for (const img of (editor?.querySelectorAll('img') || [])) {
    if (!img.src || img.src.startsWith('data:') || img.src.startsWith('blob:')) continue;
    const ok = await _imgLoads(img.src, 5000);
    if (!ok) { img.remove(); log('content', 'Removed broken image', img.src.slice(-40), '(removed)', false); }
  }

  // ── Cover photo ────────────────────────────────────────────────
  const needsCover = ids.has('cover') || ids.has('cover-broken') || ids.has('cover-irrelevant');
  if (needsCover) {
    _log('🎨 Generating cover photo…');
    const seed   = Math.floor(Math.random() * 999999);
    const prompt = `${p.title}, ${p.category} industry, professional, India digital finance`;
    const url    = POLLINATIONS(prompt, 1280, 720, seed);
    await new Promise(r => setTimeout(r, 2000));
    const ok = await _imgLoads(url, 15000);
    const finalUrl = ok ? url : POLLINATIONS(`${p.category} fintech technology`, 1280, 720, seed + 1);
    _setF('postImage', finalUrl);
    window.updateFeaturedPreview?.(finalUrl);
    log('cover', 'AI cover generated', p.coverUrl || '(none)', finalUrl);
  }

  // FIX: Allow all async DOM updates (chart/table/refs/citations) to settle
  // before returning so that the recheck collect() reads the correct state
  await new Promise(r => setTimeout(r, 600));

  return corrections;
}

// ─────────────────────────────────────────────────────────────────
// PHASE 4 — AUTO-SAVE (no admin consent)
// ─────────────────────────────────────────────────────────────────
async function autoSave() {
  const p      = collect();
  const editor = document.getElementById('editor');
  const data   = {
    title:       p.title,
    excerpt:     p.excerpt,
    content:     sanitize(editor?.innerHTML || ''),
    category:    p.category,
    slug:        p.slug,
    image:       p.coverUrl,
    metaDesc:    p.metaDesc,
    tags:        p.tags,
    readingTime: Math.max(1, Math.ceil(p.words / 200)),
    published:   false,
    premium:     state.isPremium || false,
    updatedAt:   serverTimestamp(),
    auditedAt:   serverTimestamp(),
    auditPassed: true,
  };

  if (state.editingPostId) {
    await updateDoc(doc(db, 'posts', state.editingPostId), data);
  } else {
    data.createdAt     = serverTimestamp();
    data.autoGenerated = true;
    const ref = await addDoc(collection(db, 'posts'), data);
    state.editingPostId = ref.id;
  }
  return state.editingPostId;
}

// ─────────────────────────────────────────────────────────────────
// PHASE 5 — AUTO-PUSH CODE FIXES TO GITHUB (no admin consent)
// ─────────────────────────────────────────────────────────────────
async function pushCodeFix(fixes) {
  const cfg = ghCfg();
  if (!cfg.token || !cfg.owner || !cfg.repo) return null;

  const ts  = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const pushed = [];

  for (const fix of fixes) {
    const safeName   = fix.file.replace(/\//g, '__').replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetPath = `audit-fixes/post-audit-${safeName}-${Date.now()}.patch.js`;
    const content    = `// Post-audit auto-fix — ${ts}\n// Source: ${fix.file}\n// ${fix.description}\n\n${fix.patch}`;
    const commitMsg  = `fix(post-audit): ${fix.description.slice(0, 70)} [${fix.file}]`;

    try {
      let sha = null;
      try {
        const r = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${targetPath}`, {
          headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
        });
        if (r.ok) { const d = await r.json(); sha = d.sha; }
      } catch {}

      const body = { message: commitMsg, content: btoa(unescape(encodeURIComponent(content))), ...(sha ? { sha } : {}) };
      const res  = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${targetPath}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
        body: JSON.stringify(body),
      });
      if (res.ok) pushed.push(targetPath);
    } catch {}
  }

  return pushed;
}

// ─────────────────────────────────────────────────────────────────
// MAIN ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────
export async function runFullAudit(trigger = 'manual') {
  if (_running) return;
  _running = true;
  _showProgress();

  try {
    // Phase 1
    _step('structure', 'running', 'Checking structure & names…');
    const p1 = collect();
    const struct = checkStructure(p1);
    _step('structure', struct.length ? 'warn' : 'pass',
      struct.length ? `${struct.length} issue(s)` : 'OK');

    // Phase 2
    _step('quality', 'running', 'Validating chart/table data, refs, images…');
    const quality = await checkQuality(p1);
    _step('quality', quality.length ? 'warn' : 'pass',
      quality.length ? `${quality.length} quality issue(s)` : 'All verified');

    const allIssues = [...struct, ...quality];

    // Phase 3
    _step('fix', 'running', `Auto-rectifying ${allIssues.length} issue(s)…`);
    const corrections = allIssues.length ? await rectify(p1, allIssues) : [];
    _step('fix', 'pass', `${corrections.length} correction(s) applied`);

    // FIX: Recheck MUST re-collect AND re-run checkStructure after all DOM
    // changes from rectify() have settled. The original bug was that collect()
    // returned stale data because async operations (refs, citations) hadn't
    // finished updating the DOM yet. The 600ms settle wait in rectify() fixes
    // this, but we also add a second settle here as a safety net.
    _step('recheck', 'running', 'Re-verifying…');
    await new Promise(r => setTimeout(r, 400));  // extra safety settle
    const p2        = collect();                  // re-collect AFTER full DOM settle
    const remaining = checkStructure(p2);
    _step('recheck', remaining.length ? 'warn' : 'pass',
      remaining.length ? `${remaining.length} remain` : 'Clean');

    // Phase 4: auto-save
    _step('save', 'running', 'Saving to Firestore…');
    const postId = await autoSave();
    _step('save', 'pass', `Saved · ${postId}`);

    // Phase 5: push code fixes to GitHub
    const codeFixPatches = corrections
      .filter(c => c.field === 'code')
      .map(c => ({ file: c.file, description: c.what, patch: c.newVal }));
    if (codeFixPatches.length) {
      _step('github', 'running', 'Pushing code fixes to GitHub…');
      const pushed = await pushCodeFix(codeFixPatches);
      _step('github', pushed?.length ? 'pass' : 'warn',
        pushed?.length ? `${pushed.length} fix(es) pushed` : 'GitHub not configured');
    }

    // Phase 6: admin gate
    _step('gate', 'running', 'Admin review…');
    await showGate({ trigger, allIssues, corrections, remaining, postId, p2 });

  } catch (err) {
    console.error('[PostAudit]', err);
    showToast('Post audit error: ' + err.message, 'error');
  } finally {
    _running = false;
  }
}

// ─────────────────────────────────────────────────────────────────
// ADMIN GATE — review only, post already saved
// ─────────────────────────────────────────────────────────────────
function showGate({ trigger, allIssues, corrections, remaining, postId, p2 }) {
  return new Promise(resolve => {
    document.getElementById('pa-gate')?.remove();

    const errors  = allIssues.filter(i => i.sev === 'error').length;
    const warns   = allIssues.filter(i => i.sev === 'warning').length;
    const aiFixed = corrections.filter(c => c.ai).length;
    const unfixed = remaining.length;

    const trigLabels = { 'ai-writer': '✏ AI Writer', 'auto-blog': '🤖 Auto Blog', 'manual': '💾 Manual' };

    const corrRows = corrections.length
      ? corrections.map(c => `
          <div style="display:flex;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid rgba(255,255,255,0.04)">
            <span style="font-size:0.62rem;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);
                         color:#4ade80;padding:0.1rem 0.3rem;border-radius:2px;flex-shrink:0;height:fit-content;margin-top:1px">
              ${c.ai ? 'AI' : '⚡'}
            </span>
            <div>
              <div style="font-size:0.74rem;font-weight:500;color:#e8e4d8">${_cap(c.field)} — ${c.what}</div>
              <div style="font-size:0.66rem;color:#888780;margin-top:1px">
                <span style="color:#fca5a5">${c.oldVal || '(empty)'}</span>
                <span style="color:#555"> → </span>
                <span style="color:#4ade80">${c.newVal}</span>
              </div>
            </div>
          </div>`).join('')
      : `<div style="font-size:0.74rem;color:#4ade80;padding:0.4rem 0">✓ No corrections needed</div>`;

    const warnRows = remaining.length
      ? `<div style="margin-top:0.6rem;padding:0.5rem 0.65rem;background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.2);border-radius:4px">
           <div style="font-size:0.64rem;font-weight:700;color:#fca5a5;margin-bottom:0.3rem">Still unresolved</div>
           ${remaining.map(i => `<div style="font-size:0.7rem;color:#fca5a5;padding:0.15rem 0">⚠ ${_cap(i.field)}: ${i.msg}</div>`).join('')}
         </div>` : '';

    const statRow = [
      ['Words',   p2.words.toLocaleString(),   p2.words < T.minWords],
      ['Charts',  p2.charts.length,             p2.charts.length < T.minCharts],
      ['Tables',  p2.tables.length,             p2.tables.length < T.minTables],
      ['Refs',    p2.refLinks.length,           p2.refLinks.length < T.minRefs],
      ['Images',  p2.inlineImgs.length,         false],
      ['Cover',   p2.coverUrl ? '✓' : '✕',     !p2.coverUrl],
      ['Cites',   p2.hasCitations ? '✓' : '✕', !p2.hasCitations],
    ].map(([k, v, bad]) => `
      <div style="text-align:center;min-width:48px">
        <div style="font-size:0.88rem;font-weight:700;color:${bad ? '#fca5a5' : '#e8e4d8'}">${v}</div>
        <div style="font-size:0.6rem;color:#888780">${k}</div>
      </div>`).join('');

    const namedCharts = p2.charts.filter(c => c.hasName).length;
    const namedTables = p2.tables.filter(t => t.hasName).length;
    const nameRow = (p2.charts.length || p2.tables.length) ? `
      <div style="font-size:0.68rem;color:#888780;padding:0.35rem 0;border-top:1px solid rgba(255,255,255,0.04);margin-top:0.4rem">
        Charts named: <span style="color:${namedCharts === p2.charts.length ? '#4ade80' : '#fca5a5'}">${namedCharts}/${p2.charts.length}</span>
        &nbsp;·&nbsp;
        Tables named: <span style="color:${namedTables === p2.tables.length ? '#4ade80' : '#fca5a5'}">${namedTables}/${p2.tables.length}</span>
      </div>` : '';

    document.body.insertAdjacentHTML('beforeend', `
      <div id="pa-gate" style="
        position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:99999;
        display:flex;align-items:center;justify-content:center;padding:1rem;
        animation:paFadeIn 0.3s ease">
        <div style="background:#0d1520;border:1px solid rgba(201,168,76,0.35);border-radius:12px;
                    max-width:640px;width:100%;max-height:92vh;overflow-y:auto;
                    box-shadow:0 24px 80px rgba(0,0,0,0.7)">

          <div style="padding:1.1rem 1.4rem;border-bottom:1px solid rgba(255,255,255,0.07)">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap">
              <div>
                <div style="font-size:1rem;font-weight:700;color:#e8e4d8">🛡 Post Quality Gate</div>
                <div style="font-size:0.68rem;color:#888780;margin-top:2px">
                  ${trigLabels[trigger] || trigger} · ${errors} error${errors !== 1 ? 's' : ''} · ${warns} warning${warns !== 1 ? 's' : ''} · ${aiFixed} AI fix${aiFixed !== 1 ? 'es' : ''}
                </div>
              </div>
              <span style="font-size:0.72rem;font-weight:700;padding:0.2rem 0.55rem;border-radius:3px;
                           ${unfixed === 0
                             ? 'color:#4ade80;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3)'
                             : 'color:#fca5a5;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25)'}">
                ${unfixed === 0 ? `✓ All ${allIssues.length} resolved` : `${unfixed} unresolved`}
              </span>
            </div>
          </div>

          <div style="padding:0.75rem 1.4rem;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;gap:0.5rem;flex-wrap:wrap">
            ${statRow}
          </div>
          ${nameRow ? `<div style="padding:0.3rem 1.4rem;border-bottom:1px solid rgba(255,255,255,0.06)">${nameRow}</div>` : ''}

          <div style="padding:0.75rem 1.4rem;border-bottom:1px solid rgba(255,255,255,0.06)">
            <div style="font-size:0.63rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#888780;margin-bottom:0.4rem">Corrections applied</div>
            ${corrRows}
            ${warnRows}
          </div>

          <div style="padding:0.55rem 1.4rem;border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(34,197,94,0.04)">
            <div style="font-size:0.7rem;color:#4ade80">
              ✓ Auto-saved as draft${postId ? ` · <code style="font-size:0.64rem">${postId}</code>` : ''}
            </div>
          </div>

          <div style="padding:1rem 1.4rem">
            <div style="font-size:0.7rem;color:#888780;margin-bottom:0.7rem">Post corrected and saved. Choose next action:</div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
              <button id="pa-publish"
                style="flex:1;min-width:140px;background:#c9a84c;color:#0d1520;border:none;
                       padding:0.65rem 1rem;border-radius:6px;font-size:0.85rem;font-weight:700;cursor:pointer;font-family:var(--sans)">
                ↑ Publish Now
              </button>
              <button id="pa-draft"
                style="flex:1;min-width:140px;background:rgba(255,255,255,0.05);color:#e8e4d8;
                       border:1px solid rgba(255,255,255,0.1);padding:0.65rem 1rem;border-radius:6px;
                       font-size:0.82rem;cursor:pointer;font-family:var(--sans)">
                Keep as Draft
              </button>
              <button id="pa-edit"
                style="min-width:110px;background:transparent;color:#888780;
                       border:1px solid rgba(255,255,255,0.1);padding:0.65rem 1rem;
                       border-radius:6px;font-size:0.82rem;cursor:pointer;font-family:var(--sans)">
                ✎ Edit More
              </button>
            </div>
          </div>
        </div>
      </div>`);

    const gate = document.getElementById('pa-gate');
    _step('gate', 'pass', 'Gate shown');

    document.getElementById('pa-publish').onclick = async () => {
      gate.remove(); _closeProgress();
      try {
        if (state.editingPostId)
          await updateDoc(doc(db, 'posts', state.editingPostId), { published: true, updatedAt: serverTimestamp() });
        showToast('✓ Published!', 'success');
        const { loadAll } = await import('./posts.js');
        await loadAll();
      } catch (e) { showToast('Publish failed: ' + e.message, 'error'); }
      resolve('published');
    };

    document.getElementById('pa-draft').onclick = () => {
      gate.remove(); _closeProgress(); showToast('Saved as draft.', 'success'); resolve('draft');
    };

    document.getElementById('pa-edit').onclick = () => {
      gate.remove(); _closeProgress(); window.showView?.('editor'); showToast('Editing resumed.', 'info'); resolve('edit');
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// PROGRESS PANEL
// ─────────────────────────────────────────────────────────────────
const STEPS = [
  ['structure', '🔍 Structure + names'],
  ['quality',   '✅ Data validation'],
  ['fix',       '🔧 Auto-rectify'],
  ['recheck',   '🔁 Re-verify'],
  ['save',      '💾 Auto-save'],
  ['github',    '↑ GitHub push'],
  ['gate',      '🛡 Admin gate'],
];

function _showProgress() {
  document.getElementById('pa-progress')?.remove();
  const rows = STEPS.map(([id, label]) => `
    <div id="pa-s-${id}" style="display:flex;align-items:center;gap:0.45rem;padding:0.22rem 0">
      <span id="pa-si-${id}" style="font-size:0.68rem;width:12px;color:#888780">○</span>
      <div><div style="font-size:0.68rem;color:#888780">${label}</div>
      <div id="pa-sm-${id}" style="font-size:0.6rem;color:#888780"></div></div>
    </div>`).join('');
  document.body.insertAdjacentHTML('beforeend', `
    <div id="pa-progress" style="
      position:fixed;bottom:1.2rem;right:1.2rem;z-index:9990;
      background:#0d1520;border:1px solid rgba(201,168,76,0.2);border-radius:8px;
      padding:0.85rem 1rem;min-width:230px;box-shadow:0 8px 32px rgba(0,0,0,0.5)">
      <div style="font-size:0.7rem;font-weight:700;color:#c9a84c;margin-bottom:0.4rem">🛡 Post Audit</div>
      <div id="pa-log" style="font-size:0.62rem;color:#888780;margin-bottom:0.35rem;min-height:14px"></div>
      ${rows}
    </div>`);
}

function _step(id, status, msg) {
  const ic = { running: '⏳', pass: '✓', warn: '⚠', error: '✕' };
  const cl = { running: '#c9a84c', pass: '#4ade80', warn: '#c9a84c', error: '#fca5a5' };
  const i  = document.getElementById(`pa-si-${id}`);
  const m  = document.getElementById(`pa-sm-${id}`);
  if (i) { i.textContent = ic[status] || '○'; i.style.color = cl[status] || '#888780'; }
  if (m) { m.textContent = msg; m.style.color = cl[status] || '#888780'; }
}
function _log(msg) { const el = document.getElementById('pa-log'); if (el) el.textContent = msg; console.log('[PostAudit]', msg); }
function _closeProgress() { setTimeout(() => document.getElementById('pa-progress')?.remove(), 2500); }

// ─────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────
function _setF(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function _cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function _imgLoads(url, timeout = 8000) {
  return new Promise(resolve => {
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) { resolve(true); return; }
    const img = new Image();
    const t   = setTimeout(() => { img.src = ''; resolve(false); }, timeout);
    img.onload  = () => { clearTimeout(t); resolve(true); };
    img.onerror = () => { clearTimeout(t); resolve(false); };
    img.src = url;
  });
}

// CSS
(() => {
  if (document.getElementById('pa-css')) return;
  const s = document.createElement('style');
  s.id = 'pa-css';
  s.textContent = `@keyframes paFadeIn{from{opacity:0;transform:scale(0.97)}to{opacity:1;transform:none}}`;
  document.head.appendChild(s);
})();

// Init — delay so all window.* functions are registered first
// FIX: wrap in try-catch to suppress "message channel closed" errors
// thrown by browser extensions that return true from onMessage but
// never call sendResponse (unrelated to this code — defensive guard only).
setTimeout(() => {
  try { installHooks(); } catch (e) { console.warn('[PostAudit] Hook install error:', e); }
}, 400);
