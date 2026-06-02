## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-18 - Scroll Event Layout Thrashing
**Learning:** The synchronous reading of layout properties (`scrollTop`, `scrollHeight`) combined with DOM style updates inside a `scroll` event listener causes layout thrashing and blocks the main thread during scrolling.
**Action:** Always optimize continuous UI events like `scroll` or `resize` by wrapping layout reads/writes in `window.requestAnimationFrame()` with a ticking flag, and configure the listener with `{ passive: true }` to prevent scroll blocking.
