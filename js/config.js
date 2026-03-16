// ═══════════════════════════════════════
// config.js — Utility functions
// ═══════════════════════════════════════

export function showToast(message, type = "info") {
  console.log(`[${type}] ${message}`);
}

export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

export function sanitize(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

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

export function parseAIJson(text) {

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Invalid JSON from AI:", text);
    return null;
  }
}
