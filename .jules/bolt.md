## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-18 - Scroll Event Optimization Pattern
**Learning:** Synchronous `scroll` event listeners that read layout properties (like `scrollTop`, `scrollHeight`, `clientHeight`) block the main thread and cause layout thrashing, severely degrading the scroll framerate.
**Action:** Always wrap layout reads inside `window.requestAnimationFrame()` with a ticking flag (`isScrolling`) when handling continuous events like `scroll`. Always add `{ passive: true }` to the event listener options so the browser's compositor thread isn't blocked waiting for JavaScript execution.
