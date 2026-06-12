## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-06-12 - Layout Thrashing from Synchronous Scroll Events
**Learning:** Synchronous `scroll` event listeners that read layout properties (like `scrollTop`, `scrollHeight`, and `clientHeight`) can cause severe layout thrashing and block the main thread, resulting in a jittery scroll experience on long pages (like reading articles).
**Action:** Always wrap layout-reading logic in scroll event listeners with `window.requestAnimationFrame()` using a ticking flag to prevent multiple requests per frame, and pass `{ passive: true }` to `addEventListener` to tell the browser the listener won't call `preventDefault()`.
