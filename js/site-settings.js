import { db } from "./config.js";
import { showToast } from "./config.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let imagesEnabled = true;
let audioEnabled = false;
let saving = false;
const LOCAL_IMAGES_KEY = "bp_site_images_enabled";
const LOCAL_AUDIO_KEY = "bp_site_audio_enabled";
let usingLocalFallback = false;

function readLocalImagesEnabled() {
  const raw = localStorage.getItem(LOCAL_IMAGES_KEY);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

function readLocalAudioEnabled() {
  const raw = localStorage.getItem(LOCAL_AUDIO_KEY);
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
  
  const audioSw = document.getElementById("siteAudioSwitch");
  const audioStatus = document.getElementById("siteAudioStatus");
  if (audioSw && audioStatus) {
    audioSw.classList.toggle("on", audioEnabled);
    audioSw.classList.toggle("disabled", saving);
    audioStatus.textContent = audioEnabled
      ? "ON — Audio briefings will be visible."
      : "OFF — Audio briefings are hidden.";
  }

  hint.textContent = saving
    ? "Saving setting…"
    : usingLocalFallback
      ? "Using browser fallback mode. Firestore access is currently blocked."
      : "Turns post cover and inline content images on/off for public pages.";
}

async function loadSetting() {
  const localImages = readLocalImagesEnabled();
  if (typeof localImages === "boolean") imagesEnabled = localImages;

  const localAudio = readLocalAudioEnabled();
  if (typeof localAudio === "boolean") audioEnabled = localAudio;

  // Phase 12: UI Hardening — Prevent "Loading..." hang
  const timeout = setTimeout(() => {
    if (usingLocalFallback) return;
    console.warn("loadSetting timed out, using local/defaults.");
    usingLocalFallback = true;
    updateUi();
  }, 4000);

  try {
    const snap = await getDoc(doc(db, "site", "settings"));
    if (snap.exists()) {
      const data = snap.data();
      if (typeof data.imagesEnabled === "boolean") {
        imagesEnabled = data.imagesEnabled;
        localStorage.setItem(LOCAL_IMAGES_KEY, String(imagesEnabled));
      }
      if (typeof data.audioEnabled === "boolean") {
        audioEnabled = data.audioEnabled;
        localStorage.setItem(LOCAL_AUDIO_KEY, String(audioEnabled));
      }
    } else {
      imagesEnabled = true;
      audioEnabled = false;
    }
    usingLocalFallback = false;
  } catch (err) {
    console.warn("site settings read failed:", err.message);
    if (typeof localImages !== "boolean") imagesEnabled = true;
    if (typeof localAudio !== "boolean") audioEnabled = false;
    usingLocalFallback = true;
  } finally {
    clearTimeout(timeout);
    updateUi();
  }
}

window.toggleSiteImages = async function toggleSiteImages() {
  if (saving) return;
  saving = true;
  imagesEnabled = !imagesEnabled;
  updateUi();
  try {
    await setDoc(
      doc(db, "site", "settings"),
      {
        imagesEnabled,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    localStorage.setItem(LOCAL_IMAGES_KEY, String(imagesEnabled));
    usingLocalFallback = false;
    showToast(`Website images turned ${imagesEnabled ? "ON" : "OFF"}.`, "success");
  } catch (err) {
    localStorage.setItem(LOCAL_IMAGES_KEY, String(imagesEnabled));
    usingLocalFallback = true;
    showToast(
      "Saved locally. Firestore update blocked: " + (err.code || err.message),
      "error"
    );
    console.error("site settings write failed:", err);
  } finally {
    saving = false;
    updateUi();
  }
};

window.toggleSiteAudio = async function toggleSiteAudio() {
  if (saving) return;
  saving = true;
  audioEnabled = !audioEnabled;
  updateUi();
  try {
    await setDoc(
      doc(db, "site", "settings"),
      {
        audioEnabled,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    localStorage.setItem(LOCAL_AUDIO_KEY, String(audioEnabled));
    usingLocalFallback = false;
    showToast(`AI Audio is now ${audioEnabled ? "ON" : "OFF"}.`, "success");
  } catch (err) {
    localStorage.setItem(LOCAL_AUDIO_KEY, String(audioEnabled));
    usingLocalFallback = true;
    showToast("Update failed: " + (err.code || err.message), "error");
  } finally {
    saving = false;
    updateUi();
  }
};

export function initSiteSettings() {
  if (!document.getElementById("siteImagesSwitch")) return;
  loadSetting();
}
