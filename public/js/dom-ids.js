// ═══════════════════════════════════════════════════════════════════
// js/dom-ids.js — All DOM element IDs as frozen constants
//
// WHY: document.getElementById("edtior") fails silently at runtime.
//      document.getElementById(IDS.EDITOR) fails loudly at import
//      time with a ReferenceError — caught before it reaches users.
//
// USAGE:
//   import { IDS } from './dom-ids.js';
//   const el = document.getElementById(IDS.EDITOR);
//
// VERIFIED against admin.html and all JS files in the codebase.
// ═══════════════════════════════════════════════════════════════════

export const IDS = Object.freeze({

  // ── Editor ──────────────────────────────────────────────────────
  EDITOR:            'editor',           // admin.html line 295 — confirmed
  EDITOR_HEADING:    'editorHeading',
  SAVE_STATUS:       'saveStatus',
  WORD_COUNT:        'wordCount',
  WORD_COUNT_BOTTOM: 'wordCountBottom',
  READING_TIME_TOP:  'readingTimeTop',
  READING_TIME_BOT:  'readingTimeDisplay',
  V2_WORD_COUNT:     'v2WordCount',

  // ── Post metadata fields ─────────────────────────────────────────
  POST_TITLE:        'postTitle',
  POST_EXCERPT:      'postExcerpt',
  POST_SLUG:         'postSlug',
  POST_IMAGE:        'postImage',
  POST_CATEGORY:     'postCategory',
  POST_META:         'postMeta',
  POST_TAGS:         'postTags',

  // ── AI panel ─────────────────────────────────────────────────────
  AI_PROMPT:         'aiPrompt',
  AI_MODAL:          'aiModal',
  AI_MODAL_TITLE:    'aiModalTitle',
  AI_MODAL_SUB:      'aiModalSub',
  AI_MODAL_CONTENT:  'aiModalContent',
  AI_MODAL_ACTIONS:  'aiModalActions',
  AI_DRAWER:         'aiDrawer',
  AI_FLOAT_BTN:      'aiFloatBtn',
  AI_EDIT_STATUS:    'aiEditStatus',
  MODEL_ARTICLE:     'modelArticle',
  WORD_TARGET:       'wordTarget',

  // ── Dashboard stats ──────────────────────────────────────────────
  STAT_TOTAL:        'statTotal',
  STAT_PUBLISHED:    'statPublished',
  STAT_DRAFTS:       'statDrafts',
  STAT_SUBS:         'statSubs',
  RECENT_POSTS_BODY: 'recentPostsBody',

  // ── Navigation / layout ──────────────────────────────────────────
  SIDEBAR:           'sidebar',
  SIDE_OVERLAY:      'sideOverlay',
  MENU_BTN:          'menuBtn',

  // ── User display ─────────────────────────────────────────────────
  USER_EMAIL:        'userEmail',
  USER_INITIAL:      'userInitial',
  GREET_MSG:         'greetMsg',
  PREMIUM_SWITCH:    'premiumSwitch',

  // ── Toolbars / overlays ──────────────────────────────────────────
  IMG_TOOLBAR:       'imgToolbar',
  SLASH_MENU:        'slashMenu',

  // ── AI tools panel ───────────────────────────────────────────────
  AI_IMAGE_BTN:      'aiImageBtn',
  AI_IMAGE_PROMPT:   'aiImagePrompt',
  AUTO_BLOG_BTN:     'autoBlogBtn',
  AUTO_BLOG_TOPIC:   'autoBlogTopic',
  HEADLINE_TOPIC:    'headlineTopic',
  HEADLINE_RESULT:   'headlineResult',
  TRAFFIC_KEYWORD:   'trafficKeyword',
  TRAFFIC_RESULT:    'trafficResult',
  BACKLINK_TOPIC:    'backlinkTopic',
  BACKLINK_RESULT:   'backlinkResult',
  GAP_RESULT:        'gapResult',
  COMPETITOR_DOMAIN: 'competitorDomain',

  // ── SEO analytics table ──────────────────────────────────────────
  TR_CLICKS:         'tr-clicks',
  TR_SEARCHES:       'tr-searches',
  TR_DIFF:           'tr-diff',
  TR_SUGGESTIONS:    'tr-suggestions',
});
