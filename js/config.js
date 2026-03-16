// ═══════════════════════════════════════
// config.js — Utility helpers
// ═══════════════════════════════════════

export function showToast(msg, type = "info") {
  console.log(`[${type}] ${msg}`);
}

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w ]+/g, "")
    .replace(/ +/g, "-");
}

export function sanitize(html) {
  const div = document.createElement("div");
  div.textContent = html;
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
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
