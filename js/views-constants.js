// ═══════════════════════════════════════════════════════════════════
// js/views-constants.js — Admin panel view names as frozen constants
//
// WHY: showView("edtior") fails silently — the view just doesn't
//      switch and no error is thrown. With VIEWS.EDITOR, a typo
//      is a ReferenceError at import time.
//
// USAGE:
//   import { VIEWS } from './views-constants.js';
//   showView(VIEWS.EDITOR);
//   window.showView(VIEWS.DASHBOARD);
//
// VERIFIED against all showView() calls and data-view attributes
// in admin.html, nav.js, posts.js, ai-tools.js, seo-page.js,
// ai-writer.js, and post-audit.js.
// ═══════════════════════════════════════════════════════════════════

export const VIEWS = Object.freeze({
  DASHBOARD:   'dashboard',   // main stats + recent posts
  POSTS:       'posts',       // all posts table
  EDITOR:      'editor',      // write / edit post
  SEOTOOLS:    'seotools',    // SEO analysis tools
  NEWSLETTER:  'newsletter',  // newsletter generator
  USERS:       'users',       // user management
  SUBSCRIBERS: 'subscribers', // subscriber list
  AUTOBLOG:    'autoblog',    // auto blog generator
  CALENDAR:    'calendar',    // content calendar
  CLUSTERS:    'clusters',    // topic clusters
  HEADLINE:    'headline',    // headline generator
});
