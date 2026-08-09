## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2025-02-12 - Layout Thrashing in Scroll Events
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollHeight`, `clientHeight`, `scrollTop`) can cause layout thrashing on every pixel scrolled, dropping frame rates and causing jank.
**Action:** Always wrap layout-reading logic inside scroll listeners in `window.requestAnimationFrame()` with a ticking flag to throttle updates to the display refresh rate. Also, pass `{ passive: true }` to the event listener if `preventDefault()` is not called to allow the browser's scroll optimizations.
