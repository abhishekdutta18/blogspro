// ═══════════════════════════════════════════════
// main.js — App entry point
// Import order matters: config → state → modules
// ═══════════════════════════════════════════════


// Core
import "./config.js";
import "./state.js";


// Auth
import { initAuth, initLogout } from "./auth.js";


// Navigation
import { initNav } from "./nav.js";


// Editor
import { initEditor } from "./editor.js";


// AI Drawer
import { initDrawer } from "./ai-drawer.js";


// Feature modules
import "./posts.js";
import "./users.js";
import "./subscribers.js";
import "./newsletter.js";
import "./seo-page.js";


// AI modules
import { initAIWriter } from "./ai-writer.js";
import { initAutoBlog } from "./auto-blog.js";
import { initAIImages } from "./ai-images.js";


// Other modules
import "./images-upload.js";
import "./ai-editor.js";
import "./ai-tools.js";
import "./v2-editor.js";


// ─────────────────────────────────────────────
// Boot Application
// ─────────────────────────────────────────────

function boot() {

  initNav();
  initEditor();
  initDrawer();

  initAuth();
  initLogout();

  initAIWriter();
  initAutoBlog();
  initAIImages();

}


boot();



// ─────────────────────────────────────────────
// Mobile sidebar overlay
// ─────────────────────────────────────────────

const overlay = document.getElementById("sideOverlay");

overlay?.addEventListener("click", () => {

  document.getElementById("sidebar")?.classList.remove("open");
  overlay.classList.remove("open");

});



// ─────────────────────────────────────────────
// Mobile hamburger menu
// ─────────────────────────────────────────────

const menuBtn = document.getElementById("menuBtn");

menuBtn?.addEventListener("click", () => {

  window.toggleSidebar?.();

});



// ─────────────────────────────────────────────
// Editor image click delegation
// ─────────────────────────────────────────────

const editor = document.getElementById("editor");

editor?.addEventListener("click", (e) => {

  const img = e.target.closest("img");

  if (!img) return;

  // image click logic handled by ai-images module
  console.log("Image clicked", img);

});



console.log("BlogsPro Admin v2 — modular build loaded");
