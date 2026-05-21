## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## $(date +%Y-%m-%d) - Layout Thrashing on Scroll Events
**Learning:** Adding synchronous read operations for DOM layout values like `scrollHeight` and `clientHeight` within unthrottled `scroll` event listeners forces the browser to recalculate layouts unnecessarily and blocks the main thread, causing significant jank on scroll-heavy UI surfaces.
**Action:** Always wrap code executing within a scroll event listener in `window.requestAnimationFrame()` using a boolean ticking flag to process state reads no more than 60 times a second. Adding `{ passive: true }` to the event listener options is critical to explicitly signal that `preventDefault()` won't be called, yielding immediate thread access back to the browser's scroller.
