## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).
## 2026-08-29 - Layout Thrashing from Scroll Events
**Learning:** The global `window.addEventListener('scroll')` in `js/ui-utils.js` was synchronously reading DOM layout properties (`scrollHeight`, `clientHeight`, `scrollTop`) and forcing style recalculations on every scroll event, which fires very frequently and causes layout thrashing (jank) on the main thread.
**Action:** Always wrap scroll event listeners (especially those causing layout recalculations or DOM writes) using `window.requestAnimationFrame()` with a ticking boolean flag, and pass the `{ passive: true }` option to the event listener to avoid blocking browser scrolling.
