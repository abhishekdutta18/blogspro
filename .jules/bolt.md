## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).
## 2024-05-18 - Scroll Event Listener Layout Thrashing
**Learning:** Synchronous layout reads (`scrollTop`, `scrollHeight`, `clientHeight`) within scroll event handlers trigger layout thrashing and block the main thread, resulting in janky scrolling.
**Action:** Always wrap layout reads inside scroll event listeners using `window.requestAnimationFrame()` with a ticking flag to throttle execution, and pass `{ passive: true }` to the listener to prevent blocking the scrolling thread.
