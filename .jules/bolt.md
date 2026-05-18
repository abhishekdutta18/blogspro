## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-18 - Scroll Event Listener Performance Optimization
**Learning:** Adding passive flag to synchronous scroll listeners is an excellent optimization to avoid blocking main thread scrolling, but we need to ensure that any heavy reads (`scrollTop`, `clientHeight`) are processed through `requestAnimationFrame` to avoid layout thrashing.
**Action:** Always wrap `scroll` event listeners using `window.requestAnimationFrame()` with a ticking flag, and pass `{ passive: true }` to the event listener options to prevent layout thrashing and keep main thread free. Make sure to add comments explaining optimization and avoid updating or modifying `package.json` for unrelated dev dependencies during a PR.
