## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).
## 2024-08-16 - Synchronous Scroll Layout Thrashing
**Learning:** The global `ui-utils.js` script originally used a synchronous `scroll` event handler to calculate progress bar width. Because this handler reads layout properties (`scrollHeight`, `clientHeight`) on every scroll frame, it forces synchronous reflows (layout thrashing) and blocks the main thread.
**Action:** When implementing scroll-based UI updates, always wrap DOM layout reads and writes in `window.requestAnimationFrame()` with a ticking flag, and attach the event listener with `{ passive: true }` to ensure smooth scrolling performance.
