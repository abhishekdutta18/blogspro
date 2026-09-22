## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-06-15 - Synchronous Scroll Layout Thrashing
**Learning:** Synchronous scroll event listeners that perform layout reads (`scrollHeight`, `clientHeight`, `scrollTop`) and then DOM modifications (`style.width`) block the main thread and cause layout thrashing on every scroll tick.
**Action:** Always optimize continuous UI events (like `scroll` and `resize`) by wrapping logic in `window.requestAnimationFrame()` with a `ticking` lock flag, and pass `{ passive: true }` to the event listener so the browser can optimize the scroll thread independently.
