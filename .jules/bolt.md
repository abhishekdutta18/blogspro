## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-19 - Layout Thrashing in Scroll Events
**Learning:** Synchronous scroll event listeners that read layout properties like `scrollHeight` and `clientHeight` cause layout thrashing and block the main thread, especially when scrolling quickly.
**Action:** Optimize these by wrapping the read/write logic inside `window.requestAnimationFrame()` with a ticking flag to batch DOM updates, and pass `{ passive: true }` to the `addEventListener` options to prevent blocking the compositor thread.
