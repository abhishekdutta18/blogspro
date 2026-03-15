// ═══════════════════════════════════════════════
// ai-images.js — AI image generation
// ═══════════════════════════════════════════════
import { IMAGE_WORKER_URL, sanitize, showToast } from './config.js';
import { state }        from './state.js';
import { updateWordCount } from './editor.js';
import { uploadToStorage, blobUrlToFile } from './images-upload.js';

async function fetchImageViaWorker(prompt, style, seed) {
  const provider = document.getElementById('imgProvider')?.value || 'auto';
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 120000);
    const res = await fetch(IMAGE_WORKER_URL, {
      method:'POST', signal:controller.signal,
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ prompt, style, seed, provider, width:state.imgSelectedW, height:state.imgSelectedH })
    });
    clearTimeout(timeout);
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size >= 500) return URL.createObjectURL(blob);
      throw new Error('Response too small');
    }
    let errMsg = `Worker HTTP ${res.status}`;
    try { const d=await res.json(); errMsg=d.error||errMsg; } catch(_) {}
    throw new Error(errMsg);
  } catch(workerErr) {
    const reason = workerErr.name==='AbortError' ? 'Timed out' : workerErr.message;
    console.warn(`Image worker failed (${reason}), trying Pollinations…`);
    const encoded = encodeURIComponent(`${prompt}, ${style}, high resolution, no text, no watermark`);
    const directUrl = `https://image.pollinations.ai/prompt/${encoded}?width=${Math.min(state.imgSelectedW,1024)}&height=${Math.min(state.imgSelectedH,1024)}&seed=${seed}&nologo=true&model=flux`;
    return new Promise((resolve, reject) => {
      const img = new Image();
      const t   = setTimeout(() => { img.src=''; reject(new Error(`Both worker and Pollinations failed`)); }, 45000);
      img.onload  = () => { clearTimeout(t); resolve(directUrl); };
      img.onerror = () => { clearTimeout(t); reject(new Error('Pollinations also failed')); };
      img.src = directUrl;
    });
  }
}

window.generateImages = async () => {
  if (state.isGeneratingImages) return;
  const prompt = document.getElementById('imgPrompt')?.value.trim();
  if (!prompt) { showToast('Please enter a prompt.','error'); return; }

  state.isGeneratingImages = true;
  const btn     = document.getElementById('btnGenImg');
  const btnTxt  = document.getElementById('genImgBtnText');
  const spinner = document.getElementById('genImgSpinner');
  const status  = document.getElementById('imgGenStatus');
  const grid    = document.getElementById('imgPreviewGrid');
  const banner  = document.getElementById('imgInsertedBanner');

  if (btn)    btn.disabled = true;
  if (btnTxt) btnTxt.textContent = 'Generating…';
  if (spinner)spinner.style.display = 'inline-block';
  if (banner) banner.style.display = 'none';
  if (grid)   grid.style.display = 'grid';
  state.generatedImages = [];

  const startTime = Date.now();
  const timerInterval = setInterval(() => {
    const t = status?.querySelector('span');
    if (t) t.textContent = `⏱ ${((Date.now()-startTime)/1000).toFixed(1)}s`;
  }, 100);

  if (status) status.innerHTML = `⏳ Generating ${state.imgSelectedCount} image(s)… <span style="color:var(--muted);font-size:0.65rem">⏱ 0.0s</span>`;
  if (grid)   grid.innerHTML = '';

  const seeds = Array.from({length:state.imgSelectedCount}, () => Math.floor(Math.random()*99999)+1);
  seeds.forEach((_,i) => {
    if (grid) grid.innerHTML += `<div class="img-preview-card" id="imgCard${i}">
      <div class="img-num">IMG ${i+1}</div>
      <div class="img-loading" id="imgLoading${i}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(136,150,179,0.4)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></div>
      <img id="imgEl${i}" src="" style="display:none;width:100%;height:120px;object-fit:cover"/>
      <div class="img-overlay"><button class="img-overlay-btn" onclick="openImgModal(${i})">🔍 Preview</button><button class="img-overlay-btn secondary" onclick="insertImage(${i})">↓ Insert</button></div>
      <button onclick="deleteImgCard(this,${i})" style="position:absolute;top:4px;right:4px;background:rgba(8,13,26,0.85);border:1px solid rgba(239,68,68,0.5);color:#fca5a5;width:22px;height:22px;border-radius:50%;font-size:0.75rem;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;line-height:1">✕</button>
    </div>`;
  });

  let loaded = 0, failed = 0;
  for (let i=0; i<seeds.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 2500));
    if (status) status.innerHTML = `⏳ Generating image ${i+1} of ${state.imgSelectedCount}… <span style="color:var(--muted);font-size:0.65rem">⏱ ${((Date.now()-startTime)/1000).toFixed(1)}s</span>`;
    const imgStart = Date.now();
    try {
      const blobUrl = await fetchImageViaWorker(prompt, state.imgSelectedStyle, seeds[i]);
      const imgSec  = ((Date.now()-imgStart)/1000).toFixed(1);
      state.generatedImages[i] = blobUrl;
      const el = document.getElementById(`imgEl${i}`);
      const ld = document.getElementById(`imgLoading${i}`);
      if (el && ld) { el.src=blobUrl; el.style.display='block'; ld.style.display='none'; }
      const badge = document.createElement('div');
      badge.style.cssText = 'position:absolute;bottom:5px;right:5px;background:rgba(8,13,26,0.75);color:var(--green);font-size:0.6rem;font-weight:700;padding:0.15rem 0.4rem;border-radius:2px;pointer-events:none';
      badge.textContent = `${imgSec}s`;
      document.getElementById(`imgCard${i}`)?.appendChild(badge);
      loaded++;
    } catch(err) {
      const ld = document.getElementById(`imgLoading${i}`);
      if (ld) ld.innerHTML = `<span style="font-size:0.68rem;color:#fca5a5;padding:0 0.4rem;text-align:center">✕ ${err.message||'Failed'}</span>`;
      failed++;
    }
  }

  clearInterval(timerInterval);
  const totalSec = ((Date.now()-startTime)/1000).toFixed(1);
  if (btn)    { btn.disabled=false; }
  if (btnTxt) btnTxt.textContent = '🖼 Regenerate';
  if (spinner)spinner.style.display = 'none';
  state.isGeneratingImages = false;

  if (loaded > 0) {
    if (status) status.innerHTML = `✓ ${loaded} image(s) ready${failed?` (${failed} failed)`:''} — click to insert. <span style="color:var(--muted);font-size:0.65rem">⏱ ${totalSec}s</span>`;
    showToast(`${loaded} image(s) ready!`,'success');
  } else {
    if (status) status.innerHTML = `✕ All images failed. <span style="color:var(--muted);font-size:0.65rem">⏱ ${totalSec}s</span>`;
    showToast('Image generation failed.','error');
  }
};

window.insertImage = (idx) => {
  const url = state.generatedImages[idx];
  if (!url) { showToast('Image not ready.','error'); return; }
  const caption = (document.getElementById('imgPrompt')?.value.trim()||'').substring(0,80);
  const html = `<figure style="margin:1.5rem 0;text-align:center"><img src="${url}" alt="${caption}" style="max-width:100%;border-radius:4px;border:1px solid rgba(201,168,76,0.15)" loading="lazy"/></figure>`;
  const editor = document.getElementById('editor');
  editor?.focus();
  const sel = window.getSelection();
  if (sel?.rangeCount) {
    const range = sel.getRangeAt(0); range.collapse(false);
    range.insertNode(range.createContextualFragment(sanitize(html)));
  } else { if (editor) editor.innerHTML += sanitize(html); }
  updateWordCount();
  const banner = document.getElementById('imgInsertedBanner');
  if (banner) { banner.style.display='block'; setTimeout(()=>banner.style.display='none',3000); }
  showToast('Image inserted!','success');
};

window.setFeatured = (idx) => {
  const url = state.generatedImages[idx];
  if (!url) { showToast('Not ready.','error'); return; }
  document.getElementById('postImage').value = url;
  window.updateFeaturedPreview?.(url);
  showToast('Featured image set!','success');
};

window.deleteImgCard = (btn, idx) => {
  const card = btn.closest('.img-preview-card');
  if (!card) return;
  card.style.transition='all 0.2s'; card.style.opacity='0'; card.style.transform='scale(0.9)';
  setTimeout(() => { card.remove(); state.generatedImages[idx]=null; }, 200);
};

window.openImgModal = (idx) => {
  const url = state.generatedImages[idx];
  if (!url) return;
  state.currentModalImgUrl = url;
  const src  = document.getElementById('imgModalSrc');
  const dl   = document.getElementById('imgModalDownload');
  const modal= document.getElementById('imgModal');
  if (src)   src.src  = url;
  if (dl)    dl.href  = url;
  if (modal) modal.classList.add('open');
};

window.closeImgModal = (e) => {
  if (e && e.target !== document.getElementById('imgModal')) return;
  document.getElementById('imgModal')?.classList.remove('open');
};

window.insertImageFromModal = () => {
  const idx = state.generatedImages.indexOf(state.currentModalImgUrl);
  if (idx >= 0) window.insertImage(idx);
  else {
    const editor = document.getElementById('editor');
    if (editor) editor.innerHTML += sanitize(`<figure style="margin:1.5rem 0;text-align:center"><img src="${state.currentModalImgUrl}" alt="AI image" style="max-width:100%;border-radius:4px" loading="lazy"/></figure>`);
    updateWordCount(); showToast('Image inserted!','success');
  }
  document.getElementById('imgModal')?.classList.remove('open');
};

window.setFeaturedFromModal = () => {
  document.getElementById('postImage').value = state.currentModalImgUrl;
  window.updateFeaturedPreview?.(state.currentModalImgUrl);
  document.getElementById('imgModal')?.classList.remove('open');
  showToast('Featured image set!','success');
};

window.generateFeaturedImage = async () => {
  const title = document.getElementById('postTitle')?.value || document.getElementById('aiPrompt')?.value;
  if (!title) { showToast('Add a title or topic first.','error'); return; }
  showToast('Generating featured image…','success');
  const seed   = Math.floor(Math.random()*999999)+1;
  const prompt = `Professional fintech editorial cover image for: "${title}". Dark corporate style, glowing data visualizations, no text in image.`;
  try {
    const url = await fetchImageViaWorker(prompt, 'photorealistic', seed);
    document.getElementById('postImage').value = url;
    window.updateFeaturedPreview?.(url);
    showToast('Featured image generated!','success');
  } catch(e) { showToast('Image generation failed: ' + e.message,'error'); }
};

window.autoFillImagePrompt = () => {
  const topic = document.getElementById('aiPrompt')?.value.trim() || document.getElementById('postTitle')?.value.trim();
  if (!topic) { showToast('Add a topic first.','error'); return; }
  const el = document.getElementById('imgPrompt');
  if (el) el.value = `Professional fintech editorial illustration for "${topic}", modern dark UI, glowing blue data visualizations, corporate style, no text`;
  showToast('Prompt auto-filled!','success');
};

window.selectStyle = (btn) => {
  document.querySelectorAll('.img-style-btn').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  state.imgSelectedStyle = btn.dataset.style;
};
window.selectRatio = (btn) => {
  document.querySelectorAll('.img-ratio-btn[data-w]').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  state.imgSelectedW = parseInt(btn.dataset.w);
  state.imgSelectedH = parseInt(btn.dataset.h);
};
window.selectCount = (btn) => {
  document.querySelectorAll('.img-ratio-btn[data-count]').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  state.imgSelectedCount = parseInt(btn.dataset.count);
};
window.onImgProviderChange = (val) => {
  const info = { auto:'⚡ Auto tries Cloudflare AI → HuggingFace → Pollinations.', cloudflare:'✓ Cloudflare Workers AI — Flux Schnell.', huggingface:'✓ Hugging Face — Flux Schnell.', pollinations:'✓ Pollinations.ai — Zero setup.' };
  const el = document.getElementById('imgProviderInfo');
  if (el) el.textContent = info[val] || info.auto;
};
