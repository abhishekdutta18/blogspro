## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2026-09-04 - Synchronous Scroll Layout Thrashing
**Learning:** Attaching synchronous `scroll` event listeners that read DOM layout properties (like `scrollTop`, `scrollHeight`, `clientHeight`) can cause layout thrashing and block the main thread, resulting in scroll jank. This is especially true when updating element styles (like a progress bar width) directly inside the event handler.
**Action:** Optimize scroll-bound layout reads and DOM updates by wrapping the logic inside `window.requestAnimationFrame()` with a boolean ticking flag to throttle execution. Additionally, attach the event listener with the `{ passive: true }` option to allow the browser to continue scrolling without waiting for the JavaScript handler to finish.