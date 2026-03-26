// ═══════════════════════════════════════════════
// nav.js — Navigation, view switching
// ═══════════════════════════════════════════════
import { state }                   from './state.js';
import { loadAll, renderPostsTable } from './posts.js';
import { loadUsers }               from './users.js';
import { loadSubscribers }         from './subscribers.js';
import { populateAnalyzeSelect }   from './seo-page.js';
import { clearEditor }             from './editor.js';
import { closeAIDrawer }           from './ai-drawer.js';
import { loadProfile }             from './profile.js';
import { loadNewsletterHistory }   from './newsletter.js';

export function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const viewEl = document.getElementById(`view-${name}`);
  if (viewEl) viewEl.classList.add('active');

  document.querySelectorAll('.nav-item[data-view]').forEach(i => {
    if (i.dataset.view === name) i.classList.add('active');
  });

  // Per-view load hooks
  if (name === 'posts')       renderPostsTable(state.allPosts, 'allPostsBody');
  if (name === 'users')       loadUsers();
  if (name === 'subscribers') loadSubscribers();
  if (name === 'seotools')    populateAnalyzeSelect();
  if (name === 'profile')     loadProfile();
  if (name === 'newsletter')  loadNewsletterHistory();

  // Float button + drawer: only show on editor view
  const floatBtn = document.getElementById('aiFloatBtn');
  if (floatBtn) {
    if (name === 'editor') {
      floatBtn.classList.remove('hidden');
    } else {
      floatBtn.classList.add('hidden');
      const drawer = document.getElementById('aiDrawer');
      if (drawer?.classList.contains('open')) closeAIDrawer();
    }
  }
}

export function initNav() {
  // Expose globally for inline onclick handlers
  window.showView = showView;

  document.getElementById('sidebar')?.addEventListener('click', e => {
    const item = e.target.closest('.nav-item[data-view]');
    if (!item) return;
    if (item.dataset.clear) clearEditor();
    showView(item.dataset.view);
    if (window.innerWidth < 900) toggleSidebar();
  });
}

export function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
  document.getElementById('sideOverlay')?.classList.toggle('open');
}
window.toggleSidebar = toggleSidebar;
