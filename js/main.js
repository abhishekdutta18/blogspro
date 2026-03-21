import { loadRemoteConfig } from "./config.js";
import "./state.js";
import { initAuth, initLogout } from "./auth.js";
import { initNav } from "./nav.js";
import { initEditor } from "./editor.js";
import { initDrawer } from "./ai-drawer.js";
import "./posts.js";
import "./users.js";
import "./subscribers.js";
import "./newsletter.js";
import "./seo-page.js";
import "./images-upload.js";
import "./ai-editor.js";
import "./ai-tools.js";
import "./v2-editor.js";
import "./image-manager.js";
import { initAIWriter } from "./ai-writer.js";
import { initAutoBlog } from "./auto-blog.js";
import { initAIImages } from "./ai-images.js";
import { initSiteSettings } from "./site-settings.js";
import { initProfile } from "./profile.js";

// ── Sentry is initialised in admin.html via Sentry.onLoad() — do NOT
//    call Sentry.init() here. Just use window.Sentry when available. ──

// ── Boot — B-01 fix: try/catch so any module failure shows a
//    diagnostic screen instead of a blank white page ───────────────────
async function boot() {
  try {
    await loadRemoteConfig();
    initNav();
    initEditor();
    initDrawer();
    initAuth();
    initLogout();
    initAIWriter();
    initAutoBlog();
    initAIImages();
    initSiteSettings();
    initProfile();
    if (window.__ENABLE_POST_AUDIT__ === true) {
      import("./post-audit.js").catch(err => {
        console.warn("[post-audit] optional module failed to load:", err.message);
      });
    }
  } catch (err) {
    window.Sentry?.captureException(err);
    document.body.innerHTML =
      '<div style="padding:2rem;color:#fca5a5;font-family:sans-serif">' +
      '<h2>BlogsPro failed to load</h2><p>' + err.message + '</p>' +
      '<button onclick="location.reload()" style="margin-top:1rem;padding:0.5rem 1rem;cursor:pointer">Retry</button>' +
      '</div>';
    console.error('[boot] fatal:', err);
  }
}
boot();

// ── Sidebar overlay ───────────────────────────────────────────────────
const overlay = document.getElementById("sideOverlay");
overlay?.addEventListener("click", () => {
  document.getElementById("sidebar")?.classList.remove("open");
  overlay.classList.remove("open");
});

const menuBtn = document.getElementById("menuBtn");
// Mobile menu uses inline onclick in admin.html bootstrap; avoid double-toggle.

// ── Editor image click ────────────────────────────────────────────────
const editor = document.getElementById("editor");
editor?.addEventListener("click", (e) => {
  const img = e.target.closest("img");
  if (!img) return;
});
