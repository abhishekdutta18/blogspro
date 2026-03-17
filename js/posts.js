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

// Pure formatting — no Firebase import needed
function formatViews(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n/1000000).toFixed(1).replace(/\.0$/,'') + 'M';
  if (n >= 1000)    return (n/1000).toFixed(1).replace(/\.0$/,'') + 'k';
  return String(n);
}

export async function loadAll() {
  ['statTotal','statPublished','statDrafts','statSubs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '…';
  });

  try {
    let snap;
    try {
      snap = await getDocs(query(collection(db,'posts'), orderBy('createdAt','desc'), limit(50)));
    } catch(indexErr) {
      console.warn('Ordered query failed, falling back:', indexErr.message);
      snap = await getDocs(query(collection(db,'posts'), limit(50)));
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
      const ss = await getDocs(query(collection(db,'subscribers'), limit(1000)));
      document.getElementById('statSubs').textContent = ss.size;
    } catch(_) { document.getElementById('statSubs').textContent = '—'; }

    renderPostsTable(state.allPosts.slice(0,8), 'recentPostsBody');

  } catch(e) {
    console.error('loadAll error:', e);
    const isRules = e.code === 'permission-denied' || e.message?.includes('Missing or insufficient');
    const isInit  = !e.code && e.message?.includes('undefined');
    let hint = 'Check Firestore rules or index.';
    if (isRules) hint = 'Firestore rules not deployed — go to Firebase Console → Firestore → Rules and publish the new rules.';
    if (isInit)  hint = 'config.js not updated — deploy the new config.js from blogspro-complete-fix.zip and hard-refresh.';
    const tbody = document.getElementById('recentPostsBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6"><div class="table-empty" style="color:#fca5a5;line-height:1.8">
      ✕ ${e.message || 'Unknown error'}<br>
      <span style="font-size:0.75rem;color:var(--muted)">${hint}</span><br>
      <button onclick="loadAll()" style="margin-top:8px;background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.3);color:var(--gold);padding:4px 12px;border-radius:3px;font-size:0.75rem;cursor:pointer">↺ Retry</button>
    </div></td></tr>`;
    ['statTotal','statPublished','statDrafts','statSubs'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = '—';
    });
    showToast('Failed to load: ' + (e.message || e.code), 'error');
  }
}

export function renderPostsTable(posts, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!posts.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="table-empty">No posts yet.</div></td></tr>';
    return;
  }
  // FIX: Escape post fields to prevent XSS in admin table
  const escHtml = (s) => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  tbody.innerHTML = posts.map(p => {
    const title  = escHtml(p.title) || '(Untitled)';
    const cat    = escHtml(p.category) || '—';
    const date   = p.createdAt?.toDate?.()?.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) || '—';
    const status = p.published ? '<span class="status-badge status-published">Published</span>' : '<span class="status-badge status-draft">Draft</span>';
    const v      = formatViews(p.views || 0);
    const views  = `<span style="font-size:0.82rem;color:var(--muted)">&#128065; ${v}</span>`;
    return `<tr>
      <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><strong>${title}</strong></td>
      <td>${cat}</td><td>${status}</td>
      <td>${views}</td>
      <td style="color:var(--muted);white-space:nowrap">${date}</td>
      <td>
        <button class="action-btn" onclick="editPost('${p.id}')">Edit</button>
        <button class="action-btn" onclick="togglePublish('${p.id}',${!!p.published})">${p.published?'Unpublish':'Publish'}</button>
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
  const data = { title, excerpt, content, category:cat, slug, image, metaDesc, tags, readingTime:readMin, published:publish, premium:state.isPremium, updatedAt:serverTimestamp() };
  try {
    if (state.editingPostId) {
      await updateDoc(doc(db,'posts',state.editingPostId), data);
    } else {
      data.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db,'posts'), data);
      state.editingPostId = ref.id;
    }
    saveStatus.textContent = publish ? '✓ Published' : '✓ Draft saved';
    showToast(publish ? 'Post published!' : 'Draft saved.', 'success');
    await loadAll();
  } catch(e) { saveStatus.textContent = ''; showToast('Save failed: '+(e.code||e.message),'error'); }
}
window.savePost = savePost;

export async function editPost(id) {
  window.showView('editor');
  state.editingPostId = id;
  document.getElementById('editorHeading').textContent = 'Edit Post';
  try {
    const snap = await getDoc(doc(db,'posts',id));
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
