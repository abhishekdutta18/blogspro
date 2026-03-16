// ═══════════════════════════════════════════════
// main.js — App entry point
// Import order matters: config → state → modules
// ═══════════════════════════════════════════════

// Core
import './config.js';
import './state.js';

// Auth (boots everything via onAuthStateChanged → loadAll)
import { initAuth, initLogout } from './auth.js';

// Navigation
import { initNav } from './nav.js';

// Editor
import { initEditor } from './editor.js';

// AI Drawer
import { initDrawer } from './ai-drawer.js';

// Feature modules — imported for side-effects (they register window.* handlers)
import './posts.js';
import './ai-writer.js';
import './ai-editor.js';
import './ai-images.js';
import './images-upload.js';
import './users.js';
import './subscribers.js';
import './seo-page.js';
import './newsletter.js';
import './auto-blog.js';
import './ai-tools.js';
import './v2-editor.js';

// ── Boot ──────────────────────────────────────
initNav();
initEditor();
initDrawer();
initAuth();
initLogout();

// Mobile sidebar overlay click
document.getElementById('sideOverlay')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sideOverlay')?.classList.remove('open');
});

// Mobile top bar hamburger
document.getElementById('menuBtn')?.addEventListener('click', () => window.toggleSidebar?.());

// Image click toolbar in editor (delegated)
document.getElementById('editor')?.addEventListener('click', e => {
  const img = e.target.closest('img');
  removeImgToolbar?.();
  if (!img) return;
  // handled by ai-images image click delegation
});

console.log('BlogsPro Admin v2 — modular build loaded');
