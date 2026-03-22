// ═══════════════════════════════════════════════
// images-upload.js — Multi-cloud upload (GCS + Cloudinary)
// ═══════════════════════════════════════════════
import { uploadToStorage as cloudStorageUpload } from './cloud-storage.js';
import { showToast } from './config.js';

// Re-export unified storage upload function
export async function uploadToStorage(file, folder = 'content', onProgress = null) {
  return cloudStorageUpload(file, folder, onProgress);
}

export async function blobUrlToFile(blobUrl, filename) {
  const res  = await fetch(blobUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}

export function setUploadProgress(visible, label='', pct=0) {
  const wrap  = document.getElementById('uploadProgress');
  if (!wrap) return;
  wrap.style.display = visible ? 'block' : 'none';
  const lbl   = document.getElementById('uploadProgressLabel');
  const pctEl = document.getElementById('uploadProgressPct');
  const fill  = document.getElementById('uploadProgressFill');
  if (lbl)   lbl.textContent   = label;
  if (pctEl) pctEl.textContent = pct + '%';
  if (fill)  fill.style.width  = pct + '%';
}

// ── Handle own photo upload ────────────────────
window.handleOwnPhotoUpload = async (files) => {
  if (!files?.length) return;
  const grid = document.getElementById('uploadedImgGrid');
  if (grid) grid.style.display = 'grid';

  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue;
    const idx     = state.generatedImages.length;
    const blobUrl = URL.createObjectURL(file);
    state.generatedImages[idx] = blobUrl;

    const card = document.createElement('div');
    card.className = 'img-preview-card';
    card.innerHTML = `
      <div class="img-num">📁 ${file.name.substring(0,10)}${file.name.length>10?'…':''}<span class="storage-badge uploading" id="sb${idx}">↑ uploading</span></div>
      <img src="${blobUrl}" style="width:100%;height:120px;object-fit:cover;display:block;cursor:pointer" onclick="openImgModal(${idx})" />
      <div class="img-overlay"><button class="img-overlay-btn" onclick="openImgModal(${idx})">🔍</button><button class="img-overlay-btn secondary" onclick="insertImage(${idx})">↓ Insert</button></div>
      <button onclick="deleteImgCard(this,${idx})" style="position:absolute;top:4px;right:4px;background:rgba(8,13,26,0.85);border:1px solid rgba(239,68,68,0.5);color:#fca5a5;width:22px;height:22px;border-radius:50%;font-size:0.75rem;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;line-height:1">✕</button>`;
    grid?.appendChild(card);
    setUploadProgress(true, `Uploading "${file.name}"…`, 0);

    try {
      const url = await uploadToStorage(file, 'content', pct => setUploadProgress(true, `Uploading "${file.name}"… ${pct}%`, pct));
      URL.revokeObjectURL(blobUrl);
      state.generatedImages[idx] = url;
      const badge = document.getElementById(`sb${idx}`);
      if (badge) { badge.textContent='✓ saved'; badge.classList.remove('uploading'); }
      setUploadProgress(false);
      showToast(`"${file.name}" uploaded!`, 'success');
    } catch(err) {
      const badge = document.getElementById(`sb${idx}`);
      if (badge) { badge.textContent='⚠ local'; badge.style.color='#fca5a5'; badge.classList.remove('uploading'); }
      setUploadProgress(false);
    }
  }
};

window.uploadFeaturedImage = async (input) => {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const blobUrl = URL.createObjectURL(file);
  document.getElementById('postImage').value = blobUrl;
  window.updateFeaturedPreview?.(blobUrl);
  try {
    const url = await uploadToStorage(file, 'featured', () => {});
    URL.revokeObjectURL(blobUrl);
    document.getElementById('postImage').value = url;
    window.updateFeaturedPreview?.(url);
    showToast('Featured image uploaded!','success');
  } catch(err) {
    showToast('Upload failed — using local preview. ' + err.message,'error');
  }
};
