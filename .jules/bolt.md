## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-06-25 - Scroll Event Layout Thrashing
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollHeight`, `clientHeight`) block the main thread and can cause significant layout thrashing, degrading scrolling performance.
**Action:** Optimize these by wrapping the logic in `window.requestAnimationFrame()` with a ticking flag to throttle updates to frame boundaries, and pass `{ passive: true }` to the event listener options so the browser doesn't wait for the JS to finish before scrolling.
