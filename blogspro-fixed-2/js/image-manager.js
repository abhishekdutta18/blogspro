// ═══════════════════════════════════════════════
// image-manager.js — All image drawer functions
// Fixes: selectStyle, selectRatio, selectCount,
//        autoFillImagePrompt, generateImages,
//        previewPost, updateFeaturedPreview,
//        openImgModal, closeImgModal, deleteImgCard,
//        insertImage (drawer version)
// ═══════════════════════════════════════════════
import { state }                  from './state.js';
import { showToast }              from './config.js';
import { uploadToStorage, blobUrlToFile } from './images-upload.js';

const IMAGE_API_PROVIDERS = [
  { name: 'pollinations', url: (prompt, w, h) =>
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&enhance=true` },
];

// ─────────────────────────────────────────────
// Style / ratio / count selectors
// ─────────────────────────────────────────────
window.selectStyle = function(btn) {
  document.querySelectorAll('.img-style-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.imgSelectedStyle = btn.dataset.style || 'photorealistic';
};

window.selectRatio = function(btn) {
  document.querySelectorAll('.img-ratio-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.imgSelectedW = parseInt(btn.dataset.w) || 1280;
  state.imgSelectedH = parseInt(btn.dataset.h) || 720;
};

window.selectCount = function(btn) {
  document.querySelectorAll('[data-count]').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.imgSelectedCount = parseInt(btn.dataset.count) || 2;
};

// ─────────────────────────────────────────────
// Auto-fill image prompt from article topic
// ─────────────────────────────────────────────
window.autoFillImagePrompt = function() {
  const topic = document.getElementById('v2TopicPrompt')?.value.trim()
             || document.getElementById('aiPrompt')?.value.trim()
             || document.getElementById('postTitle')?.value.trim()
             || '';
  const style = state.imgSelectedStyle || 'photorealistic';
  const input = document.getElementById('imgPrompt');
  if (!input) return;
  if (!topic) { showToast('Enter a topic or title first.', 'error'); return; }
  input.value = `${topic}, ${style}, high quality, professional, detailed`;
  showToast('Prompt auto-filled!', 'success');
};

// ─────────────────────────────────────────────
// Generate images — uses Pollinations API (free, no key needed)
// Falls back to placeholder on error
// ─────────────────────────────────────────────
window.generateImages = async function() {
  const promptInput = document.getElementById('imgPrompt');
  const prompt      = promptInput?.value.trim();
  if (!prompt) { showToast('Enter an image prompt first.', 'error'); return; }

  const style  = state.imgSelectedStyle || 'photorealistic';
  const w      = state.imgSelectedW     || 1280;
  const h      = state.imgSelectedH     || 720;
  const count  = state.imgSelectedCount || 2;
  const fullPrompt = `${prompt}, ${style}`;

  const btn    = document.getElementById('btnGenImg');
  const grid   = document.getElementById('uploadedImgGrid');
  const status = document.getElementById('imgGenStatus');

  if (btn)    { btn.disabled = true; btn.querySelector('span')?.textContent === undefined || (btn.textContent = '⏳ Generating…'); }
  if (status) status.textContent = `⏳ Generating ${count} image(s)…`;
  if (grid)   grid.style.display = 'grid';

  state.isGeneratingImages = true;

  for (let i = 0; i < count; i++) {
    const idx  = state.generatedImages.length;
    // Add a seed for variation
    const seed = Math.floor(Math.random() * 999999);
    const url  = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true&enhance=true`;

    // Placeholder card while loading
    const card = document.createElement('div');
    card.className = 'img-preview-card';
    card.style.position = 'relative';
    card.innerHTML = `
      <div style="font-size:0.65rem;color:var(--muted);padding:4px 6px;display:flex;justify-content:space-between;align-items:center">
        <span>Image ${i + 1}/${count}</span>
        <span id="sb${idx}" class="storage-badge uploading">⏳ loading</span>
      </div>
      <div id="imgWrap${idx}" style="width:100%;height:120px;background:var(--navy2);border-radius:3px;display:flex;align-items:center;justify-content:center">
        <span style="font-size:1.5rem;animation:pulse 1s infinite">🎨</span>
      </div>
      <div class="img-overlay" style="opacity:0">
        <button class="img-overlay-btn" onclick="openImgModal(${idx})">🔍</button>
        <button class="img-overlay-btn secondary" onclick="insertGeneratedImage(${idx})">↓ Insert</button>
      </div>
      <button onclick="deleteImgCard(this,${idx})" style="position:absolute;top:4px;right:4px;background:rgba(8,13,26,0.85);border:1px solid rgba(239,68,68,0.5);color:#fca5a5;width:22px;height:22px;border-radius:50%;font-size:0.75rem;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10">✕</button>`;
    grid?.appendChild(card);
    state.generatedImages.push(null); // reserve slot

    // Load image
    const img = new Image();
    img.onload = () => {
      state.generatedImages[idx] = url;
      const wrap  = document.getElementById(`imgWrap${idx}`);
      const badge = document.getElementById(`sb${idx}`);
      const overlay = card.querySelector('.img-overlay');
      if (wrap) {
        wrap.innerHTML = `<img src="${url}" style="width:100%;height:120px;object-fit:cover;display:block;cursor:pointer;border-radius:3px" onclick="openImgModal(${idx})"/>`;
      }
      if (badge)   { badge.textContent = '✓ ready'; badge.classList.remove('uploading'); }
      if (overlay) overlay.style.opacity = '1';
    };
    img.onerror = () => {
      const badge = document.getElementById(`sb${idx}`);
      const wrap  = document.getElementById(`imgWrap${idx}`);
      if (badge) { badge.textContent = '✕ failed'; badge.style.color = '#fca5a5'; badge.classList.remove('uploading'); }
      if (wrap)  wrap.innerHTML = `<div style="color:#fca5a5;font-size:0.75rem;padding:1rem;text-align:center">✕ Load failed</div>`;
    };
    img.src = url;

    if (i < count - 1) await _sleep(300);
  }

  if (status) status.textContent = `✓ ${count} image(s) ready`;
  if (btn)    { btn.disabled = false; btn.innerHTML = '<span>✦ Generate Images</span>'; }
  state.isGeneratingImages = false;
  showToast(`${count} image(s) generated!`, 'success');
};


// ─────────────────────────────────────────────
// Insert generated image into editor
// ─────────────────────────────────────────────
window.insertGeneratedImage = function(idx) {
  const url    = state.generatedImages[idx];
  if (!url)  { showToast('Image not ready yet.', 'error'); return; }
  const editor = document.getElementById('editor');
  if (!editor) return;
  const img = document.createElement('img');
  img.src   = url;
  img.style.cssText = 'max-width:100%;height:auto;margin:1rem 0;display:block;border-radius:4px';
  img.alt   = document.getElementById('imgPrompt')?.value.trim() || 'Generated image';
  editor.appendChild(img);
  showToast('Image inserted!', 'success');
};

// Legacy name used by some onclick handlers
window.insertImage = window.insertGeneratedImage;


// ─────────────────────────────────────────────
// Image preview modal
// ─────────────────────────────────────────────
window.openImgModal = function(idx) {
  const url = state.generatedImages[idx];
  if (!url) return;
  state.currentModalImgUrl = url;
  const modal = document.getElementById('imgModal');
  const img   = document.getElementById('imgModalImg');
  if (img)   img.src = url;
  if (modal) modal.classList.add('open');
};

window.closeImgModal = function(e) {
  if (!e || e.target === document.getElementById('imgModal') || e.currentTarget === document.getElementById('imgModal')) {
    document.getElementById('imgModal')?.classList.remove('open');
  }
};

window.insertModalImage = function() {
  const url    = state.currentModalImgUrl;
  if (!url) return;
  const editor = document.getElementById('editor');
  if (!editor) return;
  const img = document.createElement('img');
  img.src   = url;
  img.style.cssText = 'max-width:100%;height:auto;margin:1rem 0;display:block;border-radius:4px';
  editor.appendChild(img);
  document.getElementById('imgModal')?.classList.remove('open');
  showToast('Image inserted into article!', 'success');
};


// ─────────────────────────────────────────────
// Delete image card
// ─────────────────────────────────────────────
window.deleteImgCard = function(btn, idx) {
  btn.closest('.img-preview-card')?.remove();
  if (idx !== undefined) state.generatedImages[idx] = null;
};


// ─────────────────────────────────────────────
// Featured image preview
// ─────────────────────────────────────────────
window.updateFeaturedPreview = function(url) {
  const preview = document.getElementById('featuredPreview');
  const wrap    = document.getElementById('featuredPreviewWrap');
  if (!preview) return;
  if (url) {
    preview.src             = url;
    preview.style.display   = 'block';
    if (wrap) wrap.style.display = 'block';
  } else {
    preview.src             = '';
    preview.style.display   = 'none';
    if (wrap) wrap.style.display = 'none';
  }
};


// ─────────────────────────────────────────────
// Preview Post — opens post.html in new tab
// ─────────────────────────────────────────────
window.previewPost = async function() {
  const { state: s } = await import('./state.js');
  if (s.editingPostId) {
    window.open(`/post.html?id=${s.editingPostId}`, '_blank');
    return;
  }
  // Not saved yet — build a live preview blob
  const title   = document.getElementById('postTitle')?.value   || '(Draft)';
  const content = document.getElementById('editor')?.innerHTML  || '';
  const image   = document.getElementById('postImage')?.value   || '';
  const excerpt = document.getElementById('postExcerpt')?.value || '';
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${title}</title>
<style>
  body{font-family:Georgia,serif;max-width:760px;margin:0 auto;padding:2rem;background:#f9f7f2;color:#1a1a1a;line-height:1.75}
  h1{font-size:2rem;margin-bottom:0.5rem}
  h2{font-size:1.4rem;margin-top:2rem;color:#2d2d2d}
  h3{font-size:1.1rem;color:#444}
  img{max-width:100%;border-radius:6px;margin:1rem 0}
  blockquote{border-left:3px solid #c9a84c;margin:1rem 0;padding:0.5rem 1rem;background:#fffbe6}
  a{color:#c9a84c}
  .meta{color:#888;font-size:0.85rem;margin-bottom:1.5rem}
  .featured{width:100%;max-height:400px;object-fit:cover;border-radius:8px;margin-bottom:1.5rem}
</style></head><body>
<h1>${title}</h1>
<div class="meta">Draft Preview</div>
${image ? `<img class="featured" src="${image}" alt="${title}">` : ''}
${excerpt ? `<p><em>${excerpt}</em></p>` : ''}
${content}
</body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const w    = window.open(url, '_blank');
  if (w) setTimeout(() => URL.revokeObjectURL(url), 8000);
  showToast('Preview opened in new tab!', 'success');
};


function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
