import { db } from "./config.js";
import { showToast } from "./config.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let imagesEnabled = true;
let saving = false;

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
    : "Turns post cover and inline content images on/off for public pages.";
}

async function loadSetting() {
  try {
    const snap = await getDoc(doc(db, "site", "settings"));
    if (snap.exists() && typeof snap.data().imagesEnabled === "boolean") {
      imagesEnabled = snap.data().imagesEnabled;
    } else {
      imagesEnabled = true;
    }
  } catch (err) {
    console.warn("site settings read failed:", err.message);
    imagesEnabled = true;
  }
  updateUi();
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
    showToast(`Website images turned ${imagesEnabled ? "ON" : "OFF"}.`, "success");
  } catch (err) {
    imagesEnabled = !imagesEnabled;
    showToast("Failed to update image setting: " + (err.code || err.message), "error");
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
