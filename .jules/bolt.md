## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-06-25 - Scroll Event Layout Thrashing
**Learning:** Synchronous scroll event listeners that read layout properties like `scrollTop`, `scrollHeight`, and `clientHeight` cause unnecessary layout calculations on every single scroll event (layout thrashing), which blocks the main thread and leads to jittery scrolling.
**Action:** Always wrap the logic of scroll event listeners (especially those measuring DOM layout) in `window.requestAnimationFrame()` with a ticking flag to limit execution to browser paint cycles, and pass `{ passive: true }` to the event listener options to prevent blocking the scrolling thread.
