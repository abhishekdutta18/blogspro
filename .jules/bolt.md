## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-29 - Scroll Layout Thrashing Optimization
**Learning:** Synchronous scroll event listeners that read layout properties like `scrollTop` and `scrollHeight` cause layout thrashing and block the main thread.
**Action:** Always wrap scroll event listener logic in `window.requestAnimationFrame()` using a `ticking` flag to throttle execution, and pass `{ passive: true }` to the listener options.
