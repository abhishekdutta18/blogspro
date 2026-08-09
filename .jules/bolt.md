## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2026-06-18 - Scroll Event Listener Layout Thrashing
**Learning:** A synchronous `scroll` event listener in `js/ui-utils.js` updating a progress bar repeatedly read layout properties (`scrollTop`, `scrollHeight`, `clientHeight`) and modified the DOM, causing layout thrashing and potentially blocking smooth scrolling since it fired frequently on the main thread.
**Action:** Optimize frequent layout-reading scroll handlers by wrapping the DOM manipulation logic inside `window.requestAnimationFrame()` coupled with a ticking flag, and setting `{ passive: true }` in `addEventListener` options to explicitly permit the browser to unblock scrolling.
