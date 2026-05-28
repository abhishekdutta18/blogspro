## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-28 - Scroll Layout Thrashing
**Learning:** Synchronous scroll event listeners that read layout properties (`scrollTop`, `scrollHeight`, `clientHeight`) block the main thread and cause layout thrashing on every scroll event pixel.
**Action:** Always wrap synchronous layout property reads inside scroll event listeners using `window.requestAnimationFrame()` with a ticking flag to batch DOM updates, and use `{ passive: true }` to unblock browser scroll mechanics.
