## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-19 - Layout Thrashing in Scroll Events
**Learning:** Synchronous scroll event listeners that frequently read layout properties (like `scrollHeight`, `clientHeight`) cause layout thrashing and block the main thread.
**Action:** Optimize scroll event handlers by wrapping logic inside `window.requestAnimationFrame()` using a ticking flag to decouple layout calculations from the fast-firing scroll events. Also, add `{ passive: true }` to the event listener options to avoid blocking scrolling performance.
