// ═══════════════════════════════════════════════
// posts.js — Post CRUD and dashboard data (Proxy-based)
// ═══════════════════════════════════════════════
import { api } from './services/api.js';
import { stripTags, slugify, showToast } from './config.js';
import { state } from './state.js';

const API_TIMEOUT_MS = 12000;

function formatViews(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n/1000000).toFixed(1).replace(/\.0$/,'') + 'M';
  if (n >= 1000)    return (n/1000).toFixed(1).replace(/\.0$/,'') + 'k';
  return String(n);
}

function checkIfAdmin() {
  const profile = state.currentUserProfile;
  const user = state.currentUser;
  return profile?.role === 'admin' || user?.email === 'abhishekdutta18@gmail.com';
}

export async function loadAll() {
  window.__setAdminIntegrationStatus?.(null, 'Integrations: Syncing');
  ['statTotal','statPublished','statDrafts','statSubs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '…';
  });

  try {
    const posts = await api.data.posts.getAll();
    state.allPosts = posts.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    document.getElementById('statTotal').textContent     = state.allPosts.length;
    document.getElementById('statPublished').textContent = state.allPosts.filter(p=>p.published).length;
    document.getElementById('statDrafts').textContent    = state.allPosts.filter(p=>!p.published).length;

    // Subscribers stats via proxy
    try {
      const subs = await api.data.getAll('subscribers');
      document.getElementById('statSubs').textContent = subs.length;
    } catch(_) { document.getElementById('statSubs').textContent = '—'; }

    renderPostsTable(state.allPosts.slice(0,8), 'recentPostsBody');
    window.__setAdminIntegrationStatus?.('online', 'Integrations: Online');

  } catch(e) {
    console.error('loadAll error:', e);
    window.__setAdminIntegrationStatus?.('degraded', 'Integrations: Degraded');
    showToast('Failed to load: ' + e.message, 'error');
  }
}
window.loadAll = loadAll;

export function renderPostsTable(posts, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!posts.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="table-empty">No posts yet.</div></td></tr>';
    return;
  }
  const escHtml = (s) => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  tbody.innerHTML = posts.map(p => {
    const title  = escHtml(p.title) || '(Untitled)';
    const cat    = escHtml(p.category) || '—';
    const author = escHtml(p.authorName || p.authorEmail || 'BlogsPro');
    const date   = p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—';
    const stageColors = { writing: '#93c5fd', review: '#c9a84c', published: '#4ade80', archived: '#8896b3' };
    const stageLabels = { writing: 'Writing', review: 'Review', published: 'Published', archived: 'Archived' };
    const stage = p.stage || (p.published ? 'published' : 'writing');
    const stageColor = stageColors[stage] || '#8896b3';
    const status = `<span style="font-size:0.72rem;font-weight:600;color:${stageColor};text-transform:uppercase">${stageLabels[stage] || stage}</span>`;
    const v      = formatViews(p.views || 0);
    const views  = `<span style="font-size:0.82rem;color:var(--muted)">&#128065; ${v}</span>`;
    return `<tr>
      <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><strong>${title}</strong></td>
      <td>${cat}</td><td>${status}</td>
      <td style="white-space:nowrap">${author}</td>
      <td>${views}</td>
      <td style="color:var(--muted);white-space:nowrap">${date}</td>
      <td>
        <button class="action-btn" onclick="editPost('${p.id}')">Edit</button>
        <button class="action-btn" onclick="togglePublish('${p.id}',${!!p.published})">${p.published?'Unpublish':'Publish'}</button>
        ${stage !== 'archived' ? `<button class="action-btn" onclick="archivePost('${p.id}')">Archive</button>` : ''}
        <button class="action-btn delete" onclick="deletePost('${p.id}')">Delete</button>
      </td></tr>`;
  }).join('');
}

export async function savePost(publish) {
  const title    = stripTags(document.getElementById('postTitle').value.trim());
  const excerpt  = document.getElementById('postExcerpt').value.trim();
  const cat      = document.getElementById('postCategory').value;
  const slug     = document.getElementById('postSlug').value.trim() || slugify(title);
  const metaDesc = document.getElementById('postMeta').value.trim();
  const tagsRaw  = document.getElementById('postTags').value.trim();
  const tags     = tagsRaw ? tagsRaw.split(',').map(t=>t.trim()).filter(Boolean) : [];
  const editor   = document.getElementById('editor');
  const readMin  = Math.max(1, Math.ceil((editor.textContent||'').split(/\s+/).filter(Boolean).length/200));

  if (!title) { showToast('Please add a title.','error'); return; }

  const saveStatus = document.getElementById('saveStatus');
  saveStatus.textContent = 'Saving…';

  const stage = publish ? 'published' : (state.editingPostId ? 'review' : 'writing');
  const existingPost = state.editingPostId ? state.allPosts.find(p => p.id === state.editingPostId) : null;
  const email = state.currentUser?.email || '';
  const fallbackName = (state.currentUserProfile?.name || state.currentUser?.displayName || (email.includes('@') ? email.split('@')[0] : '') || 'BlogsPro');

  const data = {
    title, excerpt, content: editor.innerHTML, category:cat, slug, 
    image: document.getElementById('postImage').value.trim(), 
    metaDesc, tags, readingTime:readMin, published:publish, premium:state.isPremium, stage,
    authorUid: existingPost?.authorUid || state.currentUser?.uid || null,
    authorName: existingPost?.authorName || fallbackName,
    authorEmail: existingPost?.authorEmail || email || null,
    updatedAt: new Date().toISOString()
  };

  try {
    await api.data.posts.save(state.editingPostId, data);
    showToast(publish ? 'Post published!' : 'Draft saved.', 'success');
    await loadAll();
    saveStatus.textContent = publish ? '✓ Published' : '✓ Draft saved';
  } catch(e) { 
    saveStatus.textContent = ''; 
    showToast('Save failed: '+ e.message, 'error'); 
  }
}
window.savePost = savePost;

window.archivePost = async (id) => {
  try {
    await api.data.update('posts', id, { stage: 'archived', published: false });
    showToast('Post archived.', 'success');
    await loadAll();
  } catch(e) { showToast('Archive failed: ' + e.message, 'error'); }
};

export async function editPost(id) {
  window.showView('editor');
  state.editingPostId = id;
  try {
    const p = await api.data.posts.get(id);
    if (!p) return;
    document.getElementById('postTitle').value    = stripTags(p.title||'');
    document.getElementById('postExcerpt').value  = p.excerpt||'';
    document.getElementById('postSlug').value     = p.slug||'';
    document.getElementById('postImage').value    = p.image||'';
    document.getElementById('postMeta').value     = p.metaDesc||'';
    document.getElementById('postTags').value     = (p.tags||[]).join(', ');
    const { sanitize } = await import('./utils.js').catch(() => ({ sanitize: (h) => h }));
    document.getElementById('editor').innerHTML   = sanitize(p.content||'');
    document.getElementById('postCategory').value = p.category||'Fintech';
    state.isPremium = p.premium === true;
    const topbarStateBadge = document.getElementById('topbarStateBadge');
    if (topbarStateBadge) {
      const stage = p.stage || (p.published ? 'published' : 'draft');
      topbarStateBadge.textContent = stage === 'published' ? 'Published' : (stage === 'review' ? 'Review' : 'Draft');
    }
  } catch(e) { showToast('Failed to load post.','error'); }
}
window.editPost = editPost;

export async function togglePublish(id, current) {
  try { 
    await api.data.update('posts', id, { published: !current }); 
    showToast(current?'Unpublished.':'Published!','success'); 
    await loadAll(); 
  } catch(e) { showToast('Update failed.','error'); }
}
window.togglePublish = togglePublish;

export async function deletePost(id) {
  if (!confirm('Delete this post? Cannot be undone.')) return;
  try { 
    await api.data.delete('posts', id); 
    showToast('Deleted.','success'); 
    await loadAll(); 
  } catch(e) { showToast('Delete failed.','error'); }
}
window.deletePost = deletePost;

export async function loadIntelligence() {
    const pulseBody = document.getElementById('swarmPulseBody');
    const articleBody = document.getElementById('swarmArticleBody');
    const ledgerBody = document.getElementById('swarmLedgerBody');
    if (!pulseBody || !articleBody || !ledgerBody) return;

    pulseBody.innerHTML = '<tr><td colspan="3" class="table-empty">⚡ Syncing Pulses...</td></tr>';
    articleBody.innerHTML = '<tr><td colspan="3" class="table-empty">⚡ Syncing Tomes...</td></tr>';

    try {
        const [pulseSnap, articleSnap, ledgerSnap] = await Promise.all([
            api.data.getAll('pulse_briefings'),
            api.data.getAll('articles'),
            api.data.getAll('ai_reinforcement_ledger')
        ]);

        pulseBody.innerHTML = pulseSnap.map(d => {
            return `<tr><td><b>${(d.frequency||'').toUpperCase()}</b></td><td>${d.title}</td><td>${new Date(d.date).toLocaleDateString()}</td></tr>`;
        }).join('') || '<tr><td colspan="3" class="table-empty">No pulses found.</td></tr>';

        articleBody.innerHTML = articleSnap.map(d => {
            return `<tr><td><b>${(d.frequency||'').toUpperCase()}</b></td><td>${d.title}</td><td>${new Date(d.date).toLocaleDateString()}</td></tr>`;
        }).join('') || '<tr><td colspan="3" class="table-empty">No strategic tomes found.</td></tr>';

        ledgerBody.innerHTML = ledgerSnap.map(d => {
            const ts = new Date(d.timestamp);
            return `<div>[${ts.toLocaleTimeString()}] <span style="color:var(--emerald)">${d.event || 'LOG'}</span>: ${d.message || JSON.stringify(d)}</div>`;
        }).join('') || 'Initializing ledger stream...';

    } catch (e) {
        showToast('Swarm sync failed: ' + e.message, 'error');
    }
}
window.loadIntelligence = loadIntelligence;

export async function loadHybridPosts() {
    try {
        let firestorePosts = [];
        try {
            const posts = await api.data.posts.getAll();
            firestorePosts = posts.filter(p => p.published);
        } catch (err) {
            console.warn('[HybridEngine] Firestore posts unavailable');
        }

        const origin = window.location.origin;
        const briefingIndices = [
            `${origin}/briefings/daily/index.json`,
            `${origin}/briefings/hourly/index.json`,
            `${origin}/articles/weekly/index.json`
        ];

        const aiResults = await Promise.all(briefingIndices.map(url => 
            fetch(url, { cache: 'no-cache' })
                .then(r => r.ok ? r.json() : [])
                .catch(() => [])
        ));

        let aiPosts = aiResults.flat().map(pulse => ({
            id: pulse.fileName,
            title: pulse.title,
            excerpt: pulse.excerpt || "Institutional Strategic Intelligence",
            category: pulse.type === 'briefing' ? 'Pulse' : 'Strategic',
            authorName: "BlogsPro Research Desk",
            createdAt: new Date(pulse.timestamp || Date.now()).toISOString(),
            isAI: true,
            frequency: pulse.frequency,
            path: pulse.type === 'briefing' ? `briefings/${pulse.frequency}/${pulse.fileName}` : `articles/${pulse.frequency}/${pulse.fileName}`
        }));

        let all = [...firestorePosts, ...aiPosts].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        if (!checkIfAdmin()) {
            const nonAI = all.filter(p => !p.isAI);
            const limitedAI = all.filter(p => p.isAI).slice(0, 3);
            all = [...nonAI, ...limitedAI].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        }

        return all;
    } catch (err) {
        console.error('[HybridEngine] Sync failed:', err);
        return [];
    }
}
window.loadHybridPosts = loadHybridPosts;
