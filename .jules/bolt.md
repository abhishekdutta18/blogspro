## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).
## 2026-08-27 - Scroll Event Listener Optimization
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollHeight`, `clientHeight`) can cause layout thrashing in the frontend. This was observed in `js/ui-utils.js`.
**Action:** Optimize these by wrapping the logic in `window.requestAnimationFrame()` with a ticking flag and passing `{ passive: true }` to the event listener options to synchronize with the browser's repaint cycle and ensure smooth scrolling.
