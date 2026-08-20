## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2026-08-20 - Scroll Event Listeners Layout Thrashing
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollHeight`, `clientHeight`, `scrollY`) can cause layout thrashing and block the main thread, leading to jittery scrolling. This was found across several files tracking scroll progress.
**Action:** Optimize synchronous scroll event listeners by wrapping the logic in `window.requestAnimationFrame()` with a ticking flag to limit execution to 60fps, and pass `{ passive: true }` to the event listener options to prevent blocking the browser's scroll handling.
