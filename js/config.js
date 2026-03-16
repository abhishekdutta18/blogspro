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
  ALLOWED_ATTR: ['href','src','alt','title','loading','class','target','rel','colspan','rowspan'],
  ALLOW_DATA_ATTR: false
};
export function sanitize(html) {
  if (typeof DOMPurify !== 'undefined') return DOMPurify.sanitize(html, PURIFY_CONFIG);
  // DOMPurify not yet available — log and strip all tags as a safe fallback.
  // This should only happen in a race condition on very slow connections.
  console.error('DOMPurify not available — falling back to tag stripping.');
  return html.replace(/<[^>]*>/g, '');
}

// ── Shared AI JSON parser ─────────────────────
// Extracts and parses the first JSON object found in an AI response string.
// Use this everywhere instead of repeating the indexOf('{') pattern.
export function parseAIJson(text) {
  if (!text) return null;
  try {
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s !== -1 && e !== -1) return JSON.parse(text.substring(s, e + 1));
  } catch(_) {}
  return null;
}

// ── Shared utilities ──────────────────────────

export function cleanEditorHTML(rawHtml) {
  const div = document.createElement('div');
  div.innerHTML = rawHtml;
  div.querySelectorAll('span').forEach(span => {
    if (!span.className && !span.style.cssText && !span.getAttribute('data-id')) {
      const frag = document.createDocumentFragment();
      while (span.firstChild) frag.appendChild(span.firstChild);
      span.replaceWith(frag);
    }
  });
  div.querySelectorAll('b').forEach(el => { const s = document.createElement('strong'); s.innerHTML = el.innerHTML; el.replaceWith(s); });
  div.querySelectorAll('i').forEach(el => { const e = document.createElement('em'); e.innerHTML = el.innerHTML; el.replaceWith(e); });
  div.querySelectorAll('p').forEach(p => { if (!p.textContent.trim() && !p.querySelector('img,br')) p.remove(); });
  return div.innerHTML;
}

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

export function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds*1000 : ts);
  return d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
}
