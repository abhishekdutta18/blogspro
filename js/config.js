// ═══════════════════════════════════════════════
// config.js — Firebase, constants, DOMPurify, utils
// ═══════════════════════════════════════════════
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDEUQApHIitL89yXcFq6vEY8yDKZBQYWBY",
  authDomain:        "blogspro-ai.firebaseapp.com",
  projectId:         "blogspro-ai",
  storageBucket:     "blogspro-ai.firebasestorage.app",
  messagingSenderId: "940428277283",
  appId:             "1:940428277283:web:d3bb414f0992718ca76396"
};

export const WORKER_URL       = "https://blogspro-ai.abhishek-dutta1996.workers.dev";
export const IMAGE_WORKER_URL = "https://blogspro-images.abhishek-dutta1996.workers.dev";
export const CLOUDINARY_CLOUD_NAME    = "dldbsidve";
export const CLOUDINARY_UPLOAD_PRESET = "blogspro";

const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// ── DOMPurify ─────────────────────────────────
const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['h2','h3','h4','p','strong','em','u','s','ul','ol','li',
                 'blockquote','figure','img','figcaption','a','br','hr',
                 'table','thead','tbody','tr','th','td','sup','sub','code','pre'],
  ALLOWED_ATTR: ['href','src','alt','title','style','loading','class','target','rel','colspan','rowspan'],
  ALLOW_DATA_ATTR: false
};
export function sanitize(html) {
  return typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html, PURIFY_CONFIG) : html;
}

// ── Shared utilities ──────────────────────────
export function slugify(str) {
  return str.toLowerCase().trim()
    .replace(/[^\w\s-]/g,'').replace(/[\s_-]+/g,'-').replace(/^-+|-+$/g,'');
}

export function stripTags(str) {
  return str.replace(/<[^>]*>/g,'');
}

export function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}

export function setBtnLoading(btnId, txtId, spinnerId, loading, loadingText='') {
  const btn = document.getElementById(btnId);
  const txt = document.getElementById(txtId);
  const sp  = document.getElementById(spinnerId);
  if (btn) btn.disabled = loading;
  if (txt && loadingText) txt.textContent = loadingText;
  if (sp) sp.style.display = loading ? 'inline-block' : 'none';
}
