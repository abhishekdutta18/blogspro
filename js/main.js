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

import { initAIWriter } from "./ai-writer.js";
import { initAutoBlog } from "./auto-blog.js";
import { initAIImages } from "./ai-images.js";


async function boot() {

  await loadRemoteConfig();

  initNav();
  initEditor();
  initDrawer();

  initAuth();
  initLogout();

  initAIWriter();
  initAutoBlog();
  initAIImages();

  console.log("BlogsPro Admin v2 loaded");

}

boot();


const overlay = document.getElementById("sideOverlay");

overlay?.addEventListener("click", () => {

  document.getElementById("sidebar")?.classList.remove("open");

  overlay.classList.remove("open");

});


const menuBtn = document.getElementById("menuBtn");

menuBtn?.addEventListener("click", () => {

  window.toggleSidebar?.();

});


const editor = document.getElementById("editor");

editor?.addEventListener("click", (e) => {

  const img = e.target.closest("img");

  if (!img) return;

  console.log("Image clicked", img);

});
