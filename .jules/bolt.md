## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2026-09-08 - Layout Thrashing on Scroll
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollHeight`, `clientHeight`) cause layout thrashing and block the main thread, degrading scrolling performance.
**Action:** Optimize scroll listeners by wrapping layout reads/writes in `window.requestAnimationFrame()` with a ticking flag and use `{ passive: true }` in event listener options.
