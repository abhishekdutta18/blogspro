// ═══════════════════════════════════════════════
// site-settings.js — Global Website Settings (Proxy-based)
// ═══════════════════════════════════════════════
import { api }       from './services/api.js';
import { showToast } from './config.js';

let imagesEnabled = true;
let saving = false;
const LOCAL_IMAGES_KEY = "bp_site_images_enabled";
let usingLocalFallback = false;

function readLocalImagesEnabled() {
  const raw = localStorage.getItem(LOCAL_IMAGES_KEY);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

function updateUi() {
  const sw = document.getElementById("siteImagesSwitch");
  const status = document.getElementById("siteImagesStatus");
  const hint = document.getElementById("siteImagesHint");
  if (!sw || !status || !hint) return;

  sw.classList.toggle("on", imagesEnabled);
  sw.classList.toggle("disabled", saving);
  status.textContent = imagesEnabled
    ? "ON — images are visible on public pages."
    : "OFF — images are hidden on public pages.";
  hint.textContent = saving
    ? "Saving setting…"
    : usingLocalFallback
      ? "Using browser fallback mode. Syncing through restricted proxy."
      : "Turns post cover and inline content images on/off for public pages.";
}

async function loadSetting() {
  const localValue = readLocalImagesEnabled();
  if (typeof localValue === "boolean") {
    imagesEnabled = localValue;
  }

  try {
    const data = await api.data.get("site", "settings");
    if (data && typeof data.imagesEnabled === "boolean") {
      imagesEnabled = data.imagesEnabled;
      localStorage.setItem(LOCAL_IMAGES_KEY, String(imagesEnabled));
    } else {
      imagesEnabled = true;
    }
    usingLocalFallback = false;
  } catch (err) {
    console.warn("site settings read failed:", err.message);
    if (typeof localValue !== "boolean") imagesEnabled = true;
    usingLocalFallback = true;
  }
  updateUi();
}

window.toggleSiteImages = async function toggleSiteImages() {
  if (saving) return;
  saving = true;
  imagesEnabled = !imagesEnabled;
  updateUi();
  try {
    await api.data.update("site", "settings", {
      imagesEnabled,
      updatedAt: new Date().toISOString()
    });
    localStorage.setItem(LOCAL_IMAGES_KEY, String(imagesEnabled));
    usingLocalFallback = false;
    showToast(`Website images turned ${imagesEnabled ? "ON" : "OFF"}.`, "success");
  } catch (err) {
    localStorage.setItem(LOCAL_IMAGES_KEY, String(imagesEnabled));
    usingLocalFallback = true;
    showToast("Saved locally. Proxy update failed: " + err.message, "error");
    console.error("site settings write failed:", err);
  } finally {
    saving = false;
    updateUi();
  }
};

export function initSiteSettings() {
  if (!document.getElementById("siteImagesSwitch")) return;
  loadSetting();
}
