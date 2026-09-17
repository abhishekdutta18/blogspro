## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-09-17 - Synchronous Scroll Event Layout Thrashing
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollHeight`, `clientHeight`) on every scroll event cause severe layout thrashing and block the main thread, especially when scrolling quickly.
**Action:** Always optimize scroll listeners by wrapping the layout reading/writing logic in `window.requestAnimationFrame()` with a ticking flag, and pass `{ passive: true }` to the event listener options to prevent blocking the compositor thread.
