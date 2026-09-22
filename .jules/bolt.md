## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-19 - Scroll Event Layout Thrashing
**Learning:** The scroll progress bar logic in `js/ui-utils.js` performed synchronous layout reads (`scrollHeight`, `clientHeight`) on every scroll event, which blocks the main thread and causes layout thrashing (forced synchronous layout).
**Action:** Optimize scroll-bound layout reads by wrapping them in `window.requestAnimationFrame()` with a ticking flag, and pass `{ passive: true }` to the event listener to ensure smooth scrolling.
