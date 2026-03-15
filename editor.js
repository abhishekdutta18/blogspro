// ═══════════════════════════════════════════════
// editor.js — Rich text editor, toolbar, autosave
// ═══════════════════════════════════════════════
import { sanitize, showToast, slugify, stripTags } from './config.js';
import { db }        from './config.js';
import { state }     from './state.js';
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function initEditor() {
  const editor = document.getElementById('editor');
  if (!editor) return;

  editor.addEventListener('input', updateWordCount);
  editor.addEventListener('input', scheduleAutoSave);

  document.getElementById('postTitle')?.addEventListener('input', e => {
    const clean = stripTags(e.target.value);
    if (clean !== e.target.value) e.target.value = clean;
    if (!state.editingPostId)
      document.getElementById('postSlug').value = slugify(clean);
  });

  document.getElementById('postTitle')?.addEventListener('paste', e => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, stripTags(text).trim());
  });
}

export function clearEditor() {
  state.editingPostId  = null;
  state.isPremium      = false;
  state.generatedImages = [];
  state.autoPlaceCancelled = false;
  state.lastSavedContent   = '';

  ['postTitle','postExcerpt','postSlug','postImage','postMeta','postTags'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });

  const editor = document.getElementById('editor');
  if (editor) editor.innerHTML = '';

  document.getElementById('wordCount')?.setAttribute('textContent','0');
  document.getElementById('wordCount') && (document.getElementById('wordCount').textContent = '0');
  document.getElementById('readingTimeDisplay') && (document.getElementById('readingTimeDisplay').textContent = '0');
  document.getElementById('saveStatus')         && (document.getElementById('saveStatus').textContent = '');
  document.getElementById('autoSaveMsg')        && (document.getElementById('autoSaveMsg').textContent = '');
  document.getElementById('editorHeading')      && (document.getElementById('editorHeading').textContent = 'New Post');
  document.getElementById('premiumSwitch')?.classList.remove('on');
  document.getElementById('aiResultBox')        && (document.getElementById('aiResultBox').style.display = 'none');
  document.getElementById('imgPreviewGrid')     && (document.getElementById('imgPreviewGrid').style.display = 'none');
  document.getElementById('imgGenStatus')       && (document.getElementById('imgGenStatus').innerHTML = '');
  document.getElementById('autoplaceBar')?.classList.remove('active');
  document.getElementById('qualityScoreResult') && (document.getElementById('qualityScoreResult').style.display = 'none');
  document.getElementById('featuredPreview')    && (document.getElementById('featuredPreview').style.display = 'none');
}
window.clearEditor = clearEditor;

export function updateWordCount() {
  const editor = document.getElementById('editor');
  if (!editor) return;
  const text  = editor.cloneNode(true).textContent || '';
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  document.getElementById('wordCount')        && (document.getElementById('wordCount').textContent = words);
  document.getElementById('readingTimeDisplay') && (document.getElementById('readingTimeDisplay').textContent = Math.max(1, Math.ceil(words/200)));
}
window.updateWordCount = updateWordCount;

// ── Auto-save ──────────────────────────────────
let _autoSaveTimer;
function scheduleAutoSave() {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async () => {
    if (!state.editingPostId) return;
    const editor = document.getElementById('editor');
    const content = editor?.innerHTML;
    if (!content || content.trim().length < 50) return;
    if (content === state.lastSavedContent) return;
    try {
      await updateDoc(doc(db,'posts',state.editingPostId), { content, updatedAt: serverTimestamp() });
      state.lastSavedContent = content;
      const msg = document.getElementById('autoSaveMsg');
      if (msg) msg.textContent = 'Auto-saved at ' + new Date().toLocaleTimeString();
    } catch(_) {}
  }, 30000);
}

// ── Toolbar commands ───────────────────────────
function safeExec(cmd, value = null) {
  const editor = document.getElementById('editor');
  editor?.focus();
  try { if (document.queryCommandSupported?.(cmd)) document.execCommand(cmd, false, value); } catch(_) {}
}
window.fmt      = cmd  => safeExec(cmd);
window.fmtBlock = tag  => safeExec('formatBlock', tag);
window.insertLink = () => { const url = prompt('Enter URL:'); if (url) safeExec('createLink', url); };
window.togglePremium = () => {
  state.isPremium = !state.isPremium;
  document.getElementById('premiumSwitch')?.classList.toggle('on', state.isPremium);
};

// ── Preview ────────────────────────────────────
window.previewPost = () => {
  const title   = document.getElementById('postTitle').value || 'Preview';
  const excerpt = document.getElementById('postExcerpt').value || '';
  const content = document.getElementById('editor').innerHTML;
  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title} — Preview</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>body{font-family:'DM Sans',sans-serif;background:#080d1a;color:#f5f0e8;max-width:740px;margin:4rem auto;padding:0 2rem;line-height:1.8}h1{font-family:'Cormorant Garamond',serif;font-size:3rem;font-weight:700;margin-bottom:1rem}h2{font-family:'Cormorant Garamond',serif;font-size:1.8rem;margin:2rem 0 1rem}h3{font-family:'Cormorant Garamond',serif;font-size:1.3rem;margin:1.5rem 0 .75rem}p{margin-bottom:1.5rem}blockquote{border-left:3px solid #c9a84c;padding-left:1.5rem;margin:2rem 0;font-style:italic;color:#8896b3}figure{margin:2rem 0;text-align:center}figure img{max-width:100%;border-radius:4px}.badge{background:#1a2340;color:#8896b3;font-size:.75rem;padding:.4rem 1rem;border-radius:2px;display:inline-block;margin-bottom:2rem}</style></head>
  <body><div class="badge">PREVIEW</div><h1>${title}</h1>${excerpt?`<p style="font-size:1.2rem;color:#8896b3;margin-bottom:2rem">${excerpt}</p>`:''}${sanitize(content)}</body></html>`);
  win.document.close();
};

// ── Featured image ─────────────────────────────
window.updateFeaturedPreview = (url) => {
  const preview = document.getElementById('featuredPreview');
  const img     = document.getElementById('featuredPreviewImg');
  const label   = document.getElementById('featuredPreviewLabel');
  if (!url?.trim()) { if (preview) preview.style.display='none'; if (img) img.src=''; return; }
  if (img) {
    img.onload  = () => { if (preview) preview.style.display='block'; if (label) label.textContent = url.length>60?url.substring(0,57)+'…':url; };
    img.onerror = () => { if (preview) preview.style.display='none'; };
    img.src = url;
  }
};
window.clearFeaturedImage = () => {
  document.getElementById('postImage').value = '';
  const preview = document.getElementById('featuredPreview');
  const img = document.getElementById('featuredPreviewImg');
  if (preview) preview.style.display = 'none';
  if (img) img.src = '';
  showToast('Featured image cleared.','success');
};
