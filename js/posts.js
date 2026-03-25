// ═══════════════════════════════════════════════
// posts.js — Post CRUD and dashboard data
// ═══════════════════════════════════════════════
import { db }            from './config.js';
import { sanitize, showToast, slugify, stripTags, validateImageUrl } from './config.js';
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
  // Prevent concurrent saves (race condition fix)
  if (state.isSaving) {
    showToast('Save in progress, please wait…', 'info');
    return;
  }
  state.isSaving = true;

  const title    = stripTags(document.getElementById('postTitle').value.trim());
  const excerpt  = document.getElementById('postExcerpt').value.trim();
  const cat      = document.getElementById('postCategory').value;
  const slug     = document.getElementById('postSlug').value.trim() || slugify(title);
  const metaDesc = document.getElementById('postMeta').value.trim();
  const tagsRaw  = document.getElementById('postTags').value.trim();
  const tags     = tagsRaw ? tagsRaw.split(',').map(t=>t.trim()).filter(Boolean) : [];
  const editor   = document.getElementById('editor');
  const readMin  = Math.max(1, Math.ceil((editor.textContent||'').split(/\s+/).filter(Boolean).length/200));

  if (!title) { showToast('Please add a title.','error'); state.isSaving = false; return; }

  const saveStatus = document.getElementById('saveStatus');
  saveStatus.textContent = 'Checking images…';
  let image   = document.getElementById('postImage').value.trim();
  let content = editor.innerHTML;

  // Validate image URL for safety
  if (image && !image.startsWith('blob:')) {
    const validatedUrl = validateImageUrl(image);
    if (!validatedUrl) {
      showToast('Invalid image URL (must be HTTPS from safe domains).', 'error');
      saveStatus.textContent = '';
      state.isSaving = false;
      return;
    }
    image = validatedUrl;
  }

  if (image.startsWith('blob:')) {
    try {
      saveStatus.textContent = '⏳ Uploading featured image…';
      const file = await blobUrlToFile(image, 'featured-image.jpg');
      image = await uploadToStorage(file, 'featured', pct => { saveStatus.textContent = `⏳ Uploading featured ${pct}%`; });
      document.getElementById('postImage').value = image;
    } catch(e) { showToast('Featured upload failed: ' + e.message,'error'); saveStatus.textContent=''; state.isSaving = false; return; }
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
  const data = { title, excerpt, content, category:cat, slug, image, metaDesc, tags, readingTime:readMin, published:publish, premium:state.isPremium, stage, updatedAt:serverTimestamp() };
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
    return state.editingPostId;
  } catch(e) {
    saveStatus.textContent = '';
    showToast('Save failed: '+(e.code||e.message),'error');
    return null;
  } finally {
    state.isSaving = false;
  }
}
window.savePost = savePost;

window.savePostAndNotify = async function() {
  const btn = event?.currentTarget;
  const originalText = btn ? btn.innerHTML : "🚀 Publish & Notify";
  if (btn) {
    btn.innerHTML = "⏳ Publishing...";
    btn.disabled = true;
  }

  try {
    const postId = await savePost(true);
    if (!postId) {
      if (btn) {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
      return;
    }

    if (btn) btn.innerHTML = "📧 Notifying Subscribers...";
    
    const title = document.getElementById('postTitle').value.trim() || 'New Article';
    const excerpt = document.getElementById('postExcerpt').value.trim() || 'Check out our latest post on BlogsPro!';
    const rawSlug = document.getElementById('postSlug').value.trim() || title;
    const slug = rawSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || postId;
    
    // Using unified worker endpoint and secret from newsletter.js
    const workerUrl = "https://blogspro-newsletter.abhishek-dutta1996.workers.dev";
    const secret = "biltu123";

    const res = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, title, excerpt, slug, secret })
    });

    if (res.ok) {
        showToast('Blast Complete! Subscribers notified.', 'success');
    } else {
        const errText = await res.text();
        throw new Error('Newsletter API Failed: ' + errText);
    }
  } catch (err) {
    console.error('[savePostAndNotify]', err);
    showToast('Post published, but emails failed to send. Check worker logs.', 'error');
  } finally {
    if (btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
};

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
  try {
    const snap = await getDoc(doc(db,'posts',id));
    if (!snap.exists()) return;
    const p = snap.data();
    const editor = document.getElementById('editor');
    document.getElementById('postTitle').value    = stripTags(p.title||'');
    document.getElementById('postExcerpt').value  = p.excerpt||'';
    document.getElementById('postSlug').value     = p.slug||'';
    // Validate image URL for safety
    const validatedImage = p.image ? validateImageUrl(p.image) : '';
    document.getElementById('postImage').value    = validatedImage || '';
    if (validatedImage) window.updateFeaturedPreview?.(validatedImage);
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
