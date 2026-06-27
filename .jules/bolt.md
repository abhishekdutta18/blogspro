## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-06-27 - Synchronous Scroll Event Layout Thrashing
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollHeight`, `clientHeight`) can cause layout thrashing because they force the browser to recalculate layout on every scroll event before painting.
**Action:** Always wrap scroll event listener logic that reads layout properties in `window.requestAnimationFrame()` with a ticking flag, and pass `{ passive: true }` to the event listener options to ensure smooth scrolling behavior.