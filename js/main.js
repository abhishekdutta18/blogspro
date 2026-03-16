// ═══════════════════════════════════════════════
// main.js — Application Entry Point
// Loads config → auth → modules → AI tools
// ═══════════════════════════════════════════════


// ─────────────────────────────────────────────
// Core
// ─────────────────────────────────────────────
import { loadRemoteConfig } from "./config.js";
import "./state.js";


// ─────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────
import { initAuth, initLogout } from "./auth.js";


// ─────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────
import { initNav } from "./nav.js";


// ─────────────────────────────────────────────
// Editor
// ─────────────────────────────────────────────
import { initEditor } from "./editor.js";


// ─────────────────────────────────────────────
// AI Drawer
// ─────────────────────────────────────────────
import { initDrawer } from "./ai-drawer.js";


// ─────────────────────────────────────────────
// Feature Modules
// ─────────────────────────────────────────────
import "./posts.js";
import "./users.js";
import "./subscribers.js";
import "./newsletter.js";
import "./seo-page.js";
import "./images-upload.js";
import "./ai-editor.js";
import "./ai-tools.js";
import "./v2-editor.js";


// ─────────────────────────────────────────────
// AI Modules
// ─────────────────────────────────────────────
import { initAIWriter } from "./ai-writer.js";
import { initAutoBlog } from "./auto-blog.js";
import { initAIImages } from "./ai-images.js";



// ═══════════════════════════════════════════════
// Boot Application
// ═══════════════════════════════════════════════
async function boot() {

  try {

    // Load API keys from Remote Config
    await loadRemoteConfig();

    console.log("[main] Remote Config loaded");

    // Initialize modules
    initNav();
    initEditor();
    initDrawer();

    initAuth();
    initLogout();

    initAIWriter();
    initAutoBlog();
    initAIImages();

    console.log("BlogsPro Admin v2 — modular build loaded");

  }

  catch (err) {

    console.error("Boot error:", err);

  }

}

boot();



// ═══════════════════════════════════════════════
// Mobile Sidebar Overlay
// ═══════════════════════════════════════════════
const overlay = document.getElementById("sideOverlay");

overlay?.addEventListener("click", () => {

  document.getElementById("sidebar")?.classList.remove("open");
  overlay.classList.remove("open");

});



// ═══════════════════════════════════════════════
// Mobile Hamburger Menu
// ═══════════════════════════════════════════════
const menuBtn = document.getElementById("menuBtn");

menuBtn?.addEventListener("click", () => {

  window.toggleSidebar?.();

});



// ═══════════════════════════════════════════════
// Editor Image Click Handling
// ═══════════════════════════════════════════════
const editor = document.getElementById("editor");

editor?.addEventListener("click", (e) => {

  const img = e.target.closest("img");

  if (!img) return;

  console.log("Editor image clicked:", img);

});
