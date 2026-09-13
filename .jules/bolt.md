## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).
## 2025-02-12 - Scroll Event Thrashing
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollHeight`, `clientHeight`) can cause layout thrashing because they force the browser to recalculate layouts synchronously on every frame during scrolling.
**Action:** Always optimize scroll listeners by wrapping layout reading and DOM updates within `window.requestAnimationFrame()`, throttling the event with a boolean flag (`isScrolling`), and explicitly using `{ passive: true }` when calling `addEventListener`.
