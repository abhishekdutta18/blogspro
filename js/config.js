// ═══════════════════════════════════════
// config.js — Utility functions
// ═══════════════════════════════════════

// Toast / notifications
export function showToast(message, type = "info") {
  console.log(`[${type}] ${message}`);
}


// Generate URL slug
export function slugify(text) {
  if (!text) return "";

  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}


// Simple sanitizer (for text)
export function sanitize(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}


// Clean HTML from editor
export function cleanEditorHTML(html) {

  if (!html) return "";

  const div = document.createElement("div");
  div.innerHTML = html;

  // Remove script tags
  div.querySelectorAll("script").forEach(el => el.remove());

  // Remove inline JS events (onclick etc.)
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
