// ═══════════════════════════════════════
// config.js — Final Utilities + Local DB
// ═══════════════════════════════════════

// Toast / notification
export function showToast(message, type = "info") {
  const t = document.getElementById("toast");
  if (!t) { console.log(`[${type}] ${message}`); return; }
  t.textContent = message;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 3500);
}

// Slug generator
export function slugify(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")     // collapse consecutive hyphens
    .replace(/^-+|-+$/g, "");   // trim leading/trailing hyphens
}

// FIX: renamed escapeText — converts plain text to safe HTML entities.
// This does NOT sanitize HTML input. Use DOMPurify for that.
export function escapeText(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Keep sanitize as an alias for backwards compatibility,
// but it only escapes plain text — not a full HTML sanitizer.
export function sanitize(text) {
  return escapeText(text);
}

// Remove HTML tags completely
export function stripTags(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

// Clean editor HTML safely
export function cleanEditorHTML(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  // Remove script tags
  div.querySelectorAll("script").forEach(el => el.remove());
  // Remove inline JS events
  div.querySelectorAll("*").forEach(el => {
    [...el.attributes].forEach(attr => {
      if (attr.name.startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    });
  });
  return div.innerHTML.trim();
}

// Button loading helper
export function setBtnLoading(btnId, txtId, spinnerId, loading, label) {
  const btn = document.getElementById(btnId);
  const txt = document.getElementById(txtId);
  const spinner = document.getElementById(spinnerId);
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    // Store original label so we can restore it on unload
    if (txt && !btn.dataset.origLabel) btn.dataset.origLabel = txt.textContent;
    if (txt) txt.textContent = label;
    if (spinner) spinner.style.display = "inline-block";
  } else {
    btn.disabled = false;
    // Restore original label, fall back to passed label if not stored
    if (txt) txt.textContent = btn.dataset.origLabel || label;
    delete btn.dataset.origLabel;
    if (spinner) spinner.style.display = "none";
  }
}

// Safe AI JSON parsing — handles ```json fences and prose preamble
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

// ═══════════════════════════════════════
// Simple Local Database (localStorage)
// ═══════════════════════════════════════
export const db = {
  getPosts() {
    try {
      return JSON.parse(localStorage.getItem("blogspro_posts") || "[]");
    } catch { return []; }
  },
  savePosts(posts) {
    localStorage.setItem("blogspro_posts", JSON.stringify(posts));
  },
  getSubscribers() {
    try {
      return JSON.parse(localStorage.getItem("blogspro_subscribers") || "[]");
    } catch { return []; }
  },
  saveSubscribers(list) {
    localStorage.setItem("blogspro_subscribers", JSON.stringify(list));
  }
};
