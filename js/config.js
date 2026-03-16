// ═══════════════════════════════════════════════
// config.js — Firebase init + Remote Config key fetcher
//
// API keys (Groq, Gemini) are stored in Firebase Remote Config.
// They are never hardcoded in this file or committed to GitHub.
//
// HOW TO SET UP (one-time):
//   1. Firebase Console → Remote Config → Add parameter
//   2. Add:  groq_api_key     = gsk_...
//   3. Add:  gemini_api_key   = AIza...
//   4. Click "Publish changes"
//   That's it — keys are fetched securely at runtime.
// ═══════════════════════════════════════════════

import { initializeApp }       from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth }             from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore }        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getRemoteConfig,
         fetchAndActivate,
         getValue }            from "https://www.gstatic.com/firebasejs/10.12.2/firebase-remote-config.js";

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDEUQApHIitL89yXcFq6vEY8yDKZBQYWBY",
  authDomain:        "blogspro-ai.firebaseapp.com",
  projectId:         "blogspro-ai",
  storageBucket:     "blogspro-ai.firebasestorage.app",
  messagingSenderId: "940428277283",
  appId:             "1:940428277283:web:d3bb414f0992718ca76396",
  measurementId:     "G-N7TCB31MRD"
};

const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// ── App constants ─────────────────────────────
export const WORKER_URL       = "https://blogspro-ai.abhishek-dutta1996.workers.dev";
export const IMAGE_WORKER_URL = "https://blogspro-images.abhishek-dutta1996.workers.dev";
export const CLOUDINARY_CLOUD_NAME    = "dldbsidve";
export const CLOUDINARY_UPLOAD_PRESET = "blogspro";

// ── Remote Config — fetches API keys from Firebase ───
// Keys are cached for 1 hour. On first load they are fetched fresh.
// Exported as mutable strings so ai-core.js can read them after init.
export let GROQ_API_KEY   = "";
export let GEMINI_API_KEY = "";

let _keysReady = false;
let _keysPromise = null;

export async function initKeys() {
  // Only fetch once per session
  if (_keysReady) return;
  if (_keysPromise) return _keysPromise;

  _keysPromise = (async () => {
    try {
      const rc = getRemoteConfig(app);

      // Cache keys for 1 hour in production; use 0 for instant refresh during dev
      rc.settings.minimumFetchIntervalMillis = 3600000; // 1 hour

      // Default fallback values — empty means "not configured"
      rc.defaultConfig = {
        groq_api_key:   "",
        gemini_api_key: "",
      };

      await fetchAndActivate(rc);

      GROQ_API_KEY   = getValue(rc, "groq_api_key").asString();
      GEMINI_API_KEY = getValue(rc, "gemini_api_key").asString();
      _keysReady = true;

      console.log("[config] Remote Config loaded.",
        "Groq:", GROQ_API_KEY   ? "configured" : "missing",
        "Gemini:", GEMINI_API_KEY ? "configured" : "missing"
      );
    } catch (err) {
      console.error("[config] Remote Config fetch failed:", err.message);
      // App continues — Cloudflare Worker will still work without fallback keys
    }
  })();

  return _keysPromise;
}

// Auto-init on module load so keys are ready before first AI call
initKeys();

// ── Utilities ─────────────────────────────────

export function showToast(message, type = "info") {
  const t = document.getElementById("toast");
  if (!t) { console.log(`[${type}] ${message}`); return; }
  t.textContent = message;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 3500);
}

export function slugify(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function sanitize(html) {
  if (typeof DOMPurify !== "undefined") {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ["h2","h3","h4","p","strong","em","u","s","ul","ol","li",
                     "blockquote","figure","img","figcaption","a","br","hr",
                     "table","thead","tbody","tr","th","td","sup","sub","code","pre"],
      ALLOWED_ATTR: ["href","src","alt","title","loading","class","target","rel","colspan","rowspan"],
      ALLOW_DATA_ATTR: false
    });
  }
  const div = document.createElement("div");
  div.textContent = html;
  return div.innerHTML;
}

export function stripTags(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

export function cleanEditorHTML(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll("script").forEach(el => el.remove());
  div.querySelectorAll("*").forEach(el => {
    [...el.attributes].forEach(attr => {
      if (attr.name.startsWith("on")) el.removeAttribute(attr.name);
    });
  });
  return div.innerHTML.trim();
}

export function setBtnLoading(btnId, txtId, spinnerId, loading, label) {
  const btn     = document.getElementById(btnId);
  const txt     = document.getElementById(txtId);
  const spinner = document.getElementById(spinnerId);
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    if (txt && !btn.dataset.origLabel) btn.dataset.origLabel = txt.textContent;
    if (txt) txt.textContent = label;
    if (spinner) spinner.style.display = "inline-block";
  } else {
    btn.disabled = false;
    if (txt) txt.textContent = btn.dataset.origLabel || label;
    delete btn.dataset.origLabel;
    if (spinner) spinner.style.display = "none";
  }
}

export function parseAIJson(text) {
  if (!text) return null;
  try {
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s === -1 || e === -1) return null;
    return JSON.parse(text.substring(s, e + 1));
  } catch (err) {
    console.error("Invalid AI JSON:", text);
    return null;
  }
}

export function formatDate(ts) {
  if (!ts) return "-";
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
