## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-18 - Scroll Layout Thrashing
**Learning:** Synchronous scroll event listeners that read layout properties (`scrollTop`, `scrollHeight`, `clientHeight`) can cause layout thrashing because they force the browser to recalculate layouts continuously.
**Action:** Optimize scroll listeners by wrapping layout reads and DOM updates in `window.requestAnimationFrame()` with a ticking flag, and attach the event listener with `{ passive: true }` to ensure smoother scrolling.
