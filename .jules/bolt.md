## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).
## 2026-08-30 - Layout Thrashing in Scroll Events
**Learning:** High-frequency scroll event listeners that synchronously read layout properties (like `scrollTop` and `scrollHeight`) cause severe layout thrashing and block the main thread.
**Action:** Always wrap layout reads/writes in scroll listeners with `requestAnimationFrame` using a ticking flag, and ensure the listener is registered with `{ passive: true }` to allow smooth scrolling.
