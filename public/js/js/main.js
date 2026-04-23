import { loadRemoteConfig } from "./config.js";
import "./state.js";
import { initAuth, initLogout } from "./auth.js";
import { initNav } from "./nav.js";
import { initEditor } from "./editor.js";
import { initDrawer } from "./ai-drawer.js";
import { loadAll } from "./posts.js";
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
import { initAdminAccount } from "./admin-account.js";
import { initHealthMonitor } from "./health.js";

// ── Sentry is initialised via js/sentry-init-v2.js on all pages — do NOT
//    call Sentry.init() here. Just use window.Sentry when available. ──
function setAdminIntegrationStatus(mode, label) {
  const badge = document.getElementById("integrationBadgeAdmin");
  const text = document.getElementById("integrationBadgeAdminText");
  if (!badge || !text) return;
  badge.classList.remove("online", "degraded");
  if (mode === "online") badge.classList.add("online");
  if (mode === "degraded") badge.classList.add("degraded");
  text.textContent = label || "Integrations: Initializing";
}
window.__setAdminIntegrationStatus = setAdminIntegrationStatus;
setAdminIntegrationStatus(null, "Integrations: Initializing");

// Manual AI key refresh from admin UI
window.reloadAIConfig = async () => {
  try {
    setAdminIntegrationStatus("degraded", "Integrations: Syncing keys…");
    await loadRemoteConfig();
    setAdminIntegrationStatus("online", "Integrations: Keys refreshed");
    if (window.showToast) showToast("AI keys reloaded from Remote Config.", "success");
  } catch (err) {
    setAdminIntegrationStatus("degraded", "Integrations: Key refresh failed");
    if (window.showToast) showToast("Reload failed: " + err.message, "error");
  }
};

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
    initAdminAccount();
    initHealthMonitor();
    await loadAll();
    if (window.__ENABLE_POST_AUDIT__ === true) {
      import("./post-audit.js").catch(err => {
        console.warn("[post-audit] optional module failed to load:", err.message);
      });
    }
    setAdminIntegrationStatus("online", "Integrations: Online");
    // Periodic key refresh (hourly) to keep AI provider creds in sync
    setInterval(() => window.reloadAIConfig?.(), 60 * 60 * 1000);
  } catch (err) {
    window.Sentry?.captureException(err);
    setAdminIntegrationStatus("degraded", "Integrations: Degraded");
    const _escHtml = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    document.body.innerHTML =
      '<div style="padding:2rem;color:#fca5a5;font-family:sans-serif">' +
      '<h2>BlogsPro failed to load</h2><p>' + _escHtml(err.message) + '</p>' +
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
