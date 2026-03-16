// ═══════════════════════════════════════════════
// ai-tools.js — Inline AI Tools suite (AIT cards)
// Fixes: status showing, English enforcement,
//        aitLoading works even when body is hidden,
//        aitOpenCluster exposed globally
// ═══════════════════════════════════════════════
import { callAI }    from './ai-core.js';
import { showToast, slugify, sanitize, db } from './config.js';
import { state }     from './state.js';
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const EN = 'Respond ONLY in English. No preamble, no reasoning. Return ONLY the JSON requested.';

// ── Helpers ───────────────────────────────────
function aitLoading(id, on) {
  // Open the body panel if it's hidden so status is visible
  const body = document.getElementById(`ait-${id}-body`);
  if (on && body && body.style.display === 'none') {
    body.style.display = 'block';
    const chev = document.getElementById(`ait-${id}-chev`);
    if (chev) chev.textContent = '▾';
  }
  const btn = body?.querySelector('.ait-run-btn');
  const sp  = document.getElementById(`sp-${id}`);
  if (btn) btn.disabled = on;
  if (sp)  sp.style.display = on ? 'inline-block' : 'none';
  // Show "running" status immediately
  if (on) aitShowResult(id, `<div style="color:var(--muted);font-size:0.75rem;display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:10px;height:10px;border:2px solid var(--gold);border-top-color:transparent;border-radius:50%;animation:spin 0.7s linear infinite"></span> Running…</div>`);
}

function aitShowResult(id, html) {
  const el = document.getElementById(`res-${id}`);
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = html;
}

function aitGetTopic() {
  return document.getElementById('postTitle')?.value.trim()
      || document.getElementById('v2TopicPrompt')?.value.trim()
      || document.getElementById('aiPrompt')?.value.trim()
      || 'fintech article';
}

function aitParse(text) {
  if (!text) return null;
  try {
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s !== -1 && e !== -1) return JSON.parse(text.substring(s, e + 1));
  } catch(_) {}
  return null;
}

window.toggleAIT = (id) => {
  const body = document.getElementById(`ait-${id}-body`);
  const chev = document.getElementById(`ait-${id}-chev`);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (chev) chev.textContent = open ? '▸' : '▾';
};

function aitOpenCluster(title) {
  window.showView?.('editor');
  window.clearEditor?.();
  const titleEl  = document.getElementById('postTitle');
  const slugEl   = document.getElementById('postSlug');
  const promptEl = document.getElementById('v2TopicPrompt') || document.getElementById('aiPrompt');
  if (titleEl)  titleEl.value  = title;
  if (slugEl)   slugEl.value   = slugify(title);
  if (promptEl) promptEl.value = title;
  showToast(`New post: "${title.substring(0, 40)}"`, 'success');
}
window.aitOpenCluster = aitOpenCluster; // expose globally for onclick handlers


// ── 2. Headline AI ────────────────────────────
window.aitRunHeadlines = async () => {
  const topic = aitGetTopic();
  const count = document.getElementById('ait-hl-count')?.value || 8;
  aitLoading('hl', true);
  const result = await callAI(
    `Generate ${count} high-CTR fintech blog headlines about: "${topic}". ${EN}
{"headlines":[{"title":"headline","score":0-100,"type":"how-to|listicle|question|stat|urgency"}]}`,
    true
  );
  aitLoading('hl', false);
  const parsed = aitParse(result.text);
  if (parsed?.headlines?.length) {
    const sorted = [...parsed.headlines].sort((a, b) => b.score - a.score);
    aitShowResult('hl', sorted.map(h => `
      <div class="ait-result-item" style="cursor:pointer" onclick="
        document.getElementById('postTitle').value=${JSON.stringify(h.title)};
        document.getElementById('postSlug').value=slugify(${JSON.stringify(h.title)});
        showToast('Headline applied!','success')">
        <div style="font-size:0.75rem;font-weight:700;color:var(--gold);flex-shrink:0;min-width:28px">${h.score}</div>
        <div><div class="ait-ri-text">${h.title}</div><div class="ait-ri-sub">${h.type || ''}</div></div>
      </div>`).join(''));
  } else {
    aitShowResult('hl', `<div style="color:#fca5a5">✕ ${result.error || 'No headlines returned'}</div>`);
  }
};


// ── 3. Traffic Predictor ─────────────────────
window.aitRunTraffic = async () => {
  const topic = aitGetTopic();
  const kw    = document.getElementById('ait-traffic-kw')?.value.trim() || topic;
  aitLoading('traffic', true);
  const result = await callAI(
    `Estimate monthly Google search traffic for: "${kw}" in fintech India niche. ${EN}
{"monthly_searches":"12,000","difficulty":45,"competition":"medium","cpc":"₹12","opportunity":"high|medium|low","trend":"growing|stable|declining"}`,
    true
  );
  aitLoading('traffic', false);
  const parsed = aitParse(result.text);
  if (parsed) {
    const oppColor = { high: 'var(--green)', medium: 'var(--gold)', low: 'var(--muted)' }[parsed.opportunity] || 'var(--muted)';
    const trendIcon = { growing: '📈', stable: '➡️', declining: '📉' }[parsed.trend] || '';
    aitShowResult('traffic', `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;margin-bottom:0.5rem">
        <div class="ait-metric"><div class="ait-metric-label">Monthly Searches</div><div class="ait-metric-value">${parsed.monthly_searches}</div></div>
        <div class="ait-metric"><div class="ait-metric-label">Difficulty</div><div class="ait-metric-value">${parsed.difficulty}/100</div></div>
        <div class="ait-metric"><div class="ait-metric-label">Competition</div><div class="ait-metric-value">${parsed.competition}</div></div>
        <div class="ait-metric"><div class="ait-metric-label">CPC</div><div class="ait-metric-value">${parsed.cpc || '—'}</div></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:0.72rem;font-weight:700;color:${oppColor}">Opportunity: ${(parsed.opportunity || '').toUpperCase()}</span>
        <span style="font-size:0.72rem;color:var(--muted)">${trendIcon} ${parsed.trend || ''}</span>
      </div>`);
  } else {
    aitShowResult('traffic', `<div style="color:#fca5a5">✕ ${result.error || 'Failed'}</div>`);
  }
};


// ── 4. Topic Clusters ────────────────────────
window.aitRunClusters = async () => {
  const topic = aitGetTopic();
  aitLoading('cluster', true);
  const result = await callAI(
    `Create 6 cluster topics for a fintech pillar article about: "${topic}". ${EN}
{"clusters":[{"title":"specific topic title","angle":"search intent in one sentence"}]}`,
    true
  );
  aitLoading('cluster', false);
  const parsed = aitParse(result.text);
  if (parsed?.clusters?.length) {
    aitShowResult('cluster', parsed.clusters.map(c => `
      <div class="ait-result-item" style="cursor:pointer" onclick="aitOpenCluster(${JSON.stringify(c.title || '')})">
        <div><div class="ait-ri-text">${c.title}</div><div class="ait-ri-sub">${c.angle || ''}</div></div>
      </div>`).join(''));
  } else {
    aitShowResult('cluster', `<div style="color:#fca5a5">✕ ${result.error || 'Failed'}</div>`);
  }
};


// ── 5. Content Calendar ──────────────────────
window.aitRunCalendar = async () => {
  const topic    = aitGetTopic();
  const category = document.getElementById('ait-cal-cat')?.value || 'Fintech';
  aitLoading('cal', true);
  const result = await callAI(
    `Plan 8 blog posts for a 30-day content calendar. Topic: "${topic}". Category: ${category}. ${EN}
{"posts":[{"day":1,"title":"post title","hook":"one sentence hook"},{"day":5,"title":"","hook":""},{"day":8,"title":"","hook":""},{"day":12,"title":"","hook":""},{"day":15,"title":"","hook":""},{"day":19,"title":"","hook":""},{"day":22,"title":"","hook":""},{"day":26,"title":"","hook":""}]}`,
    true
  );
  aitLoading('cal', false);
  const parsed = aitParse(result.text);
  if (parsed?.posts?.length) {
    aitShowResult('cal', parsed.posts.map(p => `
      <div class="ait-result-item" style="cursor:pointer" onclick="aitOpenCluster(${JSON.stringify(p.title || '')})">
        <div style="font-size:0.65rem;font-weight:700;color:var(--gold);flex-shrink:0;min-width:24px">D${p.day}</div>
        <div><div class="ait-ri-text">${p.title}</div><div class="ait-ri-sub">${p.hook || ''}</div></div>
      </div>`).join(''));
  } else {
    aitShowResult('cal', `<div style="color:#fca5a5">✕ ${result.error || 'Failed'}</div>`);
  }
};


// ── 6. Competitor Gap ────────────────────────
window.aitRunGap = async () => {
  const domain = document.getElementById('ait-gap-domain')?.value.trim();
  if (!domain) { showToast('Enter a competitor domain.', 'error'); return; }
  const topic = aitGetTopic();
  aitLoading('gap', true);
  const result = await callAI(
    `Find 8 SEO content gaps between blogspro.in and competitor (${domain}) for topic: "${topic}". ${EN}
{"gaps":[{"title":"missing content topic","priority":"high|medium|low","reason":"why this matters for SEO"}]}`,
    true
  );
  aitLoading('gap', false);
  const parsed = aitParse(result.text);
  if (parsed?.gaps?.length) {
    const pColor = { high: '#fca5a5', medium: 'var(--gold)', low: 'var(--muted)' };
    aitShowResult('gap', parsed.gaps.map(g => `
      <div class="ait-result-item" style="cursor:pointer" onclick="aitOpenCluster(${JSON.stringify(g.title || '')})">
        <div style="font-size:0.62rem;font-weight:700;color:${pColor[g.priority] || 'var(--muted)'};flex-shrink:0;text-transform:uppercase;min-width:24px">${(g.priority || '').substring(0, 3)}</div>
        <div><div class="ait-ri-text">${g.title}</div><div class="ait-ri-sub">${g.reason || ''}</div></div>
      </div>`).join(''));
  } else {
    aitShowResult('gap', `<div style="color:#fca5a5">✕ ${result.error || 'Failed'}</div>`);
  }
};


// ── 7. Backlink Finder ───────────────────────
window.aitRunBacklinks = async () => {
  const topic = aitGetTopic();
  aitLoading('links', true);
  const result = await callAI(
    `Find 6 backlink outreach opportunities for a fintech blog post about: "${topic}". ${EN}
{"sites":[{"name":"site or publication name","type":"guest post|resource page|mention|interview","pitch":"one compelling sentence why they should link to you"}]}`,
    true
  );
  aitLoading('links', false);
  const parsed = aitParse(result.text);
  if (parsed?.sites?.length) {
    aitShowResult('links', parsed.sites.map(s => `
      <div style="padding:0.4rem 0;border-bottom:1px solid rgba(255,255,255,0.05)">
        <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.2rem">
          <span style="font-size:0.78rem;font-weight:600;color:var(--cream)">🔗 ${s.name}</span>
          <span style="font-size:0.6rem;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);color:#93c5fd;padding:0.1rem 0.3rem;border-radius:2px">${s.type || ''}</span>
        </div>
        <div style="font-size:0.72rem;color:var(--muted)">${s.pitch || ''}</div>
      </div>`).join(''));
  } else {
    aitShowResult('links', `<div style="color:#fca5a5">✕ ${result.error || 'Failed'}</div>`);
  }
};


// ── 8. Newsletter ────────────────────────────
window.aitRunNewsletter = async () => {
  const topic   = aitGetTopic();
  const style   = document.getElementById('ait-nl-style')?.value || 'roundup';
  const title   = document.getElementById('postTitle')?.value.trim() || topic;
  const excerpt = document.getElementById('postExcerpt')?.value.trim() || '';
  aitLoading('nl', true);
  const result = await callAI(
    `Write a ${style}-style newsletter email in English promoting this fintech blog post.
Post title: "${title}"${excerpt ? `\nExcerpt: "${excerpt}"` : ''}
Topic: ${topic}
Format: First line must be "Subject: <subject line>". Then 3-4 short paragraphs. Plain text, no HTML tags.`,
    true
  );
  aitLoading('nl', false);
  if (result.error) { aitShowResult('nl', `<div style="color:#fca5a5">✕ ${result.error}</div>`); return; }
  const lines    = (result.text || '').split('\n');
  const subjLine = lines.find(l => l.toLowerCase().startsWith('subject:')) || '';
  const body     = lines.filter(l => !l.toLowerCase().startsWith('subject:')).join('\n').trim();
  state.generatedNewsletter = body;
  aitShowResult('nl', `
    ${subjLine ? `<div style="margin-bottom:0.5rem;padding:0.4rem 0.6rem;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.2);border-radius:3px;font-size:0.72rem">
      <span style="color:var(--gold);font-weight:700">SUBJECT:</span>
      <span style="color:var(--cream)"> ${subjLine.replace(/^subject:\s*/i, '')}</span>
    </div>` : ''}
    <div style="font-size:0.75rem;color:var(--muted);white-space:pre-wrap;line-height:1.6">${body}</div>
    <div style="margin-top:0.6rem;display:flex;gap:0.4rem">
      <button onclick="navigator.clipboard.writeText(${JSON.stringify(body)}).then(()=>showToast('Copied!','success'))"
        style="flex:1;background:var(--navy2);border:1px solid var(--border);color:var(--muted);padding:0.4rem;border-radius:3px;font-family:var(--sans);font-size:0.72rem;cursor:pointer">
        📋 Copy
      </button>
      <button onclick="window.showView('newsletter');showToast('Opened Newsletter','success')"
        style="flex:1;background:var(--navy2);border:1px solid var(--border);color:var(--muted);padding:0.4rem;border-radius:3px;font-family:var(--sans);font-size:0.72rem;cursor:pointer">
        ✉ Full View →
      </button>
    </div>`);
  showToast('Newsletter generated!', 'success');
};


// ── 9. Auto Blog ─────────────────────────────
window.aitRunAutoBlog = async () => {
  const count    = parseInt(document.getElementById('ait-auto-count')?.value) || 2;
  const pub      = document.getElementById('ait-auto-pub')?.value === 'publish';
  const topic    = aitGetTopic();
  const category = document.getElementById('postCategory')?.value || 'Fintech';
  aitLoading('auto', true);
  aitShowResult('auto', `<div style="color:var(--muted);font-size:0.75rem">⏳ Generating ${count} post(s)…</div>`);

  let done = 0;
  let log  = '';
  const addLog = (msg, ok = true) => {
    log = `<div style="padding:0.2rem 0;font-size:0.72rem;color:${ok ? 'var(--green)' : '#fca5a5'}">${ok ? '✓' : '✕'} ${msg}</div>` + log;
    aitShowResult('auto', log);
  };

  for (let i = 0; i < count; i++) {
    addLog(`Generating post ${i + 1}/${count}…`, true);

    const topicR = await callAI(
      `Generate a specific, trending fintech article title about "${topic}" for ${category} — India market 2025. Return ONLY the title in English, nothing else.`,
      true
    );
    if (topicR.error) { addLog(`Post ${i + 1}: topic failed — ${topicR.error}`, false); continue; }

    const t = topicR.text.trim().replace(/^["']|["']$/g, '');
    addLog(`Writing: "${t.substring(0, 45)}…"`);

    const artR = await callAI(
      `Write a detailed 800-word fintech blog post in English only.
Title: "${t}"
Category: ${category}
Requirements: Use <h2><h3><p><strong><ul><li> tags. Start with <h2>. No <h1>, no markdown, no preamble.`,
      true, 'auto', 4000
    );
    if (artR.error) { addLog(`"${t.substring(0, 30)}" — write failed`, false); continue; }

    const metaR = await callAI(
      `For article: "${t}" — return ONLY JSON in English:\n{"summary":"2-sentence excerpt","tags":["t1","t2","t3"],"slug":"url-slug"}`,
      true
    );
    let meta = { summary: '', tags: [], slug: slugify(t) };
    if (!metaR.error) {
      const mp = aitParse(metaR.text);
      if (mp) meta = { ...meta, ...mp };
    }

    try {
      await addDoc(collection(db, 'posts'), {
        title: t,
        excerpt: meta.summary,
        content: sanitize(artR.text),
        category,
        slug: meta.slug || slugify(t),
        metaDesc: meta.summary,
        tags: meta.tags || [],
        image: '',
        readingTime: 4,
        published: pub,
        premium: false,
        autoGenerated: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      done++;
      state.abSessionTotal++;
      if (pub) state.abSessionPublished++;
      addLog(`"${t.substring(0, 40)}" — ${pub ? 'Published ✓' : 'Saved as draft ✓'}`);
    } catch(e) {
      addLog(`Save failed: ${e.message}`, false);
    }

    if (i < count - 1) await new Promise(r => setTimeout(r, 2500));
  }

  aitLoading('auto', false);
  showToast(`Auto Blog done! ${done} post(s) created.`, 'success');
  const { loadAll } = await import('./posts.js');
  await loadAll();
};
