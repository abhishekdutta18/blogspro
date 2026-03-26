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
import { workerFetch } from './worker-endpoints.js';

const AUTO_IMAGE_PROVIDER_CHAIN = ['google', 'pollinations', 'huggingface', 'cloudflare'];

function pollinationsUrl(prompt, w, h, seed = null) {
  const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&enhance=true`;
  return seed ? `${base}&seed=${seed}` : base;
}

function getSelectedImgProvider() {
  return document.getElementById('imgProvider')?.value || 'auto';
}

window.onImgProviderChange = function(provider) {
  const info = document.getElementById('imgProviderInfo');
  if (!info) return;
  if (provider === 'auto') {
    info.textContent = 'Auto tries Google Imagen → Pollinations → Hugging Face → Cloudflare.';
    return;
  }
  const names = {
    google: 'Google Imagen',
    pollinations: 'Pollinations.ai',
    huggingface: 'Hugging Face',
    cloudflare: 'Cloudflare Workers AI',
  };
  info.textContent = `Using ${names[provider] || provider} only.`;
};

async function requestImageFromWorker(provider, prompt, w, h) {
  const res = await workerFetch('api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      prompt,
      type: 'image',
      width: w,
      height: h,
      model: provider === 'google' ? 'imagen-3.0-generate-002' : undefined
    })
  });
  if (!res.ok) throw new Error(`${provider} failed (${res.status})`);
  const data = await res.json();
  const url = data?.image || data?.url || data?.result || data?.data?.url || '';
  if (!url || !/^https?:\/\//i.test(url)) throw new Error(`${provider} returned invalid image URL`);
  return url;
}

async function generateImageUrl(prompt, provider, w, h) {
  const providers = provider === 'auto' ? AUTO_IMAGE_PROVIDER_CHAIN : [provider];
  for (const p of providers) {
    try {
      if (p === 'pollinations') {
        const seed = Math.floor(Math.random() * 999999);
        return pollinationsUrl(prompt, w, h, seed);
      }
      return await requestImageFromWorker(p, prompt, w, h);
    } catch (err) {
      console.warn('Image provider failed:', p, err.message);
    }
  }
  // Last-resort direct generation so UI still works even if worker is down.
  const seed = Math.floor(Math.random() * 999999);
  return pollinationsUrl(prompt, w, h, seed);
}

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
  const provider = getSelectedImgProvider();
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
    let url = '';

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
    try {
      url = await generateImageUrl(fullPrompt, provider, w, h);
    } catch (_) {
      const seed = Math.floor(Math.random() * 999999);
      url = pollinationsUrl(fullPrompt, w, h, seed);
    }

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

  // FIX: Ensure editor is focused before inserting to preserve selection
  editor.focus();

  // Insert at cursor position if editor is focused, else append to end
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const frag = document.createDocumentFragment();
    frag.appendChild(img);
    // Add a space or newline after image for easier typing
    frag.appendChild(document.createTextNode('\u00A0'));
    range.insertNode(frag);
    range.setStartAfter(img);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    editor.appendChild(img);
  }
  if (typeof window.updateWordCount === 'function') window.updateWordCount();
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
  const modal    = document.getElementById('imgModal');
  const img      = document.getElementById('imgModalSrc');
  const download = document.getElementById('imgModalDownload');
  if (img)      img.src  = url;
  if (download) download.href = url;
  if (modal)    modal.classList.add('open');
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
  const wrap = document.getElementById('featuredPreview');
  const img  = document.getElementById('featuredPreviewImg');
  const lbl  = document.getElementById('featuredPreviewLabel');
  if (!wrap) return;
  if (url) {
    if (img) { img.src = url; img.style.display = 'block'; }
    wrap.style.display = 'block';
    if (lbl) lbl.textContent = url.length > 60 ? url.slice(0, 57) + '…' : url;
  } else {
    if (img) { img.src = ''; img.style.display = 'none'; }
    wrap.style.display = 'none';
    if (lbl) lbl.textContent = '';
  }
};


// ─────────────────────────────────────────────
// Preview Post — opens post.html in new tab
// ─────────────────────────────────────────────
window.previewPost = function() {
  const title   = document.getElementById('postTitle')?.value   || '(Draft)';
  const content = document.getElementById('editor')?.innerHTML  || '';
  const image   = document.getElementById('postImage')?.value   || '';
  const excerpt = document.getElementById('postExcerpt')?.value || '';

  // FEATURE 10: Always use Live Blob Preview for instant feedback with premium dark theme
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Preview: ${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root { --gold: #c9a84c; --navy: #080d1a; --border: rgba(255,255,255,0.1); }
  body{font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:800px;margin:0 auto;padding:3rem 1.5rem;background:var(--navy);color:#f5f0e8;line-height:1.7}
  h1{font-family:Georgia,serif;font-size:2.5rem;margin-bottom:0.5rem;color:#fff}
  h2{font-family:Georgia,serif;font-size:1.8rem;margin-top:2.5rem;color:var(--gold);border-bottom:1px solid var(--border);padding-bottom:0.5rem}
  h3{font-family:Georgia,serif;font-size:1.3rem;color:#fff;margin-top:1.5rem}
  img{max-width:100%;border-radius:8px;margin:1.5rem 0;box-shadow:0 10px 30px rgba(0,0,0,0.5)}
  blockquote{border-left:4px solid var(--gold);margin:1.5rem 0;padding:1rem 1.5rem;background:rgba(201,168,76,0.05);font-style:italic;color:#e2c97e}
  a{color:var(--gold);text-decoration:underline}
  table{width:100%;border-collapse:collapse;margin:1.5rem 0;background:rgba(255,255,255,0.03);border:1px solid var(--border)}
  th,td{border:1px solid var(--border);padding:12px;text-align:left}
  th{background:rgba(201,168,76,0.1);color:var(--gold);font-weight:700}
  .meta{color:#8896b3;font-size:0.9rem;margin-bottom:2rem;text-transform:uppercase;letter-spacing:0.1em}
  .featured{width:100%;max-height:450px;object-fit:cover;border-radius:10px;margin-bottom:2rem}
  .excerpt{font-size:1.2rem;color:#c9d1d9;margin-bottom:2.5rem;line-height:1.6;font-style:italic;opacity:0.9}
  .bp-references-block{margin-top:4rem;padding:2rem;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid var(--border);border-left:4px solid var(--gold)}
  .bp-references-block h2{margin-top:0;border:none}
</style></head><body>
<div class="meta">BlogsPro Draft Preview</div>
<h1>${title}</h1>
${image ? `<img class="featured" src="${image}" alt="${title}">` : ''}
${excerpt ? `<div class="excerpt">${excerpt}</div>` : ''}
<div class="content">${content}</div>
<div style="margin-top:5rem;padding-top:2rem;border-top:1px solid var(--border);text-align:center;font-size:0.8rem;color:#8896b3">
  End of Preview — This post is not yet published.
</div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const w    = window.open(url, '_blank');
  if (w) setTimeout(() => URL.revokeObjectURL(url), 15000);
  showToast('Live preview generated!', 'success');
};


function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
