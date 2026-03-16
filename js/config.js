// ═══════════════════════════════════════
// config.js — Final Utilities + Local DB
// ═══════════════════════════════════════


// Toast / notification
export function showToast(message, type = "info") {
  console.log(`[${type}] ${message}`);
}


// Slug generator
export function slugify(text) {
  if (!text) return "";

  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}


// Escape plain text
export function sanitize(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
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

    if (txt) txt.textContent = label;

    if (spinner) spinner.style.display = "inline-block";

  } else {

    btn.disabled = false;

    if (txt) txt.textContent = label;

    if (spinner) spinner.style.display = "none";
  }
}


// Safe AI JSON parsing
export function parseAIJson(text) {

  if (!text) return null;

  try {
    return JSON.parse(text);
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
    return JSON.parse(localStorage.getItem("blogspro_posts") || "[]");
  },

  savePosts(posts) {
    localStorage.setItem("blogspro_posts", JSON.stringify(posts));
  },

  getSubscribers() {
    return JSON.parse(localStorage.getItem("blogspro_subscribers") || "[]");
  },

  saveSubscribers(list) {
    localStorage.setItem("blogspro_subscribers", JSON.stringify(list));
  }

};
