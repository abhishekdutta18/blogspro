// ═══════════════════════════════════════════════
// ai-drawer.js — Slide-in AI Writer drawer UI
// ═══════════════════════════════════════════════

export function openAIDrawer(tab = 'write') {
  document.getElementById('aiDrawer')?.classList.add('open');
  document.getElementById('aiDrawerOverlay')?.classList.add('open');
  document.getElementById('aiFloatBtn')?.classList.add('hidden');
  switchDrawerTab(tab);
}

export function closeAIDrawer() {
  document.getElementById('aiDrawer')?.classList.remove('open');
  document.getElementById('aiDrawerOverlay')?.classList.remove('open');
  const editorActive = document.getElementById('view-editor')?.classList.contains('active');
  if (editorActive) document.getElementById('aiFloatBtn')?.classList.remove('hidden');
}

export function switchDrawerTab(tab) {
  ['write','edit','image'].forEach(t => {
    document.getElementById('dtab-'+t)?.classList.toggle('active', t === tab);
    document.getElementById('dpane-'+t)?.classList.toggle('active', t === tab);
  });
  document.getElementById('drawerFooterWrite') && (document.getElementById('drawerFooterWrite').style.display = tab === 'write' ? 'block' : 'none');
  document.getElementById('drawerFooterImage') && (document.getElementById('drawerFooterImage').style.display = tab === 'image' ? 'block' : 'none');
}

export function showAIEditToolbar() {
  openAIDrawer('edit');
}

export function initDrawer() {
  // Expose to window for onclick handlers in HTML
  window.openAIDrawer    = openAIDrawer;
  window.closeAIDrawer   = closeAIDrawer;
  window.switchDrawerTab = switchDrawerTab;

  // Overlay click closes drawer
  document.getElementById('aiDrawerOverlay')?.addEventListener('click', closeAIDrawer);
}
