// ═══════════════════════════════════════════════
// site-settings.js — Global Website Settings (Proxy-based)
// ═══════════════════════════════════════════════
import { api }       from './services/api.js';
import { showToast } from './config.js';

let imagesEnabled = true;
let geminiEnabled = true;
let saving = false;
const LOCAL_IMAGES_KEY = "bp_site_images_enabled";
const LOCAL_GEMINI_KEY = "bp_site_gemini_enabled";
let usingLocalFallback = false;

function readLocalSetting(key) {
  const raw = localStorage.getItem(key);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

function updateUi() {
  const swImg = document.getElementById("siteImagesSwitch");
  const stImg = document.getElementById("siteImagesStatus");
  const swGem = document.getElementById("geminiSwitch");
  const stGem = document.getElementById("geminiStatus");

  if (swImg && stImg) {
    swImg.classList.toggle("on", imagesEnabled);
    swImg.classList.toggle("disabled", saving);
    stImg.textContent = imagesEnabled
      ? "ON — images are visible on public pages."
      : "OFF — images are hidden on public pages.";
  }

  if (swGem && stGem) {
    swGem.classList.toggle("on", geminiEnabled);
    swGem.classList.toggle("disabled", saving);
    stGem.textContent = geminiEnabled
      ? "ON — using Gemini (3.1 Pro) for strategic research."
      : "OFF — using Llama (70B) fallback for research.";
  }
}

async function loadSetting() {
  const localImg = readLocalSetting(LOCAL_IMAGES_KEY);
  if (typeof localImg === "boolean") imagesEnabled = localImg;

  const localGem = readLocalSetting(LOCAL_GEMINI_KEY);
  if (typeof localGem === "boolean") geminiEnabled = localGem;

  try {
    const data = await api.data.get("site", "settings");
    if (data) {
      if (typeof data.imagesEnabled === "boolean") {
        imagesEnabled = data.imagesEnabled;
        localStorage.setItem(LOCAL_IMAGES_KEY, String(imagesEnabled));
      }
      if (typeof data.geminiEnabled === "boolean") {
        geminiEnabled = data.geminiEnabled;
        localStorage.setItem(LOCAL_GEMINI_KEY, String(geminiEnabled));
      }
    }
    usingLocalFallback = false;
  } catch (err) {
    console.warn("site settings read failed:", err.message);
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
  } finally {
    saving = false;
    updateUi();
  }
};

window.toggleGemini = async function toggleGemini() {
  if (saving) return;
  saving = true;
  geminiEnabled = !geminiEnabled;
  updateUi();
  try {
    await api.data.update("site", "settings", {
      geminiEnabled,
      updatedAt: new Date().toISOString()
    });
    localStorage.setItem(LOCAL_GEMINI_KEY, String(geminiEnabled));
    usingLocalFallback = false;
    showToast(`Gemini Strategic Reasoning turned ${geminiEnabled ? "ON" : "OFF"}.`, "success");
  } catch (err) {
    localStorage.setItem(LOCAL_GEMINI_KEY, String(geminiEnabled));
    usingLocalFallback = true;
    showToast("Saved locally. Proxy update failed: " + err.message, "error");
  } finally {
    saving = false;
    updateUi();
  }
};

export function initSiteSettings() {
  if (!document.getElementById("siteImagesSwitch") && !document.getElementById("geminiSwitch")) return;
  loadSetting();
}
