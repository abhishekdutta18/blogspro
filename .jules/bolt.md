## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2026-09-12 - Layout Thrashing in Scroll Listeners
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollHeight`, `clientHeight`) and write styles simultaneously cause severe layout thrashing, blocking the main thread during scrolling.
**Action:** Optimize scroll listeners by decoupling reads/writes using a `ticking` flag, wrapping logic in `window.requestAnimationFrame()`, and passing `{ passive: true }` to the event listener options.
