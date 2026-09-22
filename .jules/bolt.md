## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2025-02-12 - Layout Thrashing in Scroll Events
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollTop`, `scrollHeight`, `clientHeight`) and write to the DOM (like setting element width) in the same frame cause layout thrashing and stutter.
**Action:** Always optimize scroll event listeners by wrapping the execution in `window.requestAnimationFrame()` coupled with a ticking flag to decouple DOM reads from writes and ensure execution only occurs once per frame. Use `{ passive: true }` in `addEventListener` for additional performance.
