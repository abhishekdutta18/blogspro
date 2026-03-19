import * as Sentry from "https://cdn.jsdelivr.net/npm/@sentry/browser@8/+esm";
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
import './post-audit.js';

// ── Sentry init — must run before boot() ──────────────────────────────
Sentry.init({
  dsn: "https://c75786fd93da9331cedca5e3ec8bd9cd@o4511069230530560.ingest.de.sentry.io/4511069332832336",
  environment: window.location.hostname === "localhost" ? "development" : "production",
  tracesSampleRate: 0.2,           // capture 20% of transactions for performance
  replaysOnErrorSampleRate: 0.5,   // replay 50% of sessions that had an error
});

// ── Boot — B-01 fix: wrap in try/catch so any module failure shows a
//    diagnostic message instead of a blank white screen ─────────────────
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
  } catch (err) {
    Sentry.captureException(err);
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
menuBtn?.addEventListener("click", () => {
  window.toggleSidebar?.();
});

// ── Editor image click ────────────────────────────────────────────────
const editor = document.getElementById("editor");
editor?.addEventListener("click", (e) => {
  const img = e.target.closest("img");
  if (!img) return;
});
