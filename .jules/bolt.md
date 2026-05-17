## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).
## 2024-05-18 - Synchronous Scroll Event Listeners
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollHeight`, `clientHeight`) can cause layout thrashing and block the main thread.
**Action:** Optimize these by wrapping the logic in `window.requestAnimationFrame()` with a ticking flag and passing `{ passive: true }` to the event listener options.
