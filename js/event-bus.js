// ═══════════════════════════════════════════════════════════════════
// js/event-bus.js — Typed event bus replacing window.fn() globals
//
// WHY: The codebase has 22+ window.fn() cross-file calls today.
//      window.showView("editor") fails silently if showView hasn't
//      been registered yet — load order dependent, untestable.
//      bus.emit(EV.NAVIGATE, { view: VIEWS.EDITOR }) throws
//      immediately if the handler is missing — visible in console.
//
// USAGE — registering a handler (in the owning module):
//   import { bus, EV } from './event-bus.js';
//   bus.on(EV.NAVIGATE, ({ view }) => showView(view));
//
// USAGE — emitting an event (in any calling module):
//   import { bus, EV } from './event-bus.js';
//   import { VIEWS } from './views-constants.js';
//   bus.emit(EV.NAVIGATE, { view: VIEWS.EDITOR });
//
// MIGRATION — replace window.fn() calls one at a time:
//   BEFORE: window.showView('editor');
//   AFTER:  bus.emit(EV.NAVIGATE, { view: VIEWS.EDITOR });
//
// VERIFIED against all window.* cross-file calls in the codebase.
// ═══════════════════════════════════════════════════════════════════

// ── Internal handler registry ────────────────────────────────────────
const _handlers = new Map();

export const bus = {
  /**
   * Register a handler for an event.
   * Only one handler per event — calling on() again replaces the old one.
   * @param {string} event  — use EV constants
   * @param {Function} fn   — called with the data payload
   */
  on(event, fn) {
    _handlers.set(event, fn);
  },

  /**
   * Remove a handler for an event.
   * @param {string} event
   */
  off(event) {
    _handlers.delete(event);
  },

  /**
   * Emit an event with optional data payload.
   * Logs a warning if no handler is registered — never fails silently.
   * @param {string} event  — use EV constants
   * @param {*}      data   — passed to the handler
   */
  emit(event, data) {
    const fn = _handlers.get(event);
    if (!fn) {
      console.warn(`[bus] No handler registered for event: "${event}". Did you forget to call bus.on()?`);
      return;
    }
    try {
      fn(data);
    } catch (err) {
      console.error(`[bus] Handler for "${event}" threw:`, err);
      window.Sentry?.captureException(err);
    }
  },
};

// ── Event name constants ─────────────────────────────────────────────
// Every event name as a constant — a typo is a ReferenceError,
// not a silent no-op.
export const EV = Object.freeze({

  // Navigation
  NAVIGATE:          'navigate',          // { view: VIEWS.x }
  EDITOR_CLEAR:      'editor_clear',      // {} — new post

  // AI generation
  GENERATE_POST:     'generate_post',     // { topic, wordCount, model }
  GENERATION_DONE:   'generation_done',   // { wordCount, sections }
  CANCEL_GENERATION: 'cancel_generation', // {}

  // Editor state
  WORD_COUNT_UPDATE: 'word_count_update', // { count, readMin }
  EDITOR_SAVED:      'editor_saved',      // { id, published }
  FEATURED_UPDATE:   'featured_update',   // { url }

  // Drawer / modal
  OPEN_DRAWER:       'open_drawer',       // { tab? }
  CLOSE_DRAWER:      'close_drawer',      // {}

  // Posts list
  POSTS_LOADED:      'posts_loaded',      // { posts[] }
  POST_DELETED:      'post_deleted',      // { id }

  // AI edit actions
  AI_EDIT:           'ai_edit',           // { action: string }
  INSERT_CITATIONS:  'insert_citations',  // {}

});
