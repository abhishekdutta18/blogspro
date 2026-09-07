## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).
## 2024-05-18 - [Optimize global scroll listener]
**Learning:** Synchronous scroll event listeners that perform DOM layout reads (like `scrollHeight`, `clientHeight`) can cause severe layout thrashing and scroll jank, especially on mobile.
**Action:** Always wrap layout-reading logic inside scroll event listeners with `window.requestAnimationFrame()` utilizing a `ticking` flag, and ensure the event listener is configured with `{ passive: true }` to prevent main thread blocking.
