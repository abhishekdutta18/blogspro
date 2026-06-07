## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2026-06-07 - Layout Thrashing on Scroll
**Learning:** Synchronous scroll event listeners that directly read layout properties (like `scrollHeight`, `clientHeight`) block the main thread and cause layout thrashing/jank on scroll-heavy pages.
**Action:** Optimize scroll listeners by deferring DOM reads/writes using `window.requestAnimationFrame()` with a ticking flag to throttle updates, and add `{ passive: true }` to the event listener options.
