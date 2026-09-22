## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).
## 2024-05-24 - Layout Thrashing in Scroll Listeners
**Learning:** Synchronous DOM layout reads (like `clientHeight`, `scrollHeight`) inside an unthrottled `scroll` event listener trigger continuous synchronous reflows, causing severe main thread jank and laggy scrolling.
**Action:** Always optimize heavy scroll listeners by decoupling DOM layout reads from the event callback. Use a `requestAnimationFrame` loop governed by a ticking flag to batch layout reads, and add the `{ passive: true }` flag to the event listener.
