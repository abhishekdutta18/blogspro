## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2026-05-25 - RequestAnimationFrame Scroll Listeners
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollHeight`, `clientHeight`) and update DOM synchronously can cause layout thrashing and block the main thread. We had this pattern in `js/ui-utils.js` for a progress bar.
**Action:** Optimize layout-reading scroll event listeners by wrapping the DOM manipulation logic in `window.requestAnimationFrame()` with a ticking flag, and passing `{ passive: true }` to the event listener options.
