## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-08-31 - Layout Thrashing in Scroll Events
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollHeight`, `clientHeight`) and write to the DOM (updating a progress bar) cause severe layout thrashing and block the main thread, leading to janky scrolling.
**Action:** Always wrap scroll logic in `window.requestAnimationFrame()` using a `ticking` flag, and attach `{ passive: true }` to the event listener so the browser doesn't block scrolling while waiting for `preventDefault()`.
