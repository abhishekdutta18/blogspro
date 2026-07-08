## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-19 - Layout Thrashing in Scroll Events
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollTop` and `scrollHeight`) cause layout thrashing and stutter on long pages by forcing the browser to synchronously recalculate layout on every scroll tick.
**Action:** Always optimize heavy scroll listeners by wrapping the logic in `window.requestAnimationFrame()` with an `isTicking` flag, and pass `{ passive: true }` to the event listener options to prevent main thread blocking.
