## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2025-02-14 - Optimizing synchronous scroll events reading layout properties
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollHeight`, `clientHeight`) and update the DOM directly can cause layout thrashing and block the main thread, degrading frontend performance.
**Action:** Optimize these events by wrapping the logic in `window.requestAnimationFrame()` with a ticking flag to limit execution to once per frame, and pass `{ passive: true }` to the event listener options to prevent scrolling blockages.
