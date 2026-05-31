## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-31 - Layout Thrashing in Scroll Listeners
**Learning:** Synchronous scroll event listeners that perform calculations reading layout properties (like `scrollTop`, `scrollHeight`, `clientHeight`) block the main thread and cause layout thrashing, leading to janky scrolling experiences.
**Action:** Always wrap heavy or layout-reading operations in `window.requestAnimationFrame()` with a boolean flag (e.g., `ticking`) to ensure updates occur only once per animation frame. Also, mark the event listener `{ passive: true }` so the browser can composite the scroll smoothly without waiting on JavaScript execution.
