## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-18 - [Optimize Synchronous Scroll Events]
**Learning:** Synchronous scroll event listeners that directly read layout properties (like `scrollHeight`, `clientHeight`) can cause severe layout thrashing on the main thread, especially when running on every pixel scrolled.
**Action:** Always wrap expensive DOM read/write operations inside scroll event listeners using `window.requestAnimationFrame()` with an `isTicking` flag, and pass `{ passive: true }` to the event listener to prevent main thread blocking.
