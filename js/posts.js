// ═══════════════════════════════════════════════
// posts.js — Post CRUD and dashboard data
// ═══════════════════════════════════════════════
import { db }            from './config.js';
import { sanitize, showToast, slugify, stripTags } from './config.js';
import { state }         from './state.js';
import { buildInternalLinks } from './ai-editor.js';
import { uploadToStorage, blobUrlToFile } from './images-upload.js';
import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const FIREBASE_TIMEOUT_MS = 12000;
function withTimeout(promise, ms = FIREBASE_TIMEOUT_MS, label = 'request') {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Pure formatting — no Firebase import needed
function formatViews(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n/1000000).toFixed(1).replace(/\.0$/,'') + 'M';
  if (n >= 1000)    return (n/1000).toFixed(1).replace(/\.0$/,'') + 'k';
  return String(n);
}

export async function loadAll() {
  window.__setAdminIntegrationStatus?.(null, 'Integrations: Syncing');
  ['statTotal','statPublished','statDrafts','statSubs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '…';
  });

  try {
    let snap;
    try {
      snap = await withTimeout(
        getDocs(query(collection(db,'posts'), orderBy('createdAt','desc'), limit(50))),
        FIREBASE_TIMEOUT_MS,
        'posts dashboard query'
      );
    } catch(indexErr) {
      console.warn('Ordered query failed, falling back:', indexErr.message);
      snap = await withTimeout(
        getDocs(query(collection(db,'posts'), limit(50))),
        FIREBASE_TIMEOUT_MS,
        'posts fallback query'
      );
    }

    state.allPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.allPosts.sort((a,b) => {
      const ta = a.createdAt?.toMillis?.() || (a.createdAt?.seconds||0)*1000;
      const tb = b.createdAt?.toMillis?.() || (b.createdAt?.seconds||0)*1000;
      return tb - ta;
    });

    document.getElementById('statTotal').textContent     = state.allPosts.length;
    document.getElementById('statPublished').textContent = state.allPosts.filter(p=>p.published).length;
    document.getElementById('statDrafts').textContent    = state.allPosts.filter(p=>!p.published).length;

    try {
      const ss = await withTimeout(
        getDocs(query(collection(db,'subscribers'), limit(1000))),
        FIREBASE_TIMEOUT_MS,
        'subscribers stats query'
      );
      document.getElementById('statSubs').textContent = ss.size;
    } catch(_) { document.getElementById('statSubs').textContent = '—'; }

    renderPostsTable(state.allPosts.slice(0,8), 'recentPostsBody');
    window.__setAdminIntegrationStatus?.('online', 'Integrations: Online');

  } catch(e) {
    console.error('loadAll error:', e);
    const isRules = e.code === 'permission-denied' || e.message?.includes('Missing or insufficient');
    const isInit  = !e.code && e.message?.includes('undefined');
    let hint = 'Check Firestore rules or index.';
    if (isRules) hint = 'Firestore rules not deployed — go to Firebase Console → Firestore → Rules and publish the new rules.';
    if (isInit)  hint = 'config.js not updated — deploy the new config.js from blogspro-complete-fix.zip and hard-refresh.';
    const tbody = document.getElementById('recentPostsBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7"><div class="table-empty" style="color:#fca5a5;line-height:1.8">
      ✕ ${e.message || 'Unknown error'}<br>
      <span style="font-size:0.75rem;color:var(--muted)">${hint}</span><br>
      <button onclick="loadAll()" style="margin-top:8px;background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.3);color:var(--gold);padding:4px 12px;border-radius:3px;font-size:0.75rem;cursor:pointer">↺ Retry</button>
    </div></td></tr>`;
    ['statTotal','statPublished','statDrafts','statSubs'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = '—';
    });
    window.__setAdminIntegrationStatus?.('degraded', 'Integrations: Degraded');
    showToast('Failed to load: ' + (e.message || e.code), 'error');
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
  // FIX: Escape post fields to prevent XSS in admin table
  const escHtml = (s) => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  tbody.innerHTML = posts.map(p => {
    const title  = escHtml(p.title) || '(Untitled)';
    const cat    = escHtml(p.category) || '—';
    const author = escHtml(p.authorName || p.authorEmail || 'BlogsPro');
    const date   = p.createdAt?.toDate?.()?.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) || '—';
    // FEATURE 13: Stage-based status display
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
  saveStatus.textContent = 'Checking images…';
  let image   = document.getElementById('postImage').value.trim();
  let content = editor.innerHTML;

  if (image.startsWith('blob:')) {
    try {
      saveStatus.textContent = '⏳ Uploading featured image…';
      const file = await blobUrlToFile(image, 'featured-image.jpg');
      image = await uploadToStorage(file, 'featured', pct => { saveStatus.textContent = `⏳ Uploading featured ${pct}%`; });
      document.getElementById('postImage').value = image;
    } catch(e) { showToast('Featured upload failed: ' + e.message,'error'); saveStatus.textContent=''; return; }
  }

  const blobMatches = [...content.matchAll(/src="(blob:[^"]+)"/g)];
  if (blobMatches.length) {
    saveStatus.textContent = `⏳ Uploading ${blobMatches.length} inline image(s)…`;
    let cnt = 0;
    for (const match of blobMatches) {
      try {
        const file = await blobUrlToFile(match[1], `content-image-${cnt+1}.jpg`);
        const url  = await uploadToStorage(file, 'content', pct => { saveStatus.textContent = `⏳ Uploading image ${cnt+1}/${blobMatches.length}… ${pct}%`; });
        content = content.replace(match[1], url); cnt++;
      } catch(_) {}
    }
    editor.innerHTML = sanitize(content);
  }

  // Internal links are now button-triggered only (via runInternalLinking)
  // to prevent link nesting on every save

  saveStatus.textContent = 'Saving…';
  // FEATURE 13: Determine post stage based on publish state
  const stage = publish ? 'published' : (state.editingPostId ? 'review' : 'writing');
  const existingPost = state.editingPostId ? state.allPosts.find(p => p.id === state.editingPostId) : null;
  const email = state.currentUser?.email || '';
  const fallbackName = state.currentUserProfile?.name
    || state.currentUser?.displayName
    || (email.includes('@') ? email.split('@')[0] : '')
    || 'BlogsPro';
  const data = {
    title, excerpt, content, category:cat, slug, image, metaDesc, tags,
    readingTime:readMin, published:publish, premium:state.isPremium, stage,
    authorUid: existingPost?.authorUid || state.currentUser?.uid || null,
    authorName: existingPost?.authorName || fallbackName,
    authorEmail: existingPost?.authorEmail || email || null,
    updatedAt:serverTimestamp()
  };
  try {
    if (state.editingPostId) {
      await updateDoc(doc(db,'posts',state.editingPostId), data);
    } else {
      data.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db,'posts'), data);
      state.editingPostId = ref.id;
    }
    const topbarStateBadge = document.getElementById('topbarStateBadge');
    if (topbarStateBadge) topbarStateBadge.textContent = publish ? 'Published' : 'Draft';
    saveStatus.textContent = publish ? '✓ Published' : '✓ Draft saved';
    showToast(publish ? 'Post published!' : 'Draft saved.', 'success');
    await loadAll();
  } catch(e) { saveStatus.textContent = ''; showToast('Save failed: '+(e.code||e.message),'error'); }
}
window.savePost = savePost;

// FEATURE 13: Archive/unarchive a post
window.archivePost = async (id) => {
  try {
    await updateDoc(doc(db,'posts',id), { stage: 'archived', published: false });
    showToast('Post archived.', 'success');
    await loadAll();
  } catch(e) { showToast('Archive failed: ' + e.message, 'error'); }
};

export async function editPost(id) {
  window.showView('editor');
  state.editingPostId = id;
  document.getElementById('editorHeading').textContent = 'Edit Post';
  const topbarTitle = document.getElementById('topbarTitle');
  if (topbarTitle) topbarTitle.textContent = 'Edit Post';
  try {
    const snap = await withTimeout(getDoc(doc(db,'posts',id)), FIREBASE_TIMEOUT_MS, 'edit post query');
    if (!snap.exists()) return;
    const p = snap.data();
    const editor = document.getElementById('editor');
    document.getElementById('postTitle').value    = stripTags(p.title||'');
    document.getElementById('postExcerpt').value  = p.excerpt||'';
    document.getElementById('postSlug').value     = p.slug||'';
    document.getElementById('postImage').value    = p.image||'';
    if (p.image) window.updateFeaturedPreview?.(p.image);
    document.getElementById('postMeta').value     = p.metaDesc||'';
    document.getElementById('postTags').value     = (p.tags||[]).join(', ');
    editor.innerHTML = sanitize(p.content||'');
    document.getElementById('postCategory').value = p.category||'Fintech';
    state.isPremium = p.premium === true;
    document.getElementById('premiumSwitch')?.classList.toggle('on', state.isPremium);
    const topbarStateBadge = document.getElementById('topbarStateBadge');
    if (topbarStateBadge) {
      const stage = p.stage || (p.published ? 'published' : 'draft');
      topbarStateBadge.textContent = stage === 'published' ? 'Published' : (stage === 'review' ? 'Review' : 'Draft');
    }
    window.updateWordCount?.();
    window.openAIDrawer?.('edit');
  } catch(e) { showToast('Failed to load post.','error'); }
}
window.editPost = editPost;

export async function togglePublish(id, current) {
  try { await updateDoc(doc(db,'posts',id),{published:!current}); showToast(current?'Unpublished.':'Published!','success'); await loadAll(); }
  catch(e) { showToast('Update failed.','error'); }
}
window.togglePublish = togglePublish;

export async function deletePost(id) {
  if (!confirm('Delete this post? Cannot be undone.')) return;
  try { await deleteDoc(doc(db,'posts',id)); showToast('Deleted.','success'); await loadAll(); }
  catch(e) { showToast('Delete failed.','error'); }
}
window.deletePost = deletePost;

/**
 * INTELLIGENCE SWARM MONITORING
 * Loads real-time serverless pipeline data
 */
export async function loadIntelligence() {
    const pulseBody = document.getElementById('swarmPulseBody');
    const articleBody = document.getElementById('swarmArticleBody');
    const ledgerBody = document.getElementById('swarmLedgerBody');

    if (!pulseBody || !articleBody || !ledgerBody) return;

    pulseBody.innerHTML = '<tr><td colspan="3" class="table-empty">⚡ Syncing Pulses...</td></tr>';
    articleBody.innerHTML = '<tr><td colspan="3" class="table-empty">⚡ Syncing Tomes...</td></tr>';

    try {
        const [pulseSnap, articleSnap, ledgerSnap] = await Promise.all([
            getDocs(query(collection(db, 'pulse_briefings'), orderBy('date', 'desc'), limit(15))),
            getDocs(query(collection(db, 'articles'), orderBy('date', 'desc'), limit(15))),
            getDocs(query(collection(db, 'ai_reinforcement_ledger'), orderBy('timestamp', 'desc'), limit(30)))
        ]);

        pulseBody.innerHTML = pulseSnap.docs.map(doc => {
            const d = doc.data();
            return `<tr><td><b>${d.frequency.toUpperCase()}</b></td><td>${d.title}</td><td>${new Date(d.date).toLocaleDateString()}</td></tr>`;
        }).join('') || '<tr><td colspan="3" class="table-empty">No pulses found.</td></tr>';

        articleBody.innerHTML = articleSnap.docs.map(doc => {
            const d = doc.data();
            return `<tr><td><b>${d.frequency.toUpperCase()}</b></td><td>${d.title}</td><td>${new Date(d.date).toLocaleDateString()}</td></tr>`;
        }).join('') || '<tr><td colspan="3" class="table-empty">No strategic tomes found.</td></tr>';

        ledgerBody.innerHTML = ledgerSnap.docs.map(doc => {
            const d = doc.data();
            const ts = d.timestamp?.toDate?.() || new Date(d.timestamp);
            return `<div>[${ts.toLocaleTimeString()}] <span style="color:var(--emerald)">${d.event || 'LOG'}</span>: ${d.message || JSON.stringify(d)}</div>`;
        }).join('') || 'Initializing ledger stream...';

    } catch (e) {
        console.error('loadIntelligence error:', e);
        showToast('Swarm sync failed: ' + e.message, 'error');
    }
}
window.loadIntelligence = loadIntelligence;

/**
 * HYBRID DATA ENGINE (The Sovereign Grid)
 * Unified fetcher for Firestore Posts + AI Sovereign Pulses
 */
export async function loadHybridPosts() {
    try {
        // 1. Fetch Manual Firestore Posts
        const snap = await withTimeout(getDocs(query(
            collection(db, 'posts'),
            orderBy('createdAt', 'desc')
        )), FIREBASE_TIMEOUT_MS, 'posts query');
        
        let firestorePosts = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(p => p.published);

        // 2. Ingest Sovereign AI Pulses
        const briefingIndices = ['/briefings/daily/index.json', '/briefings/hourly/index.json', '/articles/weekly/index.json'];
        const aiResults = await Promise.all(briefingIndices.map(url => 
            fetch(url).then(r => r.ok ? r.json() : []).catch(() => [])
        ));

        let aiPosts = aiResults.flat().map(pulse => ({
            id: pulse.fileName,
            title: pulse.title,
            excerpt: pulse.excerpt || "Institutional Strategic Intelligence",
            category: pulse.type === 'briefing' ? 'Pulse' : 'Strategic',
            authorName: "Bloomberg",
            createdAt: { toDate: () => new Date(pulse.timestamp || Date.now()) },
            timestamp: pulse.timestamp || Date.now(),
            isAI: true,
            path: pulse.type === 'briefing' ? `briefings/${pulse.frequency}/${pulse.fileName}` : `articles/${pulse.frequency}/${pulse.fileName}`
        }));

        // 3. Unify & Sort
        const all = [...firestorePosts, ...aiPosts].sort((a, b) => {
            const ta = a.timestamp || a.createdAt?.toMillis?.() || 0;
            const tb = b.timestamp || b.createdAt?.toMillis?.() || 0;
            return tb - ta;
        });

        return all;
    } catch (err) {
        console.error('[HybridEngine] Sync failed:', err);
        throw err;
    }
}
window.loadHybridPosts = loadHybridPosts;
